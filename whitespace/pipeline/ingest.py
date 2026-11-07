"""OpenAlex ingest for the Whitespace corpus (issue #147, PRD sections 11 and 12).

Three steps, all testable offline because every network call goes through an injectable
``fetch(url) -> dict``:

* ``plan``     keyless: counts works per date window so the corpus size and call budget are
               known before anything is downloaded.
* ``download`` cursor-pages each window at 100 per page, archives raw pages under
               ``whitespace/artifacts/`` (git-ignored) and checkpoints finished windows.
* ``build``    rebuilds abstracts, drops short ones, dates and de-duplicates the papers and
               writes ``corpus.jsonl`` plus ``manifest.json`` (query, filters, hashes).

Sampling mode (issue #152): ``plan``/``download`` with ``--sample-fraction F --seed S`` draw a
seeded uniform sample with the OpenAlex ``sample`` and ``seed`` parameters and ordinary ``page=``
paging (works without a key; a key is still read from the environment if set). The fraction is
the same for every window and year; per-year overrides are refused.

Key safety: the API key is read only from ``OPENALEX_API_KEY`` and added to a request inside
the real fetcher. URLs handed to ``fetch``, logged, archived or put in the manifest never
contain it, and error text is scrubbed before it can surface.
"""
from __future__ import annotations

