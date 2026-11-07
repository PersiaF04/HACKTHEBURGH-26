"""Export the code coverage response and the code-link evaluation block (issue #163).

Output contract is the frontend's: ``CoverageResponse`` / ``CoverageConcept`` / ``CoverageCell`` /
``CoverageArchive`` and ``CodeLinkEvaluation`` in ``whitespace/web/src/api.ts``.

Wording rule: a cell without a link says "no linked code in this archive", never "no code".
Papers without an arXiv id stay in the denominator and are flagged unmatchable by construction.
"""
from __future__ import annotations

import datetime as dt
from collections import Counter
from collections.abc import Iterable, Mapping

from .code_layer import (
    PWC_ARCHIVE_DATE,
    PWC_ATTRIBUTION,
    PWC_CARD_ROWS,
    PWC_LICENCE,
    PWC_SOURCE_URL,
    wilson_interval,
)

NO_LINK_LABEL = "no linked code in this archive"
LICENCE_URL = "https://creativecommons.org/licenses/by-sa/4.0/"
CAVEAT = (
    "Coverage is a lower bound from an incomplete historical archive (Papers with Code, frozen "
    "2025-07-28); no linked code in this archive does not mean no implementation exists. Papers "
    "without an arXiv id are counted in the denominator and cannot be matched by construction."
)
PROTOCOL = (
    "Seeded stratified sample of 100 matched (Papers with Code, OpenAlex) pairs, stratified by "
    "year band, join method and code link present. Two checkers labelled each pair independently "
    "and disagreements were adjudicated into final_label. Precision is correct matches over "
    "sample size with a 95% Wilson interval. This measures precision of the join only, not recall."
)
_TRUE = {"true", "correct", "yes", "y", "1", "match"}
_FALSE = {"false", "incorrect", "no", "n", "0", "mismatch", "wrong"}


def default_archive_info() -> dict:
    return {
        "dataset_revision": None,
        "snapshot_date": PWC_ARCHIVE_DATE.isoformat(),
        "row_count": PWC_CARD_ROWS,
        "file_vintage_verified": False,
    }


def _state(row: Mapping, cutoff: int | None, archive_year: int) -> str:
    if row["coverage_state"] == "ok":
        return "available"
    if cutoff is None or row["year"] < cutoff:
        return "thin"
    return "outside_archive_vintage" if row["year"] > archive_year else "unavailable"


def to_coverage_response(year: int, coverage_table: Mapping, archive_info: Mapping | None = None) -> dict:
    """Build a ``CoverageResponse`` dict from ``code_layer.coverage_table`` output.

    ``archive_info`` keys: ``dataset_revision``, ``snapshot_date``, ``row_count``,
    ``file_vintage_verified``, optional ``attribution`` and ``concept_labels`` ({id: label}).
    Grey cells keep their counts but carry ``code_rate`` null, so a thin year is never charted.
    """
    info = {**default_archive_info(), **(archive_info or {})}
    labels = info.get("concept_labels") or {}
    cutoff = coverage_table.get("cutoff_year")
    archive_year = dt.date.fromisoformat(coverage_table.get("archive_date") or info["snapshot_date"]).year
    by_concept: dict[str, list[dict]] = {}
    for row in coverage_table["rows"]:
        state = _state(row, cutoff, archive_year)
        by_concept.setdefault(row["concept"], []).append({
            "year": row["year"],
            "code_rate": row["code_rate"] if state == "available" else None,
            "paper_count": row["papers"],
            "linked_paper_count": row["linked"],
            "state": state,
            "non_arxiv_paper_count": row["non_arxiv_papers"],
            "unmatchable_by_construction": row["unmatchable_by_construction"],
            "no_link_label": NO_LINK_LABEL,
        })
    concepts = [
        {"id": cid, "label": labels.get(cid, cid), "cells": sorted(cells, key=lambda c: c["year"])}
        for cid, cells in sorted(by_concept.items())
    ]
    return {
        "placeholder": not concepts,
        "year": year,
        "years": sorted({c["year"] for cs in by_concept.values() for c in cs}),
        "concepts": concepts,
        "caveat": CAVEAT,
        "archive": {
            "source_url": PWC_SOURCE_URL,
            "snapshot_date": info["snapshot_date"],
            "revision_sha": info["dataset_revision"],
            "file_vintage_verified": bool(info["file_vintage_verified"]),
            "license_id": PWC_LICENCE,
            "license_url": LICENCE_URL,
            "row_count": info["row_count"],
            "attribution": info.get("attribution") or PWC_ATTRIBUTION,
            "low_coverage_cutoff_year": cutoff,
            "min_linked": coverage_table.get("min_linked"),
        },
    }


def _label(value) -> bool | None:
    text = str(value).strip().lower() if value is not None else ""
    if text in _TRUE:
        return True
    if text in _FALSE:
        return False
    return None


def code_link_evaluation(hand_check: Iterable[Mapping] | None) -> dict:
    """``CodeLinkEvaluation`` plus ``placeholder`` from a completed hand-check table.

    The table is the 100-pair frame with ``final_label`` filled in. If it is absent, empty or any
    row has no readable ``final_label``, every field is null and ``placeholder`` stays true.
    """
    rows = list(hand_check or [])
    labels = [_label(r.get("final_label")) for r in rows]
    if not rows or any(v is None for v in labels):
        return {"placeholder": True, "precision": None, "lower": None, "upper": None, "interval_method": None,
                "sample_size": None, "correct_matches": None, "sample_composition": None, "protocol": None}
    n, k = len(rows), sum(labels)
    lower, upper = wilson_interval(k, n)
    composition: Counter = Counter()
    for r in rows:
        parts = str(r.get("stratum") or "").split("|")
        if len(parts) == 3:
            composition[f"year_band:{parts[0]}"] += 1
            composition[f"join_method:{parts[1]}"] += 1
            composition[f"code_link:{parts[2].removeprefix('code=')}"] += 1
    return {"placeholder": False, "precision": k / n, "lower": lower, "upper": upper, "interval_method": "binomial",
            "sample_size": n, "correct_matches": k, "sample_composition": dict(sorted(composition.items())),
            "protocol": PROTOCOL}
