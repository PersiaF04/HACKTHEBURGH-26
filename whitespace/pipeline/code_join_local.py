"""Local Papers with Code join against the downloaded corpus (issue #173). No network calls.

The ingest's ``corpus.jsonl`` already carries each work's arXiv id, so the join is a dictionary
lookup of the versionless arXiv id in the pinned Papers with Code links file. Wording rule (as in
``code_layer``): an unlinked paper has *no linked code in this archive*, never "no code". Every
rate is a lower bound, and the corpus is one OpenAlex subfield, so most archive ids are not in it.

``join_corpus`` streams the corpus once. Abstracts are read by the JSON parser but never copied to
any output. Reuses ``code_layer`` for id kinds, normalisation, coverage and the hand-check frame.
"""
from __future__ import annotations

import csv
import datetime as dt
import json
import time
from collections import Counter
from collections.abc import Iterable, Iterator, Mapping, Sequence
from pathlib import Path

from . import code_layer as cl
from .common import arxiv_month, normalise_arxiv_id

UNMATCHABLE = "unmatchable_by_construction"
JOIN_OWN = "corpus-arxiv-id-preprint-record"  # corpus record is typed preprint (own arXiv record)
JOIN_MERGED = "corpus-arxiv-id-other-record"  # article / conference record carrying an arXiv location
NO_ID_NOTE = "papers with no usable arXiv id cannot be joined to the archive"

PAPER_COLUMNS = (
    "id", "arxiv_id", "match_key", "join_method", "has_linked_code", "has_official_code",
    "year", "date", "date_source", "topic_id", "type",
)
FRAME_EXTRA = ("oa_first_author", "pwc_official")


def _truthy(value) -> bool:
    return str(value).strip().lower() in ("true", "1", "1.0", "yes")


def index_links(rows: Iterable[Mapping]) -> dict[str, dict]:
    """Per versionless arXiv id: ``official`` (any official row), ``rows``, plus one representative
    title and code URL (official rows first, then smallest URL, so the choice is deterministic).
    Rows without a usable arXiv id are skipped; duplicate rows collapse."""
    index: dict[str, dict] = {}
    for row in rows:
        key = normalise_arxiv_id(row.get("paper_arxiv_id"))
        if cl.arxiv_id_kind(key) == "none":
            continue
        official = _truthy(row.get("is_official"))
        url = row.get("repo_url") or ""
        cur = index.setdefault(key, {"official": False, "rows": 0, "rank": None, "title": "", "code_url": ""})
        cur["rows"] += 1
        cur["official"] = cur["official"] or official
        rank = (not official, url)
        if cur["rank"] is None or rank < cur["rank"]:
            cur.update(rank=rank, title=row.get("paper_title") or "", code_url=url)
    return index


def iter_corpus(path: str | Path) -> Iterator[dict]:
    """Stream ``corpus.jsonl`` one record at a time."""
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                yield json.loads(line)


def _year_dict(counter: Mapping[int, int]) -> dict[str, int]:
    return {str(y): counter[y] for y in sorted(counter)}


def new_state() -> dict:
    return {
        "stats": {
            "works": 0, "kinds": Counter(), "works_by_year": Counter(), "id_by_year": Counter(),
            "linked_by_year": Counter(), "official_by_year": Counter(), "unmatchable_by_year": Counter(),
        },
        "corpus_keys": set(),
        "matched": {},
    }


def join_corpus(corpus_path, links_index: Mapping[str, dict], state: dict) -> Iterator[tuple[dict, dict]]:
    """Stream the corpus once, yielding ``(papers_table_row, coverage_input)`` per work.

    ``state`` (from ``new_state``) accumulates counters, the corpus arXiv ids and the matched
    pairs for the hand-check frame. Nothing else is kept, and no abstract text is copied.
    """
    stats, corpus_keys, matched = state["stats"], state["corpus_keys"], state["matched"]
    for rec in iter_corpus(corpus_path):
        stats["works"] += 1
        year = int(rec["year"])
        kind = cl.arxiv_id_kind(rec.get("arxiv_id"))
        key = normalise_arxiv_id(rec.get("arxiv_id")) if kind != "none" else None
        stats["kinds"][kind] += 1
        stats["works_by_year"][year] += 1
        link = links_index.get(key) if key else None
        if key is None:
            method = UNMATCHABLE
            stats["unmatchable_by_year"][year] += 1
        else:
            method = JOIN_OWN if rec.get("type") == "preprint" else JOIN_MERGED
            stats["id_by_year"][year] += 1
            corpus_keys.add(key)
        if link:
            stats["linked_by_year"][year] += 1
            stats["official_by_year"][year] += link["official"]
            matched.setdefault(key, {
                "pwc_title": link["title"], "pwc_first_author": "", "pwc_year": year,
                "pwc_arxiv_id": key, "pwc_code_url": link["code_url"], "oa_work_id": rec["id"],
                "oa_title": rec.get("title") or "", "oa_doi": "", "oa_pub_date": rec.get("date"),
                "join_method": method, "code_link_present": True,
                "oa_first_author": rec.get("first_author") or "", "pwc_official": link["official"],
            })
        row = {
            "id": rec["id"], "arxiv_id": key or "", "match_key": key or "", "join_method": method,
            "has_linked_code": bool(link), "has_official_code": bool(link and link["official"]),
            "year": year, "date": rec.get("date"),
            "date_source": "arxiv_id_month" if arxiv_month(key) else "publication_date",
            "topic_id": rec.get("topic_id") or "", "type": rec.get("type") or "",
        }
        cov = {
            "concepts": [rec["topic_id"]] if rec.get("topic_id") else [],
            "arxiv_id": key,
            "fallback_date": dt.date.fromisoformat(rec["date"]) if rec.get("date") else None,
        }
        yield row, cov


