"""Papers with Code coverage layer and hand-check tooling (issue #142).

Wording rule: a paper without a link here has *no linked code in this archive*. It never means
"no code exists". The archive is a frozen 28 Jul 2025 snapshot, so every rate is a lower bound.

Parts:
1. ``load_links`` reads a LOCAL copy of the pinned links file and builds a manifest.
2. The OpenAlex join: ``openalex_filter_urls`` (pure), ``resolve_arxiv_ids`` (injected ``fetch``),
   ``work_arxiv_id`` (maps a work through ``locations`` or an arXiv DOI only), and
   ``make_polite_fetcher`` (real keyless fetcher, not used in CI).
3. ``coverage_table`` per (concept, year) with an archive-coverage state from the pinned file.
4. Hand-check tooling: ``build_frame``, ``wilson_interval``, ``TEMPLATE_COLUMNS``.
"""
from __future__ import annotations

import csv
import datetime as dt
import hashlib
import json
import math
import random
import re
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from collections.abc import Callable, Iterable, Mapping, Sequence

from .common import arxiv_month, normalise_arxiv_id, paper_date

PWC_DATASET = "pwc-archive/links-between-paper-and-code"
PWC_SOURCE_URL = "https://huggingface.co/datasets/" + PWC_DATASET
PWC_LICENCE = "cc-by-sa-4.0"
PWC_ATTRIBUTION = (
    "Links between papers and code: Papers with Code archive (pwc-archive), snapshot retrieved "
    "2025-07-28, licensed CC-BY-SA-4.0. Derived tables must carry the same licence."
)
PWC_CARD_ROWS = 300_161
PWC_ARCHIVE_DATE = dt.date(2025, 7, 28)
PWC_COLUMNS = (
    "paper_url", "paper_title", "paper_arxiv_id", "paper_url_abs", "paper_url_pdf",
    "repo_url", "is_official", "mentioned_in_paper", "mentioned_in_github", "framework",
)

OPENALEX_WORKS = "https://api.openalex.org/works"
BATCH_SIZE = 50
JOIN_DOI = "arxiv-doi"  # work's own DOI is the arXiv DOI
JOIN_MERGED = "arxiv-doi-merged-record"  # own DOI is a journal DOI; arXiv id is on a location
JOIN_TITLE = "title-fallback"
JOIN_METHODS = (JOIN_DOI, JOIN_MERGED, JOIN_TITLE)

YEAR_BANDS = ("<=2017", "2018-2020", "2021-2023", "2024-2025")

TEMPLATE_COLUMNS = (
    "row_id", "pwc_title", "pwc_first_author", "pwc_year", "pwc_arxiv_id", "pwc_code_url",
    "oa_work_id", "oa_title", "oa_doi", "oa_pub_date", "join_method", "stratum",
    "code_link_present", "checker1_label", "checker1_note", "checker2_label", "final_label",
    "reason_if_false",
)


# --- 1. Loader -------------------------------------------------------------------------------


