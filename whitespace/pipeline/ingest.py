"""OpenAlex ingest for the Whitespace corpus (issue #147, PRD sections 11 and 12).

Three steps, all testable offline because every network call goes through an injectable
``fetch(url) -> dict``:

* ``plan``     keyless: counts works per date window so the corpus size and call budget are
               known before anything is downloaded.
* ``download`` cursor-pages each window at 100 per page, archives raw pages under
               ``whitespace/artifacts/`` (git-ignored) and checkpoints finished windows.
* ``build``    rebuilds abstracts, drops short ones, dates and de-duplicates the papers and
               writes ``corpus.jsonl`` plus ``manifest.json`` (query, filters, hashes).

Key safety: the API key is read only from ``OPENALEX_API_KEY`` and added to a request inside
the real fetcher. URLs handed to ``fetch``, logged, archived or put in the manifest never
contain it, and error text is scrubbed before it can surface.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import logging
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Iterable
from pathlib import Path

from .common import normalise_arxiv_id, paper_date

log = logging.getLogger("whitespace.ingest")

API = "https://api.openalex.org/works"
KEY_ENV = "OPENALEX_API_KEY"
DEFAULT_MAILTO = "whitespace-hackathon@users.noreply.github.com"
PER_PAGE = 100
BASIC_LIMIT = 10_000  # basic (non-cursor) paging limit
MIN_WORDS = 50
DEFAULT_ARTIFACTS = Path(__file__).resolve().parents[1] / "artifacts"

SUBFIELD = "1702"  # Artificial Intelligence
TYPES = ("article", "preprint", "conference-paper")
FIRST_YEAR = 2010
SELECT = (
    "id,doi,title,type,publication_year,publication_date,cited_by_count,"
    "abstract_inverted_index,keywords,primary_topic,topics,locations"
)

Fetch = Callable[[str], dict]


class BudgetExceeded(RuntimeError):
    """Raised before a request that would exceed the call budget."""


class FingerprintMismatch(RuntimeError):
    """The plan or finished windows were made with a different query configuration."""


class IncompleteCorpus(RuntimeError):
    """Some planned windows are missing, partial or inconsistent."""


class CallBudget:
    """One shared hard limit on HTTP attempts (retries included)."""

    def __init__(self, limit: int):
        self.limit = limit
        self.used = 0

    def spend(self) -> None:
        if self.used >= self.limit:
            raise BudgetExceeded(f"call budget of {self.limit} HTTP attempts reached")
        self.used += 1


# --------------------------------------------------------------------------- queries


def base_filter(start: str, end: str) -> str:
    """OpenAlex ``filter`` value for one inclusive date window (ISO dates)."""
    return ",".join(
        [
            f"primary_topic.subfield.id:{SUBFIELD}",
            f"from_publication_date:{start}",
            f"to_publication_date:{end}",
            "type:" + "|".join(TYPES),
            "has_abstract:true",
        ]
    )


def build_url(params: dict[str, str], mailto: str = DEFAULT_MAILTO) -> str:
    """A request URL with a polite ``mailto`` and never an API key."""
    query = dict(params)
    query["mailto"] = mailto
    # safe keeps OpenAlex filter punctuation readable; the API accepts it unescaped
    return API + "?" + urllib.parse.urlencode(query, safe=":,|*")


def count_url(window: tuple[str, str], mailto: str = DEFAULT_MAILTO) -> str:
    return build_url({"filter": base_filter(*window), "per_page": "1", "select": "id"}, mailto)


def group_by_year_url(start: str, end: str, mailto: str = DEFAULT_MAILTO) -> str:
    return build_url({"filter": base_filter(start, end), "group_by": "publication_year"}, mailto)


def page_url(window: tuple[str, str], cursor: str, mailto: str = DEFAULT_MAILTO) -> str:
    return build_url(
        {"filter": base_filter(*window), "per_page": str(PER_PAGE), "select": SELECT, "cursor": cursor},
        mailto,
    )


def strip_key(text: str) -> str:
    """Remove any ``api_key`` query parameter (and the live key value) from text."""
    text = re.sub(r"[?&]api_key=[^&\s\"']*", lambda m: "?" if m.group(0)[0] == "?" else "", text)
    text = text.replace("?&", "?").rstrip("?")
    key = os.environ.get(KEY_ENV)
    if key:
        text = text.replace(key, "<redacted>")
    return text


def query_fingerprint(date_scope: tuple[str, str]) -> str:
    """Canonical hash of the query configuration (not the mailto, not the key)."""
    config = {
        "filter_template": base_filter("<start>", "<end>"),
        "types": list(TYPES),
        "subfield": SUBFIELD,
        "date_scope": list(date_scope),
        "select": SELECT,
        "per_page": PER_PAGE,
    }
    return hashlib.sha256(json.dumps(config, sort_keys=True).encode("utf-8")).hexdigest()


def plan_scope(plan: dict) -> tuple[str, str]:
    return min(w["start"] for w in plan["windows"]), max(w["end"] for w in plan["windows"])


def check_plan(plan: dict, legacy: bool = False) -> None:
    """Refuse a plan made with a different query configuration than the current code."""
    fp = plan.get("fingerprint")
    if fp is None:
        if legacy:
            return
        raise FingerprintMismatch("plan.json has no query fingerprint; re-run `plan` (or pass --legacy)")
    if fp != query_fingerprint(plan_scope(plan)):
        raise FingerprintMismatch(
            "plan.json was made with a different query configuration (filter, types, fields or "
            "per_page) than this code; re-run `plan` and use a fresh output directory"
        )


def tolerance(expected: int) -> int:
    """Accepted gap between planned and returned rows: max(5, 0.1 percent)."""
    return max(5, int(expected * 0.001))


# --------------------------------------------------------------------------- windows


def _parse(d: str) -> dt.date:
    return dt.date.fromisoformat(d)


def split_window(window: tuple[str, str]) -> list[tuple[str, str]]:
    """Halve an inclusive date window; a single day cannot be split further."""
    a, b = _parse(window[0]), _parse(window[1])
    if a >= b:
        return [window]
    mid = a + (b - a) // 2
    return [(a.isoformat(), mid.isoformat()), ((mid + dt.timedelta(days=1)).isoformat(), b.isoformat())]


def year_windows(today: dt.date, first_year: int = FIRST_YEAR) -> list[tuple[str, str]]:
    return [
        (f"{y}-01-01", min(dt.date(y, 12, 31), today).isoformat()) for y in range(first_year, today.year + 1)
    ]


def plan_windows(
    fetch: Fetch,
    today: dt.date,
    mailto: str = DEFAULT_MAILTO,
    limit: int = BASIC_LIMIT,
    max_count_requests: int = 30,
    first_year: int = FIRST_YEAR,
) -> dict:
    """Count works per window, splitting adaptively until each is within ``limit``.

    One ``group_by`` request gives the per-year counts; each year over ``limit`` is then
    bisected with one count request per split (the other half is the parent minus the first). Splitting stops when the count-request budget
    is spent; windows still over ``limit`` are flagged ``needs_cursor`` (cursor paging with a
    key handles them whatever their size).
    """
    calls = 0
    start, end = f"{first_year}-01-01", min(dt.date(today.year, 12, 31), today).isoformat()
    groups = fetch(group_by_year_url(start, end, mailto))
    calls += 1
    by_year = {int(g["key"]): int(g["count"]) for g in groups.get("group_by", [])}
    total_all = int(groups.get("meta", {}).get("count", sum(by_year.values())))

    done: list[tuple[tuple[str, str], int]] = []
    queue: list[tuple[tuple[str, str], int]] = []
    for w in year_windows(today, first_year):
        count = by_year.get(int(w[0][:4]), 0)
        if count:
            queue.append((w, count))
    while queue:
        w, count = queue.pop(0)
        if count <= limit or split_window(w) == [w] or calls + 1 > max_count_requests:
            done.append((w, count))
            continue
        left, right = split_window(w)
        c_left = int(fetch(count_url(left, mailto))["meta"]["count"])  # right half = parent - left
        calls += 1
        for half, c in ((left, c_left), (right, count - c_left)):
            if c:
                queue.append((half, c))
    done.sort(key=lambda item: item[0][0])
    windows = [
        {"start": w[0], "end": w[1], "count": c, "needs_cursor": c > limit} for w, c in done
    ]
    total = sum(w["count"] for w in windows)
    scope = (windows[0]["start"], windows[-1]["end"]) if windows else (start, end)
    return {
        "fingerprint": query_fingerprint(scope),
        "filter_template": base_filter("<start>", "<end>"),
        "count_requests": calls,
        "windows": windows,
        "total_works": total,
        "total_works_meta": total_all,
        "list_calls": sum(-(-w["count"] // PER_PAGE) for w in windows),
        "per_page": PER_PAGE,
    }


def format_plan(plan: dict) -> str:
    lines = [f"filter: {plan['filter_template']}", "window                     count  list_calls  note"]
    for w in plan["windows"]:
        calls = -(-w["count"] // PER_PAGE)
        note = "needs cursor (key)" if w["needs_cursor"] else "ok"
        lines.append(f"{w['start']}..{w['end']}  {w['count']:>9,}  {calls:>9,}  {note}")
    lines.append(f"total works: {plan['total_works']:,} (group_by total {plan['total_works_meta']:,})")
    lines.append(f"list calls at {plan['per_page']} per page: {plan['list_calls']:,}")
    lines.append(f"count requests used: {plan['count_requests']}")
    return "\n".join(lines)


# --------------------------------------------------------------------------- real fetcher


def make_fetcher(
    api_key: str | None = None,
    retries: int = 5,
    sleep: Callable[[float], None] = time.sleep,
    opener: Callable[..., object] = urllib.request.urlopen,
    budget: CallBudget | None = None,
) -> Fetch:
    """Real HTTP fetcher. The key is added here only; failures are scrubbed of it."""

    def fetch(url: str) -> dict:
        target = url
        if api_key:
            target += ("&" if "?" in url else "?") + "api_key=" + urllib.parse.quote(api_key)
        delay = 1.0
        for attempt in range(retries + 1):
            if budget is not None:
                budget.spend()  # every HTTP attempt counts, retries included
            try:
                with opener(urllib.request.Request(target, headers={"User-Agent": "whitespace-ingest"}), timeout=60) as r:  # type: ignore[call-arg]
                    return json.loads(r.read().decode("utf-8"))  # type: ignore[attr-defined]
            except urllib.error.HTTPError as exc:
                if (exc.code == 429 or exc.code >= 500) and attempt < retries:
                    log.warning("HTTP %s, retrying in %.0fs: %s", exc.code, delay, url)
                    sleep(delay)
                    delay = min(delay * 2, 60)
                    continue
                raise RuntimeError(f"HTTP {exc.code} for {url}") from None
            except urllib.error.URLError as exc:
                if attempt < retries:
                    log.warning("network error, retrying in %.0fs: %s", delay, url)
                    sleep(delay)
                    delay = min(delay * 2, 60)
                    continue
                raise RuntimeError(f"network error for {url}: {exc.reason}") from None
        raise RuntimeError(f"gave up on {url}")

    fetch.budget = budget  # type: ignore[attr-defined]
    return fetch


# --------------------------------------------------------------------------- download


def _win_name(window: tuple[str, str]) -> str:
    return f"{window[0]}_{window[1]}"


def download(
    fetch: Fetch,
    windows: Iterable[tuple[str, str]],
    out_dir: Path,
    max_calls: int,
    mailto: str = DEFAULT_MAILTO,
    now: Callable[[], dt.datetime] = lambda: dt.datetime.now(dt.timezone.utc),
    expected: dict[tuple[str, str], int] | None = None,
    fingerprint: str | None = None,
) -> dict:
    """Cursor-page every unfinished window.

    A window is finished only when ``done.json`` exists, written after the cursor loop reached
    a terminal cursor and the returned rows are within ``tolerance`` of the planned count.
    Anything else leaves ``partial.json`` and no ``done.json``, so the window is fetched again
    on the next run. HTTP attempts are counted at the request boundary: a fetcher built with
    ``make_fetcher(budget=...)`` counts its own retries; any other fetch is counted per call
    here. Raises ``BudgetExceeded`` before the attempt that would pass the limit.
    """
    windows = list(windows)
    raw = Path(out_dir) / "raw"
    budget = getattr(fetch, "budget", None)
    own = budget is None
    if own:
        budget = CallBudget(max_calls)
    if fingerprint is None and windows:
        fingerprint = query_fingerprint((min(w[0] for w in windows), max(w[1] for w in windows)))
    incomplete = []
    for window in windows:
        wdir = raw / _win_name(window)
        old = wdir / "done.json"
        if old.exists():
            prev = json.loads(old.read_text(encoding="utf-8")).get("fingerprint")
            if prev is not None and prev != fingerprint:
                raise FingerprintMismatch(f"window {_win_name(window)} was downloaded with a different query")
            continue
        if wdir.exists():
            for f in wdir.glob("*"):
                f.unlink()
        wdir.mkdir(parents=True, exist_ok=True)
        cursor, n, pages, results = "*", 0, [], 0
        terminal, body = False, {}
        while cursor:
            if own:
                budget.spend()
            url = page_url(window, cursor, mailto)
            body = fetch(url)
            n += 1
            data = json.dumps(body, sort_keys=True, separators=(",", ":")).encode("utf-8")
            (wdir / f"page_{n:05d}.json").write_bytes(data)
            got = len(body.get("results", []))
            results += got
            pages.append(
                {
                    "file": f"page_{n:05d}.json",
                    "url": strip_key(url),
                    "retrieved_at": now().isoformat(),
                    "result_count": got,
                    "sha256": hashlib.sha256(data).hexdigest(),
                }
            )
            cursor = body.get("meta", {}).get("next_cursor") if got else None
            terminal = not body.get("meta", {}).get("next_cursor") and got > 0
        meta_count = int(body.get("meta", {}).get("count", results))
        exp = (expected or {}).get(window, meta_count)
        delta = results - exp
        if terminal and abs(delta) <= tolerance(exp):
            done = {
                "window": list(window),
                "fingerprint": fingerprint,
                "expected_count": exp,
                "returned": results,
                "delta": delta,
                "terminal_cursor": True,
                "meta_count": meta_count,
                "results": results,
                "pages": pages,
            }
            (wdir / "done.json").write_text(json.dumps(done, indent=1), encoding="utf-8")
            log.info("window %s done: %d results (expected %d), %d pages", _win_name(window), results, exp, n)
        else:
            info = {"window": list(window), "expected_count": exp, "returned": results,
                    "delta": delta, "terminal_cursor": terminal}
            (wdir / "partial.json").write_text(json.dumps(info, indent=1), encoding="utf-8")
            log.warning("window %s INCOMPLETE: expected %d, returned %d, terminal cursor %s",
                        _win_name(window), exp, results, terminal)
            incomplete.append(_win_name(window))
    return {"calls": budget.used, "incomplete": incomplete}


def verify(out_dir: Path, plan: dict | None, legacy: bool = False) -> dict:
    """Read-only check of every planned window against its ``done.json``.

    Statuses: ok, legacy (earlier format, accepted only with ``legacy=True``), missing,
    incomplete, fingerprint, not_terminal, delta.
    """
    raw = Path(out_dir) / "raw"
    if plan is not None:
        items = [((w["start"], w["end"]), w["count"]) for w in plan["windows"]]
        want = plan.get("fingerprint")
    else:
        names = sorted({d.parent.name for d in list(raw.glob("*/done.json")) + list(raw.glob("*/partial.json"))})
        items = [(tuple(n.split("_")), None) for n in names]
        want = None
    rows = []
    for window, planned in items:
        wdir = raw / _win_name(window)
        row = {"window": _win_name(window), "status": "ok", "expected": planned, "returned": None, "delta": None}
        done = wdir / "done.json"
        if not done.exists():
            row["status"] = "incomplete" if (wdir / "partial.json").exists() else "missing"
            rows.append(row)
            continue
        d = json.loads(done.read_text(encoding="utf-8"))
        returned = d.get("returned", d.get("results"))
        exp = planned if planned is not None else d.get("expected_count", d.get("meta_count"))
        row.update(expected=exp, returned=returned, delta=returned - exp)
        if "fingerprint" not in d or "terminal_cursor" not in d:
            row["status"] = "legacy" if legacy else "fingerprint"
        elif want is not None and d["fingerprint"] != want:
            row["status"] = "fingerprint"
        elif not d["terminal_cursor"]:
            row["status"] = "not_terminal"
        if row["status"] in ("ok", "legacy") and abs(row["delta"]) > tolerance(exp):
            row["status"] = "delta"
        rows.append(row)
    fps = {json.loads(d.read_text(encoding="utf-8")).get("fingerprint") for d in raw.glob("*/done.json")} - {None}
    if len(fps) > 1:
        for r in rows:
            if r["status"] == "ok":
                r["status"] = "fingerprint"
    counts: dict[str, int] = {}
    for r in rows:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    ok = bool(rows) and all(r["status"] == "ok" or (legacy and r["status"] == "legacy") for r in rows)
    return {"ok": ok, "windows": rows, "summary": counts}


def format_verify(report: dict) -> str:
    lines = [f"{r['window']}  {r['status']:<12} expected={r['expected']} returned={r['returned']} delta={r['delta']}"
             for r in report["windows"]]
    lines.append("summary: " + ", ".join(f"{k}={v}" for k, v in sorted(report["summary"].items())))
    lines.append("VERIFIED" if report["ok"] else "NOT VERIFIED")
    return "\n".join(lines)


# --------------------------------------------------------------------------- records


def reconstruct_abstract(inverted: dict[str, list[int]] | None) -> str:
    """Rebuild abstract text from OpenAlex ``abstract_inverted_index``."""
    if not inverted:
        return ""
    slots: dict[int, str] = {}
    for word, positions in inverted.items():
        for p in positions:
            slots[p] = word
    return " ".join(slots[p] for p in sorted(slots))


_ARXIV_URL = re.compile(r"arxiv\.org/(?:abs|pdf)/([^?#\s]+?)(?:\.pdf)?(?:[?#].*)?$", re.I)
_ARXIV_DOI = re.compile(r"10\.48550/arxiv\.(.+)$", re.I)


def arxiv_id_of(work: dict) -> str | None:
    """arXiv id from an arXiv DOI, else from a location URL. ``None`` if neither."""
    doi = work.get("doi") or ""
    m = _ARXIV_DOI.search(doi)
    if m:
        return normalise_arxiv_id(m.group(1))
    for loc in work.get("locations") or []:
        for field in ("landing_page_url", "pdf_url"):
            m = _ARXIV_URL.search(loc.get(field) or "")
            if m:
                return normalise_arxiv_id(m.group(1))
    return None


def to_record(work: dict, min_words: int = MIN_WORDS) -> dict | None:
    """One paper record, or ``None`` if the abstract is missing or under ``min_words`` words."""
    abstract = reconstruct_abstract(work.get("abstract_inverted_index"))
    if len(abstract.split()) < min_words:
        return None
    arxiv = arxiv_id_of(work)
    fallback = None
    if work.get("publication_date"):
        fallback = dt.date.fromisoformat(work["publication_date"])
    elif work.get("publication_year"):
        fallback = dt.date(int(work["publication_year"]), 1, 1)
    try:
        date = paper_date(arxiv, fallback)
    except ValueError:
        return None
    topic = work.get("primary_topic") or {}
    return {
        "id": work["id"],
        "arxiv_id": arxiv,
        "year": date.year,
        "date": date.isoformat(),
        "title": work.get("title") or "",
        "abstract": abstract,
        "cites": work.get("cited_by_count"),
        "keywords": [k.get("display_name") for k in work.get("keywords") or [] if k.get("display_name")],
        "topic_id": topic.get("id"),
        "type": work.get("type"),
    }


def dedupe(records: Iterable[dict]) -> list[dict]:
    """One record per arXiv id (own arXiv-DOI record preferred, then lowest id); no-arXiv records
    are kept, de-duplicated by OpenAlex id."""
    best: dict[str, dict] = {}
    for r in records:
        key = r["arxiv_id"] or r["id"]
        cur = best.get(key)
        if cur is None or _rank(r) < _rank(cur):
            best[key] = r
    return sorted(best.values(), key=lambda r: r["id"])


def _rank(r: dict) -> tuple[bool, str]:
    return (r.get("type") != "preprint", r["id"])


def iter_raw_works(out_dir: Path) -> Iterable[dict]:
    for done in sorted((Path(out_dir) / "raw").glob("*/done.json")):
        for page in json.loads(done.read_text(encoding="utf-8"))["pages"]:
            body = json.loads((done.parent / page["file"]).read_text(encoding="utf-8"))
            yield from body.get("results", [])


def build_corpus(out_dir: Path, retrieved: str, plan: dict | None = None, legacy: bool = False) -> dict:
    """Write ``corpus.jsonl`` and ``manifest.json`` from archived pages; return the manifest.

    Refuses missing, partial or fingerprint-mismatched windows (see ``verify``).
    """
    out_dir = Path(out_dir)
    if plan is not None:
        check_plan(plan, legacy)
    report = verify(out_dir, plan, legacy)
    if not report["ok"]:
        bad = [f"{r['window']}={r['status']}" for r in report["windows"]
               if not (r["status"] == "ok" or (legacy and r["status"] == "legacy"))]
        raise IncompleteCorpus("refusing to build: " + (", ".join(bad) or "no finished windows"))
    seen = kept = 0
    records = []
    for w in iter_raw_works(out_dir):
        seen += 1
        rec = to_record(w)
        if rec:
            records.append(rec)
            kept += 1
    final = dedupe(records)
    with open(out_dir / "corpus.jsonl", "w", encoding="utf-8") as f:
        for r in final:
            f.write(json.dumps(r, sort_keys=True) + "\n")
    inputs = {}
    windows = []
    for done in sorted((out_dir / "raw").glob("*/done.json")):
        d = json.loads(done.read_text(encoding="utf-8"))
        windows.append({"window": d["window"], "meta_count": d["meta_count"], "results": d["results"],
                        "expected_count": d.get("expected_count"), "fingerprint": d.get("fingerprint")})
        for p in d["pages"]:
            inputs[f"{done.parent.name}/{p['file']}"] = {
                "url": strip_key(p["url"]),
                "retrieved_at": p["retrieved_at"],
                "result_count": p["result_count"],
                "sha256": p["sha256"],
            }
    manifest = {
        "endpoint": API,
        "filter_template": base_filter("<start>", "<end>"),
        "subfield": SUBFIELD,
        "types": list(TYPES),
        "first_year": FIRST_YEAR,
        "per_page": PER_PAGE,
        "select": SELECT,
        "retrieval_date": retrieved,
        "topic_assignment_vintage": (
            "OpenAlex primary-topic assignments as served on the retrieval date; the topic classifier "
            "changed in Oct 2026 and v1 assignments stay frozen until 13 Jan 2027, so these are not "
            "as-of-origin classifications"
        ),
        "rules": {
            "abstract": "rebuilt from abstract_inverted_index; works under %d words dropped" % MIN_WORDS,
            "date": "arXiv-id month if present (common.paper_date), else OpenAlex publication_date",
            "arxiv_id": "arXiv DOI 10.48550/arxiv.<id>, else arxiv.org location URL",
            "dedup": "one record per arXiv id; works without one kept by OpenAlex id",
        },
        "windows": windows,
        "counts": {"works_seen": seen, "kept_after_abstract_rule": kept, "after_dedup": len(final)},
        "corpus_sha256": hashlib.sha256((out_dir / "corpus.jsonl").read_bytes()).hexdigest(),
        "input_pages": inputs,
    }
    if plan is not None:
        manifest["plan"] = plan
    text = json.dumps(manifest, indent=1)
    key = os.environ.get(KEY_ENV)
    if key and key in text:
        raise RuntimeError("refusing to write a manifest containing the API key")
    (out_dir / "manifest.json").write_text(text, encoding="utf-8")
    return manifest


# --------------------------------------------------------------------------- CLI


def planning_end(today: dt.date, through_year: int | None) -> dt.date:
    """The last day to plan for: ``today``, or 31 December of ``through_year`` if that is earlier."""
    if through_year is None:
        return today
    return min(today, dt.date(through_year, 12, 31))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="OpenAlex ingest for Whitespace")
    ap.add_argument("command", choices=["plan", "download", "build", "verify"])
    ap.add_argument("--out", type=Path, default=DEFAULT_ARTIFACTS)
    ap.add_argument("--mailto", default=DEFAULT_MAILTO)
    ap.add_argument("--max-calls", type=int, default=10_000, help="download call budget")
    ap.add_argument("--legacy", action="store_true",
                    help="accept done.json files from the earlier version (no fingerprint or terminal flag)")
    ap.add_argument("--through-year", type=int, default=None,
                    help="plan and download only publication years up to this year (inclusive)")
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    today = dt.datetime.now(dt.timezone.utc).date()

    if args.command == "plan":
        plan = plan_windows(make_fetcher(None), planning_end(today, args.through_year), args.mailto)
        print(format_plan(plan))
        args.out.mkdir(parents=True, exist_ok=True)
        (args.out / "plan.json").write_text(json.dumps(plan, indent=1), encoding="utf-8")
        return 0
    if args.command == "download":
        key = os.environ.get(KEY_ENV)
        if not key:
            print(f"{KEY_ENV} is not set; cursor paging needs a free OpenAlex key.", file=sys.stderr)
            return 2
        plan_file = args.out / "plan.json"
        if not plan_file.exists():
            print("run `plan` first", file=sys.stderr)
            return 2
        plan = json.loads(plan_file.read_text(encoding="utf-8"))
        try:
            check_plan(plan, args.legacy)
        except FingerprintMismatch as exc:
            print(str(exc), file=sys.stderr)
            return 2
        windows = [(w["start"], w["end"]) for w in plan["windows"]]
        expected = {(w["start"], w["end"]): w["count"] for w in plan["windows"]}
        fetch = make_fetcher(key, budget=CallBudget(args.max_calls))
        try:
            res = download(fetch, windows, args.out, args.max_calls, args.mailto,
                           expected=expected, fingerprint=plan.get("fingerprint"))
        except BudgetExceeded as exc:
            print(f"stopped: {exc}. Re-run to resume.", file=sys.stderr)
            return 3
        except FingerprintMismatch as exc:
            print(str(exc), file=sys.stderr)
            return 2
        print(f"download finished: {res['calls']} HTTP attempts; incomplete windows: {res['incomplete'] or 'none'}")
        return 0 if not res["incomplete"] else 4
    if args.command == "verify":
        plan_file = args.out / "plan.json"
        plan = json.loads(plan_file.read_text(encoding="utf-8")) if plan_file.exists() else None
        try:
            if plan is not None:
                check_plan(plan, args.legacy)
        except FingerprintMismatch as exc:
            print(str(exc), file=sys.stderr)
            return 2
        report = verify(args.out, plan, args.legacy)
        print(format_verify(report))
        return 0 if report["ok"] else 1
    plan_file = args.out / "plan.json"
    plan = json.loads(plan_file.read_text(encoding="utf-8")) if plan_file.exists() else None
    try:
        manifest = build_corpus(args.out, today.isoformat(), plan, args.legacy)
    except (IncompleteCorpus, FingerprintMismatch) as exc:
        print(str(exc), file=sys.stderr)
        return 2
    print(json.dumps(manifest["counts"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
