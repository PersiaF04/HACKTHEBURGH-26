"""Offline tests for the coverage export (issue #163)."""
import datetime as dt
import json

import pytest

from whitespace.pipeline import code_layer as cl
from whitespace.pipeline import export_coverage as ex

# Key sets copied from whitespace/web/mock/coverage.json and api.ts (PR #159); not the whole frontend.
FIXTURE_TOP = {"placeholder", "year", "years", "concepts", "caveat", "archive"}
FIXTURE_ARCHIVE = {"source_url", "snapshot_date", "revision_sha", "file_vintage_verified", "license_id", "license_url"}
CELL_KEYS = {"year", "code_rate", "paper_count", "linked_paper_count", "state"}
EVAL_KEYS = {"precision", "lower", "upper", "interval_method", "sample_size", "correct_matches",
             "sample_composition", "protocol"}


def _table():
    d = dt.date
    papers = [
        {"concepts": ["c1"], "arxiv_id": "1701.00001", "fallback_date": None},  # 2017, below cutoff
        {"concepts": ["c1"], "arxiv_id": "2101.00001", "fallback_date": None},  # linked
        {"concepts": ["c1"], "arxiv_id": "2101.00002", "fallback_date": None},  # no link
        {"concepts": ["c1"], "arxiv_id": None, "fallback_date": d(2021, 5, 1)},  # non-arXiv
        {"concepts": ["c1", "c2"], "arxiv_id": "2601.00001", "fallback_date": None},  # after archive
    ]
    return cl.coverage_table(papers, {"1701.00001", "2101.00001", "2601.00001"},
                             {2017: 1, 2021: 5, 2022: 5}, min_linked=3)


def test_shape_matches_fixture_keys():
    out = ex.to_coverage_response(2021, _table(), {"dataset_revision": "abc"})
    assert FIXTURE_TOP <= set(out)
    assert FIXTURE_ARCHIVE <= set(out["archive"])
    assert out["archive"]["revision_sha"] == "abc"
    for concept in out["concepts"]:
        assert {"id", "label", "cells"} <= set(concept)
        for cell in concept["cells"]:
            assert CELL_KEYS <= set(cell)
    assert out["years"] == [2017, 2021, 2026]
    json.dumps(out)


def test_grey_logic_at_cutoff():
    out = ex.to_coverage_response(2021, _table())
    assert out["archive"]["low_coverage_cutoff_year"] == 2021
    cells = {c["year"]: c for c in out["concepts"][0]["cells"]}
    assert cells[2017]["state"] == "thin" and cells[2017]["code_rate"] is None
    assert cells[2021]["state"] == "available"
    assert cells[2026]["state"] == "outside_archive_vintage" and cells[2026]["code_rate"] is None
    assert cells[2017]["paper_count"] == 1  # counts kept on grey cells


def test_denominator_includes_unmatchable():
    cell = {c["year"]: c for c in ex.to_coverage_response(2021, _table())["concepts"][0]["cells"]}[2021]
    assert cell["paper_count"] == 3 and cell["linked_paper_count"] == 1
    assert cell["code_rate"] == pytest.approx(1 / 3)
    assert cell["non_arxiv_paper_count"] == 1 and cell["unmatchable_by_construction"] is True


def test_wording_attribution_and_licence():
    out = ex.to_coverage_response(2021, _table())
    text = json.dumps(out).lower()
    assert "no code" not in text
    assert all(c["no_link_label"] == "no linked code in this archive" for k in out["concepts"] for c in k["cells"])
    assert out["archive"]["license_id"] == "cc-by-sa-4.0" and "cc-by-sa" in out["archive"]["attribution"].lower()
    assert out["archive"]["snapshot_date"] == "2025-07-28" and out["archive"]["row_count"] == 300_161


def test_empty_table_is_placeholder():
    empty = cl.coverage_table([], set(), {}, 3)
    assert ex.to_coverage_response(2021, empty)["placeholder"] is True


def _pairs(correct, total):
    return [{"final_label": "correct" if i < correct else "incorrect",
             "stratum": "2021-2023|arxiv-doi|code=yes" if i % 2 else "<=2017|title-fallback|code=no"}
            for i in range(total)]


def test_wilson_known_inputs():
    ev = ex.code_link_evaluation(_pairs(95, 100))
    assert EVAL_KEYS <= set(ev) and ev["placeholder"] is False
    assert (ev["correct_matches"], ev["sample_size"], ev["precision"]) == (95, 100, 0.95)
    assert ev["lower"] == pytest.approx(0.8882, abs=1e-4) and ev["upper"] == pytest.approx(0.9785, abs=1e-4)
    assert ev["interval_method"] == "binomial" and ev["protocol"]
    assert ev["sample_composition"]["join_method:arxiv-doi"] == 50
    zero = ex.code_link_evaluation(_pairs(0, 100))
    assert zero["lower"] == 0.0 and zero["upper"] == pytest.approx(0.037, abs=1e-3)


@pytest.mark.parametrize("table", [None, [], _pairs(5, 5) + [{"final_label": ""}]])
def test_nulls_without_completed_hand_check(table):
    ev = ex.code_link_evaluation(table)
    assert ev["placeholder"] is True
    assert all(ev[k] is None for k in EVAL_KEYS)