def read_links(path: str) -> list[dict]:
    """Read a local ``.parquet`` or ``.csv`` links file into a list of row dicts."""
    if str(path).lower().endswith(".parquet"):
        try:
            import pyarrow.parquet as pq
        except ImportError as exc:  # pragma: no cover - depends on the environment
            raise RuntimeError("reading parquet needs pyarrow: pip install pyarrow (or pass a CSV)") from exc
        return pq.read_table(path).to_pylist()
    with open(path, newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def file_sha256(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_links(path: str, revision: str) -> tuple[list[dict], dict]:
    """Load the pinned links file from ``path`` and return ``(rows, manifest)``.

    ``revision`` is the Hugging Face dataset commit SHA the caller downloaded; it is recorded,
    not checked. The file is never downloaded or copied by this module.
    """
    rows = read_links(path)
    ids = {normalise_arxiv_id(row.get("paper_arxiv_id")) for row in rows}
    ids.discard(None)
    manifest = {
        "source_url": PWC_SOURCE_URL,
        "dataset_revision": revision,
        "file_sha256": file_sha256(path),
        "rows": len(rows),
        "card_rows": PWC_CARD_ROWS,
        "distinct_arxiv_ids": len(ids),
        "rows_without_arxiv_id": sum(1 for row in rows if not normalise_arxiv_id(row.get("paper_arxiv_id"))),
        "archive_date": PWC_ARCHIVE_DATE.isoformat(),
        "licence": PWC_LICENCE,
        "attribution": PWC_ATTRIBUTION,
    }
    return rows, manifest


def linked_ids(rows: Iterable[Mapping]) -> set[str]:
    """Normalised arXiv ids that have at least one archive link."""
    found = {normalise_arxiv_id(row.get("paper_arxiv_id")) for row in rows}
    found.discard(None)
    return found


# --- 2. OpenAlex join ------------------------------------------------------------------------

_ARXIV_URL = re.compile(r"arxiv\.org/(?:abs|pdf)/(.+?)(?:\.pdf)?/?$", re.IGNORECASE)
_ARXIV_DOI = re.compile(r"10\.48550/arxiv\.(.+)$", re.IGNORECASE)


def arxiv_id_from_url(url: str | None) -> str | None:
    """arXiv id from an ``arxiv.org/abs/...`` or ``/pdf/...`` URL, versionless, lower-case."""
    if not url:
        return None
    match = _ARXIV_URL.search(url.strip().split("?")[0].split("#")[0])
    return normalise_arxiv_id(match.group(1)) if match else None


def arxiv_id_from_doi(doi: str | None) -> str | None:
    """arXiv id from an arXiv DOI (``10.48550/arXiv.<id>``); ``None`` for any other DOI."""
    if not doi:
        return None
    match = _ARXIV_DOI.search(doi.strip())
    return normalise_arxiv_id(match.group(1)) if match else None


def openalex_filter_urls(arxiv_ids: Iterable[str], mailto: str | None = None, batch_size: int = BATCH_SIZE) -> list[str]:
    """Batched OpenAlex URLs, at most ``batch_size`` (<= 50) arXiv DOIs per call. Pure function."""
    if not 1 <= batch_size <= BATCH_SIZE:
        raise ValueError(f"batch_size must be between 1 and {BATCH_SIZE}")
    ids = sorted({i for i in map(normalise_arxiv_id, arxiv_ids) if i})
    urls = []
    for start in range(0, len(ids), batch_size):
        chunk = ids[start : start + batch_size]
        flt = "doi:" + "|".join(f"https://doi.org/10.48550/arxiv.{i}" for i in chunk)
        query = f"filter={flt}&per-page=200&select=id,doi,title,publication_date,cited_by_count,locations"
        if mailto:
            query += "&mailto=" + urllib.parse.quote(mailto)
        urls.append(f"{OPENALEX_WORKS}?{query}")
    return urls


def work_arxiv_id(work: Mapping) -> tuple[str, str] | None:
    """``(arxiv_id, join_method)`` for an OpenAlex work, or ``None``.

    Only an arXiv DOI or a location URL counts. A journal DOI in the work's own ``doi`` is never
    used: for merged records it names the journal version, not the preprint.
    """
    from_doi = arxiv_id_from_doi(work.get("doi"))
    if from_doi:
        return from_doi, JOIN_DOI
    for loc in work.get("locations") or []:
        found = (
            arxiv_id_from_url(loc.get("landing_page_url"))
            or arxiv_id_from_url(loc.get("pdf_url"))
            or arxiv_id_from_doi(loc.get("doi"))
        )
        if found:
            return found, JOIN_MERGED
    return None


def collapse_works(works: Iterable[Mapping], wanted: set[str] | None = None) -> dict[str, dict]:
    """One canonical work per arXiv id, preferring the most-cited. Records the join method."""
    best: dict[str, dict] = {}
    for work in works:
        mapped = work_arxiv_id(work)
        if mapped is None:
            continue
        arxiv_id, method = mapped
        if wanted is not None and arxiv_id not in wanted:
            continue
        record = {
            "arxiv_id": arxiv_id,
            "oa_work_id": work.get("id"),
            "oa_title": work.get("title"),
            "oa_doi": work.get("doi"),
            "oa_pub_date": work.get("publication_date"),
            "cited_by_count": work.get("cited_by_count") or 0,
            "join_method": method,
        }
        current = best.get(arxiv_id)
        if current is None or (record["cited_by_count"], record["oa_work_id"] or "") > (
            current["cited_by_count"], current["oa_work_id"] or ""
        ):
            best[arxiv_id] = record
    return best


def resolve_arxiv_ids(
    arxiv_ids: Iterable[str],
    fetch: Callable[[str], dict],
    mailto: str | None = None,
) -> dict:
    """Resolve arXiv ids through ``fetch(url) -> dict`` (an OpenAlex ``/works`` response).

    Returns ``{"resolved": {arxiv_id: record}, "unresolved": [ids], "requests": n}``.
    """
    wanted = {i for i in map(normalise_arxiv_id, arxiv_ids) if i}
    urls = openalex_filter_urls(wanted, mailto)
    works: list[Mapping] = []
    for url in urls:
        works.extend((fetch(url) or {}).get("results") or [])
    resolved = collapse_works(works, wanted)
    return {"resolved": resolved, "unresolved": sorted(wanted - set(resolved)), "requests": len(urls)}


def make_polite_fetcher(mailto: str, max_requests: int = 40, timeout: float = 30.0) -> Callable[[str], dict]:
    """Real keyless fetcher with a hard request budget. Not exercised in CI."""
    state = {"used": 0}

    def fetch(url: str) -> dict:
        if state["used"] >= max_requests:
            raise RuntimeError(f"request budget of {max_requests} exhausted")
        state["used"] += 1
        req = urllib.request.Request(url, headers={"User-Agent": f"whitespace-pipeline (mailto:{mailto})"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 - fixed https host
            return json.load(resp)

    return fetch


# --- 3. Coverage -----------------------------------------------------------------------------


def archive_year_counts(rows: Iterable[Mapping]) -> dict[int, int]:
    """Distinct linked papers per arXiv-id-month year, from the pinned file."""
    seen = {i for i in linked_ids(rows)}
    counts: Counter = Counter()
    for arxiv_id in seen:
        month = arxiv_month(arxiv_id)
        if month:
            counts[month.year] += 1
    return dict(sorted(counts.items()))


_OLD_STYLE = re.compile(r"^[a-z][a-z\-]*(?:\.[a-z]{2})?/\d{7}$")
_NEW_STYLE_ID = re.compile(r"^\d{4}\.\d{4,5}$")


def arxiv_id_kind(raw: str | None) -> str:
    """``new_style`` (``YYMM.NNNNN``), ``old_style`` (``hep-th/9901001``, ``cs.AI/0301001``) or ``none``.

    Version suffixes and an ``arXiv:`` prefix are stripped first. Both styles are real arXiv ids
    that can match the archive; only old-style ids have no month to derive.
    """
    text = normalise_arxiv_id(raw)
    if text is None:
        return "none"
    if _NEW_STYLE_ID.match(text):
        return "new_style"
    if _OLD_STYLE.match(text):
        return "old_style"
    return "none"


def archive_coverage_states(
    year_counts: Mapping[int, int],
    min_linked: int,
    archive_date: dt.date = PWC_ARCHIVE_DATE,
    years: Iterable[int] | None = None,
) -> dict:
    """Per-year state from an explicit archive date and a data-derived thin cutoff.

    ``outside_archive_vintage``: the year starts after ``archive_date``. ``partial``: the year ends
    after ``archive_date`` (the archive covers only part of it). ``thin``: before ``cutoff_year``,
    the first year with at least ``min_linked`` linked papers. Otherwise ``ok``. Only ``ok`` years
    get a code rate. ``min_linked`` is a parameter and the cutoff is reported.
    """
    qualifying = [y for y, n in sorted(year_counts.items()) if n >= min_linked]
    cutoff = qualifying[0] if qualifying else None
    span = sorted(set(years) if years is not None else set(year_counts))
    states = {}
    for year in span:
        if dt.date(year, 1, 1) > archive_date:
            states[year] = "outside_archive_vintage"
        elif dt.date(year, 12, 31) > archive_date:
            states[year] = "partial"
        elif cutoff is None or year < cutoff:
            states[year] = "thin"
        else:
            states[year] = "ok"
    return {"cutoff_year": cutoff, "min_linked": min_linked, "archive_date": archive_date.isoformat(), "states": states}


def coverage_table(
    papers: Iterable[Mapping],
    linked: set[str],
    year_counts: Mapping[int, int],
    min_linked: int,
    archive_date: dt.date = PWC_ARCHIVE_DATE,
) -> dict:
    """Per (concept, year): papers with an archive link, all papers, rate and coverage state.

    ``papers`` items have ``concepts`` (iterable of str), ``arxiv_id`` (or ``None``) and
    ``fallback_date`` (the OpenAlex publication date, ``dt.date`` or ``None``). New-style arXiv
    ids take their year from the id month (``date_source`` ``arxiv_id_month``); old-style ids and
    papers without an arXiv id use the publication date (``publication_date``). Papers with no
    date are skipped and counted in ``undated``. Old-style ids are arXiv papers and can match the
    archive; only papers with no usable arXiv id are flagged unmatchable by construction.
    ``code_rate`` is ``None`` unless the year is ``ok`` (a partial or thin year gives no rate).
    """
    num: dict = defaultdict(int)
    den: dict = defaultdict(int)
    no_id: dict = defaultdict(int)
    sources: dict = defaultdict(Counter)
    undated = 0
    for paper in papers:
        kind = arxiv_id_kind(paper.get("arxiv_id"))
        arxiv_id = normalise_arxiv_id(paper.get("arxiv_id")) if kind != "none" else None
        try:
            year = paper_date(arxiv_id, paper.get("fallback_date")).year
        except ValueError:
            undated += 1
            continue
        source = "arxiv_id_month" if arxiv_month(arxiv_id) else "publication_date"
        has_link = arxiv_id is not None and arxiv_id in linked
        for concept in set(paper.get("concepts") or ()):
            key = (concept, year)
            den[key] += 1
            num[key] += has_link
            no_id[key] += kind == "none"
            sources[key][source] += 1
    years = {year for _, year in den}
    cov = archive_coverage_states(year_counts, min_linked, archive_date, years=years)
    rows = [
        {
            "concept": concept,
            "year": year,
            "linked": num[(concept, year)],
            "papers": den[(concept, year)],
            "code_rate": num[(concept, year)] / den[(concept, year)] if cov["states"][year] == "ok" else None,
            "coverage_state": cov["states"][year],
            "papers_without_arxiv_id": no_id[(concept, year)],
            "unmatchable_by_construction": no_id[(concept, year)] > 0,
            "date_sources": dict(sources[(concept, year)]),
        }
        for concept, year in sorted(den)
    ]
    return {
        "rows": rows,
        "cutoff_year": cov["cutoff_year"],
        "min_linked": min_linked,
        "archive_date": cov["archive_date"],
        "year_counts": dict(year_counts),
        "undated": undated,
        "note": "linked = papers with a link in this archive; a missing link is not evidence of no code",
    }


# --- 4. Hand-check tooling -------------------------------------------------------------------


def year_band(year: int) -> str:
    if year <= 2017:
        return YEAR_BANDS[0]
    if year <= 2020:
        return YEAR_BANDS[1]
    if year <= 2023:
        return YEAR_BANDS[2]
    return YEAR_BANDS[3]


def wilson_interval(k: int, n: int, z: float = 1.959964) -> tuple[float, float]:
    """Wilson score interval for ``k`` successes in ``n`` trials (default 95%)."""
    if n <= 0 or not 0 <= k <= n:
        raise ValueError("need n > 0 and 0 <= k <= n")
    p = k / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return max(0.0, centre - half), min(1.0, centre + half)


def stratum_of(pair: Mapping) -> str:
    return f"{year_band(int(pair['pwc_year']))}|{pair['join_method']}|code={'yes' if pair['code_link_present'] else 'no'}"


def build_frame(pairs: Sequence[Mapping], n: int = 100, seed: int = 20261108) -> list[dict]:
    """Seeded stratified frame of up to ``n`` matched pairs, as rows of ``TEMPLATE_COLUMNS``.

    Strata are year band x join method x code link present. Draws round-robin across strata so
    small cells are taken whole and no stratum is swamped; the result is shuffled and numbered.
    Same input and seed give the same frame. The frame measures precision only, not recall.
    """
    cells: dict[str, list[Mapping]] = defaultdict(list)
    for pair in sorted(pairs, key=lambda p: (str(p.get("pwc_arxiv_id")), str(p.get("oa_work_id")))):
        cells[stratum_of(pair)].append(pair)
    rng = random.Random(seed)
    keys = sorted(cells)
    for key in keys:
        rng.shuffle(cells[key])
    chosen: list[tuple[str, Mapping]] = []
    while len(chosen) < n and any(cells[k] for k in keys):
        for key in keys:
            if cells[key] and len(chosen) < n:
                chosen.append((key, cells[key].pop()))
    rng.shuffle(chosen)
    frame = []
    for i, (key, pair) in enumerate(chosen, start=1):
        row = {col: "" for col in TEMPLATE_COLUMNS}
        row.update({k: v for k, v in pair.items() if k in TEMPLATE_COLUMNS})
        row.update({"row_id": i, "stratum": key, "code_link_present": bool(pair["code_link_present"])})
        frame.append(row)
    return frame


# --- Manual 500-id resolution check ----------------------------------------------------------


def draw_sample(rows: Iterable[Mapping], seed: int = 20261107, per_band: int = 125) -> list[str]:
    """Seeded draw of ``per_band`` distinct new-style versionless arXiv ids per year band."""
    bands: dict[str, list[str]] = {b: [] for b in YEAR_BANDS}
    for arxiv_id in sorted(linked_ids(rows)):
        month = arxiv_month(arxiv_id)
        if month:
            bands[year_band(month.year)].append(arxiv_id)
    rng = random.Random(seed)
    sample: list[str] = []
    for band in YEAR_BANDS:
        sample.extend(rng.sample(bands[band], min(per_band, len(bands[band]))))
    return sample


def _main(argv: Sequence[str] | None = None) -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Manual 500-id OpenAlex resolution check (live requests).")
    parser.add_argument("--links", required=True, help="local links file (.parquet or .csv)")
    parser.add_argument("--revision", required=True, help="dataset revision SHA, recorded in the manifest")
    parser.add_argument("--mailto", required=True, help="contact email for the OpenAlex polite pool")
    parser.add_argument("--seed", type=int, default=20261107)
    parser.add_argument("--per-band", type=int, default=125)
    parser.add_argument("--max-requests", type=int, default=40)
    args = parser.parse_args(argv)
    rows, manifest = load_links(args.links, args.revision)
    sample = draw_sample(rows, args.seed, args.per_band)
    out = resolve_arxiv_ids(sample, make_polite_fetcher(args.mailto, args.max_requests), args.mailto)
    by_band: Counter = Counter()
    for arxiv_id in out["resolved"]:
        by_band[year_band(arxiv_month(arxiv_id).year)] += 1
    print(json.dumps({"manifest": manifest, "sampled": len(sample), "resolved": len(out["resolved"]),
                      "resolved_by_band": dict(by_band), "unresolved": out["unresolved"],
                      "requests": out["requests"]}, indent=2))


if __name__ == "__main__":
    _main()