import argparse
import datetime as dt
import decimal
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
    return {
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


# --------------------------------------------------------------------------- sampling

SAMPLE_RULE = (
    "uniform random sample drawn per query with OpenAlex sample=N&seed=S and page= paging; N = "
    "round-half-up(F * works in the window); one fraction F for every window and year, never a "
    "per-year value; windows whose sample would exceed %d are split on month boundaries (then "
    "days), each with the same F, so a year's size is the sum of its windows' sizes" % BASIC_LIMIT
)


def parse_fraction(value) -> float:
    """A single global fraction in (0, 1]. Anything that looks like a per-year value is refused."""
    if isinstance(value, (dict, list, tuple, set)):
        raise ValueError("per-year sampling fractions are refused: use one fraction for every year")
    if isinstance(value, str):
        if any(c in value for c in "=,:;"):
            raise ValueError("per-year sampling fractions are refused: use one fraction for every year")
        value = float(value)
    f = float(value)
    if not 0 < f <= 1:
        raise ValueError(f"sample fraction must be in (0, 1], got {f}")
    return f


def sample_size(fraction: float, count: int) -> int:
    """``round(F * count)``, halves rounded up (deterministic, not banker's rounding)."""
    exact = decimal.Decimal(repr(fraction)) * count
    return int(exact.quantize(decimal.Decimal(1), rounding=decimal.ROUND_HALF_UP))


def split_window_months(window: tuple[str, str]) -> list[tuple[str, str]]:
    """Halve a window at a month boundary; inside a single month fall back to ``split_window``."""
    a, b = _parse(window[0]), _parse(window[1])
    firsts = []
    d = (a.replace(day=1) + dt.timedelta(days=32)).replace(day=1)
    while d <= b:
        firsts.append(d)
        d = (d + dt.timedelta(days=32)).replace(day=1)
    if not firsts:
        return split_window(window)
    cut = firsts[(len(firsts) - 1) // 2]  # first day of the right half
    return [(a.isoformat(), (cut - dt.timedelta(days=1)).isoformat()), (cut.isoformat(), b.isoformat())]


def sample_page_url(
    window: tuple[str, str], size: int, seed: int, page: int, mailto: str = DEFAULT_MAILTO
) -> str:
    """Sampled list request: ``sample``/``seed`` with ordinary ``page`` paging, never a cursor."""
    return build_url(
        {
            "filter": base_filter(*window),
            "sample": str(size),
            "seed": str(seed),
            "per_page": str(PER_PAGE),
            "select": SELECT,
            "page": str(page),
        },
        mailto,
    )


def plan_sample(
    fetch: Fetch,
    today: dt.date,
    fraction,
    seed: int,
    mailto: str = DEFAULT_MAILTO,
    limit: int = BASIC_LIMIT,
    max_count_requests: int = 30,
    first_year: int = FIRST_YEAR,
) -> dict:
    """Plan a uniform sample: one window per year, split only while its sample exceeds ``limit``."""
    fraction = parse_fraction(fraction)
    calls = 0
    start, end = f"{first_year}-01-01", min(dt.date(today.year, 12, 31), today).isoformat()
    groups = fetch(group_by_year_url(start, end, mailto))
    calls += 1
    by_year = {int(g["key"]): int(g["count"]) for g in groups.get("group_by", [])}
    total_all = int(groups.get("meta", {}).get("count", sum(by_year.values())))

    queue = [(w, by_year[int(w[0][:4])]) for w in year_windows(today, first_year) if by_year.get(int(w[0][:4]))]
    done: list[tuple[tuple[str, str], int]] = []
    while queue:
        w, count = queue.pop(0)
        if (
            sample_size(fraction, count) <= limit
            or split_window_months(w) == [w]
            or calls + 1 > max_count_requests
        ):
            done.append((w, count))
            continue
        left, right = split_window_months(w)
        c_left = int(fetch(count_url(left, mailto))["meta"]["count"])  # right half = parent - left
        calls += 1
        for half, c in ((left, c_left), (right, count - c_left)):
            if c:
                queue.append((half, c))
    done.sort(key=lambda item: item[0][0])
    windows = [
        {
            "start": w[0],
            "end": w[1],
            "year": int(w[0][:4]),
            "count": c,
            "sample_size": sample_size(fraction, c),
            "over_cap": sample_size(fraction, c) > limit,
        }
        for w, c in done
    ]
    return {
        "filter_template": base_filter("<start>", "<end>"),
        "sampling": {"fraction": fraction, "seed": int(seed), "rule": SAMPLE_RULE},
        "count_requests": calls,
        "windows": windows,
        "total_works": sum(w["count"] for w in windows),
        "total_works_meta": total_all,
        "total_sample": sum(w["sample_size"] for w in windows),
        "list_calls": sum(-(-w["sample_size"] // PER_PAGE) for w in windows),
        "per_page": PER_PAGE,
    }


def check_sample_plan(plan: dict, fraction, seed: int) -> None:
    """Refuse a plan whose fraction/seed differ from the request or whose window sizes are not
    ``round(F * count)`` for the one global F (a hand-edited per-year override)."""
    fraction = parse_fraction(fraction)
    s = plan.get("sampling")
    if not s:
        raise ValueError("plan.json is not a sampling plan: run `plan --sample-fraction F --seed S`")
    if s["fraction"] != fraction or s["seed"] != int(seed):
        raise ValueError("plan.json was made with a different fraction or seed")
    for w in plan["windows"]:
        if w["sample_size"] != sample_size(fraction, w["count"]):
            raise ValueError(
                f"window {w['start']}..{w['end']} does not use the global fraction "
                "(per-year overrides are refused)"
            )
        if w["sample_size"] > BASIC_LIMIT:
            raise ValueError(f"window {w['start']}..{w['end']} samples more than {BASIC_LIMIT}; re-plan")


def format_sample_plan(plan: dict) -> str:
    s = plan["sampling"]
    lines = [
        f"filter: {plan['filter_template']}",
        f"sampling: fraction {s['fraction']} (same for every year), seed {s['seed']}",
        f"rule: {s['rule']}",
        "year      works  sample_size  queries  list_calls",
    ]
    for y in sorted({w["year"] for w in plan["windows"]}):
        ws = [w for w in plan["windows"] if w["year"] == y]
        lines.append(
            f"{y}  {sum(w['count'] for w in ws):>9,}  {sum(w['sample_size'] for w in ws):>11,}  "
            f"{len(ws):>7}  {sum(-(-w['sample_size'] // PER_PAGE) for w in ws):>10,}"
        )
    lines.append("queries (window, works, sample size):")
    for w in plan["windows"]:
        flag = "  OVER 10,000 CAP" if w["over_cap"] else ""
        lines.append(f"  {w['start']}..{w['end']}  {w['count']:>9,}  {w['sample_size']:>7,}{flag}")
    lines.append(f"total works: {plan['total_works']:,} (group_by total {plan['total_works_meta']:,})")
    lines.append(f"total sample: {plan['total_sample']:,} in {len(plan['windows'])} queries")
    lines.append(f"total list calls at {plan['per_page']} per page: {plan['list_calls']:,}")
    lines.append(f"count requests used: {plan['count_requests']}")
    return "\n".join(lines)


# --------------------------------------------------------------------------- real fetcher


def make_fetcher(
    api_key: str | None = None,
    retries: int = 5,
    sleep: Callable[[float], None] = time.sleep,
    opener: Callable[..., object] = urllib.request.urlopen,
) -> Fetch:
    """Real HTTP fetcher. The key is added here only; failures are scrubbed of it."""

    def fetch(url: str) -> dict:
        target = url
        if api_key:
            target += ("&" if "?" in url else "?") + "api_key=" + urllib.parse.quote(api_key)
        delay = 1.0
        for attempt in range(retries + 1):
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
) -> dict:
    """Cursor-page every unfinished window. Finished windows (``done.json``) are skipped.

    An interrupted window is restarted from its first page. Raises ``BudgetExceeded`` before
    the request that would pass ``max_calls``; finished windows stay finished.
    """
    raw = Path(out_dir) / "raw"
    calls = 0
    for window in windows:
        wdir = raw / _win_name(window)
        if (wdir / "done.json").exists():
            continue
        if wdir.exists():
            for f in wdir.glob("*"):
                f.unlink()
        wdir.mkdir(parents=True, exist_ok=True)
        cursor, n, pages, results = "*", 0, [], 0
        while cursor:
            if calls >= max_calls:
                raise BudgetExceeded(f"call budget of {max_calls} reached in window {_win_name(window)}")
            url = page_url(window, cursor, mailto)
            body = fetch(url)
            calls += 1
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
        done = {
            "window": list(window),
            "meta_count": int(body.get("meta", {}).get("count", results)),
            "results": results,
            "pages": pages,
        }
        (wdir / "done.json").write_text(json.dumps(done, indent=1), encoding="utf-8")
        log.info("window %s done: %d results, %d pages", _win_name(window), results, n)
    return {"calls": calls}


def download_sampled(
    fetch: Fetch,
    plan: dict,
    out_dir: Path,
    max_calls: int,
    mailto: str = DEFAULT_MAILTO,
    now: Callable[[], dt.datetime] = lambda: dt.datetime.now(dt.timezone.utc),
) -> dict:
    """Page every unfinished sampled window with ``sample``/``seed``/``page`` (never a cursor).

    Same resume and budget rules as ``download``. A finished window made with a different
    fraction, seed or size is refused, so two samples never mix in one directory.
    """
    sampling = plan["sampling"]
    check_sample_plan(plan, sampling["fraction"], sampling["seed"])
    raw = Path(out_dir) / "raw"
    calls = 0
    for w in plan["windows"]:
        window = (w["start"], w["end"])
        want = {"fraction": sampling["fraction"], "seed": sampling["seed"], "requested": w["sample_size"]}
        wdir = raw / _win_name(window)
        if (wdir / "done.json").exists():
            have = json.loads((wdir / "done.json").read_text(encoding="utf-8")).get("sample")
            if have != want:
                raise ValueError(f"window {_win_name(window)} was downloaded with different sampling")
            continue
        if wdir.exists():
            for f in wdir.glob("*"):
                f.unlink()
        wdir.mkdir(parents=True, exist_ok=True)
        pages, results, body = [], 0, {}
        for n in range(1, -(-w["sample_size"] // PER_PAGE) + 1):
            if calls >= max_calls:
                raise BudgetExceeded(f"call budget of {max_calls} reached in window {_win_name(window)}")
            url = sample_page_url(window, w["sample_size"], sampling["seed"], n, mailto)
            body = fetch(url)
            calls += 1
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
            if not got:
                break
        done = {
            "window": list(window),
            "meta_count": int(body.get("meta", {}).get("count", results)),
            "results": results,
            "returned": results,
            "sample": want,
            "pages": pages,
        }
        (wdir / "done.json").write_text(json.dumps(done, indent=1), encoding="utf-8")
        log.info("sample window %s done: requested %d, returned %d", _win_name(window), w["sample_size"], results)
    return {"calls": calls}


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


def build_corpus(out_dir: Path, retrieved: str, plan: dict | None = None) -> dict:
    """Write ``corpus.jsonl`` and ``manifest.json`` from archived pages; return the manifest."""
    out_dir = Path(out_dir)
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
    samples: list[dict] = []
    for done in sorted((out_dir / "raw").glob("*/done.json")):
        d = json.loads(done.read_text(encoding="utf-8"))
        entry = {"window": d["window"], "meta_count": d["meta_count"], "results": d["results"]}
        if "sample" in d:
            entry["requested"] = d["sample"]["requested"]
            entry["returned"] = d["returned"]
            samples.append(d["sample"])
        windows.append(entry)
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
    if samples:
        if len(samples) != len(windows):
            raise ValueError("sampled and unsampled windows are mixed in one directory")
        if len({(x["fraction"], x["seed"]) for x in samples}) != 1:
            raise ValueError("windows were sampled with different fractions or seeds")
        manifest["sampling"] = {
            "fraction": samples[0]["fraction"],
            "seed": samples[0]["seed"],
            "rule": SAMPLE_RULE,
            "requested_total": sum(x["requested"] for x in samples),
            "returned_total": sum(w["returned"] for w in windows),
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
    ap.add_argument("command", choices=["plan", "download", "build"])
    ap.add_argument("--out", type=Path, default=DEFAULT_ARTIFACTS)
    ap.add_argument("--mailto", default=DEFAULT_MAILTO)
    ap.add_argument("--max-calls", type=int, default=10_000, help="download call budget")
    ap.add_argument("--sample-fraction", help="one fraction for every year, e.g. 0.1 (seeded uniform sample)")
    ap.add_argument("--seed", type=int, help="sampling seed (required with --sample-fraction)")
    ap.add_argument("--through-year", type=int, default=None,
                    help="plan and download only publication years up to this year (inclusive)")
    args = ap.parse_args(argv)
    fraction = None
    if args.command != "build" and (args.sample_fraction is not None or args.seed is not None):
        try:
            if args.sample_fraction is None or args.seed is None:
                raise ValueError("--sample-fraction and --seed must be given together")
            fraction = parse_fraction(args.sample_fraction)
        except ValueError as exc:
            print(str(exc), file=sys.stderr)
            return 2
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    today = dt.datetime.now(dt.timezone.utc).date()

    if args.command == "plan":
        end = planning_end(today, args.through_year)
        if fraction is not None:
            plan = plan_sample(make_fetcher(None), end, fraction, args.seed, args.mailto)
            print(format_sample_plan(plan))
        else:
            plan = plan_windows(make_fetcher(None), end, args.mailto)
            print(format_plan(plan))
        args.out.mkdir(parents=True, exist_ok=True)
        (args.out / "plan.json").write_text(json.dumps(plan, indent=1), encoding="utf-8")
        return 0
    if args.command == "download":
        key = os.environ.get(KEY_ENV)
        if not key and fraction is None:
            print(f"{KEY_ENV} is not set; cursor paging needs a free OpenAlex key.", file=sys.stderr)
            return 2
        plan_file = args.out / "plan.json"
        if not plan_file.exists():
            print("run `plan` first", file=sys.stderr)
            return 2
        plan = json.loads(plan_file.read_text(encoding="utf-8"))
        if fraction is None and plan.get("sampling"):
            print("plan.json is a sampling plan: pass --sample-fraction and --seed", file=sys.stderr)
            return 2
        if fraction is not None:
            try:
                check_sample_plan(plan, fraction, args.seed)
                res = download_sampled(make_fetcher(key), plan, args.out, args.max_calls, args.mailto)
            except ValueError as exc:
                print(str(exc), file=sys.stderr)
                return 2
            except BudgetExceeded as exc:
                print(f"stopped: {exc}. Re-run to resume.", file=sys.stderr)
                return 3
            print(f"sampled download complete: {res['calls']} calls")
            return 0
        windows = [(w["start"], w["end"]) for w in plan["windows"]]
        try:
            res = download(make_fetcher(key), windows, args.out, args.max_calls, args.mailto)
        except BudgetExceeded as exc:
            print(f"stopped: {exc}. Re-run to resume.", file=sys.stderr)
            return 3
        print(f"download complete: {res['calls']} calls")
        return 0
    plan_file = args.out / "plan.json"
    plan = json.loads(plan_file.read_text(encoding="utf-8")) if plan_file.exists() else None
    manifest = build_corpus(args.out, today.isoformat(), plan)
    print(json.dumps(manifest["counts"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