def report(result: Mapping, links_index: Mapping[str, dict], manifest: Mapping | None = None) -> dict:
    """Counts only. Explains why most archive ids are absent from the corpus."""
    stats = result["stats"]
    keys = result["corpus_keys"]
    present = [k for k in links_index if k in keys]
    absent = [k for k in links_index if k not in keys]
    present_year = Counter()
    for k in present:
        present_year[result["matched"][k]["pwc_year"]] += 1
    absent_year = Counter()
    for k in absent:
        month = arxiv_month(k)
        absent_year[month.year if month else 0] += 1  # year 0 = old-style id (no month)
    return {
        "corpus_works": stats["works"],
        "works_with_arxiv_id": sum(stats["id_by_year"].values()),
        "works_without_arxiv_id": stats["kinds"]["none"],
        "arxiv_id_kinds": dict(stats["kinds"]),
        "works_by_year": _year_dict(stats["works_by_year"]),
        "works_with_arxiv_id_by_year": _year_dict(stats["id_by_year"]),
        "works_without_arxiv_id_by_year": _year_dict(stats["unmatchable_by_year"]),
        "pwc_distinct_arxiv_ids": len(links_index),
        "pwc_ids_in_corpus": len(present),
        "pwc_ids_not_in_corpus": len(absent),
        "pwc_ids_in_corpus_by_year": _year_dict(present_year),
        "pwc_ids_not_in_corpus_by_year": _year_dict(absent_year),
        "linked_papers": sum(stats["linked_by_year"].values()),
        "official_papers": sum(stats["official_by_year"].values()),
        "linked_papers_by_year": _year_dict(stats["linked_by_year"]),
        "official_papers_by_year": _year_dict(stats["official_by_year"]),
        "why_absent": (
            "expected: the corpus is one OpenAlex subfield (and date range), while the archive covers "
            "all of machine learning and neighbouring fields; an absent id is not a join failure"
        ),
        "no_id_note": NO_ID_NOTE,
        "pwc_manifest": dict(manifest or {}),
        "note": "counts of this run; a missing link is not evidence of no code",
    }


# The strata the issue asks for: year band x official x own/merged record.
def _stratified(pairs: Sequence[Mapping]) -> list[dict]:
    staged = [
        {**p, "join_method": f"{p['join_method']}|{'official' if p['pwc_official'] else 'unofficial'}"}
        for p in pairs
    ]
    return staged


def hand_check_frame(matched: Mapping[str, dict], n: int = 100, seed: int = 20261108) -> list[dict]:
    """Seeded 100-pair frame from matched pairs, stratified by year band, official or not, and
    own-record or merged-record. Template columns plus ``oa_first_author`` and ``pwc_official``.
    ``oa_title`` is the corpus title. No abstract text. Precision only, not recall."""
    staged = _stratified(list(matched.values()))
    frame = cl.build_frame(staged, n=n, seed=seed)
    by_key = {p["pwc_arxiv_id"]: p for p in matched.values()}
    for row in frame:
        src = by_key[row["pwc_arxiv_id"]]
        row["join_method"] = src["join_method"]
        row["oa_first_author"] = src["oa_first_author"]
        row["pwc_official"] = src["pwc_official"]
    return frame


def write_csv(path, columns: Sequence[str], rows: Iterable[Mapping]) -> None:
    with open(path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(columns), extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def run(corpus, links, revision: str, out_dir, min_linked: int = 100, seed: int = 20261108, n: int = 100) -> dict:
    """Join, write ``papers.csv``, ``coverage.json``, ``report.json`` and ``handcheck_frame.csv``."""
    started = time.monotonic()
    rows, manifest = cl.load_links(str(links), revision)
    index = index_links(rows)
    year_counts = cl.archive_year_counts(rows)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    state = new_state()
    with open(out / "papers.csv", "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(PAPER_COLUMNS))
        writer.writeheader()

        def covered() -> Iterator[dict]:
            for row, cov in join_corpus(corpus, index, state):
                writer.writerow(row)
                yield cov

        coverage = cl.coverage_table(covered(), set(index), year_counts, min_linked)
    result = state
    rep = report(result, index, manifest)
    rep["archive_linked_by_year"] = {str(y): c for y, c in year_counts.items()}
    rep["thin_cutoff_year"] = coverage["cutoff_year"]
    rep["min_linked"] = min_linked
    frame = hand_check_frame(result["matched"], n, seed)
    write_csv(out / "handcheck_frame.csv", list(cl.TEMPLATE_COLUMNS) + list(FRAME_EXTRA), frame)
    (out / "coverage.json").write_text(json.dumps(coverage, indent=1, default=str), encoding="utf-8")
    rep["frame_rows"] = len(frame)
    rep["seconds"] = round(time.monotonic() - started, 1)
    (out / "report.json").write_text(json.dumps(rep, indent=1), encoding="utf-8")
    return rep


def _main(argv: Sequence[str] | None = None) -> None:
    import argparse

    ap = argparse.ArgumentParser(description="Local Papers with Code join (no API calls).")
    ap.add_argument("--corpus", required=True, help="corpus.jsonl from ingest build")
    ap.add_argument("--links", required=True, help="local links file (.parquet needs pyarrow, or .csv)")
    ap.add_argument("--revision", required=True, help="dataset revision SHA, recorded in the report")
    ap.add_argument("--out", required=True, help="output directory (outside Git)")
    ap.add_argument("--min-linked", type=int, default=100)
    ap.add_argument("--seed", type=int, default=20261108)
    args = ap.parse_args(argv)
    print(json.dumps(run(args.corpus, args.links, args.revision, args.out, args.min_linked, args.seed), indent=1))


if __name__ == "__main__":
    _main()
