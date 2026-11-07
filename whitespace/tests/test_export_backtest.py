"""Tests for the backtest response and manifest exporter (issue #161).

The metrics used here come from SYNTHETIC corpora (or a hand-built toy). Where a test needs a
"real" run it only relabels the dict to exercise the code path; those numbers are not results.
"""
import copy
import datetime as dt
import json
from pathlib import Path

import numpy as np
import pytest

from whitespace.pipeline.backtest import BacktestConfig, OneShotGuard, run_backtest
from whitespace.pipeline.common import Work
from whitespace.pipeline.export_backtest import (
    ANNUAL_NOTE, EMPTY_CODE_LINK, build_manifest, calibration_bins, clean, select_hits_misses,
    to_backtest_response, write_backtest_json, write_manifest,
)
from whitespace.pipeline.graphs import PairSet
from whitespace.pipeline.synthetic import generate_works

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "backtest_response_keys.json").read_text())
CONFIG = BacktestConfig(fit_origins=(2012, 2013, 2014), calibration_origins=(2017,), test_origins=(2020,), seed=0)


@pytest.fixture(scope="module")
def synthetic_metrics():
    works = generate_works(signal=True, seed=1)
    return run_backtest(works, CONFIG, guard=OneShotGuard(), data_label="synthetic",
                        generator={"signal": True, "seed": 1, "n_works": len(works)})


@pytest.fixture(scope="module")
def relabelled(synthetic_metrics):
    """Synthetic numbers relabelled "real" ONLY to exercise the real-run code path."""
    m = copy.deepcopy(synthetic_metrics)
    m["manifest"]["data_label"], m["manifest"]["generator"] = "real", None
    return m


def toy_pairs():
    names = ("a", "b", "c", "d", "e")
    ij = [(0, 1), (0, 2), (1, 2), (2, 3), (3, 4), (0, 4)]
    return PairSet(names, np.array([p[0] for p in ij], np.int32), np.array([p[1] for p in ij], np.int32),
                   np.array([0, 1, 2, 0, 1, 2], np.int8))


# ---- shape ------------------------------------------------------------------------------------

def test_placeholder_matches_fixture_keys(synthetic_metrics):
    out = to_backtest_response(synthetic_metrics, [], [])
    assert set(FIXTURE) <= set(out)
    assert set(out["code_link_evaluation"]) == set(FIXTURE["code_link_evaluation"])
    assert set(out["calibration"]) == set(FIXTURE["calibration"])
    assert out["placeholder"] is True and out["synthetic"] is True


def test_real_run_shape_field_by_field(relabelled):
    out = to_backtest_response(relabelled, [], [])
    assert out["placeholder"] is False and out["synthetic"] is False
    assert set(FIXTURE) <= set(out)
    assert set(out) - set(FIXTURE) <= {"synthetic", "hits_note", "meta"}
    assert set(out["code_link_evaluation"]) == set(FIXTURE["code_link_evaluation"])
    assert set(out["calibration"]) == {"bins", "note"}
    assert set(out["by_starting_weight"]) == {"all", "0", "1", "2"}
    for block in out["by_starting_weight"].values():
        assert set(block) == {"base_rate", "roc_auc", "pr_auc", "average_precision", "precision_at_100", "baselines"}
    allowed = {"current_weight", "degree_product", "preferential_attachment", "adamic_adar", "cosine"}
    assert set(out["baselines"]) <= allowed and "current_weight" in out["baselines"]
    for b in out["baselines"].values():
        assert set(b) == {"roc_auc", "pr_auc", "average_precision", "precision_at_100"}
    t = relabelled["test"]["2020"]
    assert out["average_precision"] == t["model"]["all"]["average_precision"]
    assert out["baselines"]["adamic_adar"]["roc_auc"] == t["baselines"]["adamic_adar"]["all"]["roc_auc"]
    assert out["pr_auc"] is None  # never invented
    json.dumps(out, allow_nan=False)


def test_code_link_evaluation_passthrough_and_rejects_unknown(relabelled):
    ev = {**EMPTY_CODE_LINK, "precision": 0.5, "sample_size": 10}
    assert to_backtest_response(relabelled, [], [], ev)["code_link_evaluation"]["sample_size"] == 10
    with pytest.raises(ValueError):
        to_backtest_response(relabelled, [], [], {"bogus": 1})


# ---- calibration ------------------------------------------------------------------------------

def test_calibration_bins_conversion_drops_empty_and_nan():
    cal = {"bin_count": [5, 0, 3], "mean_predicted": [0.1, float("nan"), 0.7],
           "observed_rate": [0.2, float("nan"), 0.6], "brier": 0.1, "brier_skill": 0.2, "ece": 0.05}
    out = calibration_bins(cal)
    assert out["bins"] == [{"predicted": 0.1, "observed": 0.2, "count": 5},
                           {"predicted": 0.7, "observed": 0.6, "count": 3}]
    assert "ECE 0.0500" in out["note"]


def test_calibration_undefined_gives_empty_bins_and_reason():
    out = calibration_bins({"undefined": "no positives"})
    assert out["bins"] == [] and "no positives" in out["note"]


# ---- hits and misses --------------------------------------------------------------------------

def test_hits_misses_on_toy():
    pairs = toy_pairs()
    scores = np.array([0.9, 0.8, 0.7, 0.6, 0.5, 0.4])
    y = np.array([False, True, False, True, False, True])
    hits, misses, note = select_hits_misses(scores, y, pairs, n_hits=2, n_misses=2)
    assert [(h["a"], h["b"]) for h in hits] == [("a", "c"), ("c", "d")]
    assert [(m["a"], m["b"]) for m in misses] == [("a", "b"), ("b", "c")]
    assert hits[0]["score"] == 0.8 and hits[0]["starting_weight"] == 1
    assert all(h["year"] is None for h in hits + misses)
    assert note == ANNUAL_NOTE  # no works: annual counts only, no event time implied
    assert len(select_hits_misses(scores, y, pairs)[0]) == 3  # fewer than 20 hits exist


def test_hits_get_crossing_year_from_works():
    pairs = toy_pairs()
    d = dt.date
    works = [Work(f"w{k}", d(y, m, 1), ("a", "c")) for k, (y, m) in enumerate([(2019, 1), (2019, 5), (2021, 3), (2022, 1)])]
    scores = np.array([0.9, 0.8, 0.7, 0.6, 0.5, 0.4])
    y = np.array([False, True, False, False, False, False])
    hits, misses, note = select_hits_misses(scores, y, pairs, works=works, origin=2019, horizon=3)
    assert hits[0]["year"] == 2021 and all(m["year"] is None for m in misses)
    assert "work dates" in note


def test_hits_misses_length_mismatch():
    with pytest.raises(ValueError):
        select_hits_misses(np.zeros(2), np.zeros(2, bool), toy_pairs())


# ---- honesty ----------------------------------------------------------------------------------

def test_synthetic_run_never_emits_numbers(synthetic_metrics, tmp_path):
    fake_hits = [{"a": "x", "b": "y", "score": 0.9, "year": None}]
    out = to_backtest_response(synthetic_metrics, fake_hits, fake_hits)
    assert out["placeholder"] is True and out["synthetic"] is True
    assert out["hits"] == [] and out["misses"] == [] and out["by_starting_weight"] == {}
    for k in ("base_rate", "roc_auc", "pr_auc", "average_precision", "precision_at_100"):
        assert out[k] is None
    with pytest.raises(ValueError):
        write_backtest_json(tmp_path / "x.json", {"placeholder": False, "synthetic": True})


@pytest.mark.parametrize("metrics", [None, {}, {"manifest": {}, "test": {}}])
def test_empty_run_is_placeholder(metrics):
    out = to_backtest_response(metrics, [], [])
    assert out["placeholder"] is True and out["synthetic"] is False


def test_unlabelled_run_is_not_real(synthetic_metrics):
    m = copy.deepcopy(synthetic_metrics)
    m["manifest"]["data_label"], m["manifest"]["generator"] = "unspecified", None
    assert to_backtest_response(m, [], [])["placeholder"] is True


def test_nan_becomes_null(relabelled, tmp_path):
    m = copy.deepcopy(relabelled)
    m["test"]["2020"]["model"]["all"]["roc_auc"] = float("nan")
    m["test"]["2020"]["model"]["all"]["average_precision"] = float("inf")
    hits = [{"a": "a", "b": "b", "score": float("nan"), "year": None}]
    out = to_backtest_response(m, hits, [])
    assert out["roc_auc"] is None and out["average_precision"] is None and out["hits"][0]["score"] is None
    write_backtest_json(tmp_path / "b.json", out)
    assert "NaN" not in (tmp_path / "b.json").read_text()
    assert clean({"x": np.float64("nan"), "y": np.int64(3)}) == {"x": None, "y": 3}


def test_no_abstract_text(relabelled):
    hits = [{"a": "a", "b": "b", "score": 0.5, "year": 2021, "abstract_excerpt": "secret text",
             "paper": {"id": "p", "abstract": "more text"}}]
    text = json.dumps(to_backtest_response(relabelled, hits, []))
    assert "secret text" not in text and "more text" not in text and "abstract" not in text


# ---- manifest ---------------------------------------------------------------------------------

def test_manifest_contents_and_file_hashes(synthetic_metrics, tmp_path):
    f = tmp_path / "backtest.json"
    f.write_text("{}")
    m = write_manifest(tmp_path / "manifest.json", synthetic_metrics, corpus_query="q", files=[f], commit="abc")
    assert json.loads((tmp_path / "manifest.json").read_text()) == m
    assert m["synthetic"] is True and m["real_run"] is False
    assert m["origins"]["test"] == [2020] and m["seed"] == 0 and m["config_hash"]
    assert m["code_commit"] == "abc" and m["corpus"]["query"] == "q"
    assert m["corpus"]["topic_assignment_vintage"] is None and "numpy" in m["library_versions"]
    assert len(m["files"]["backtest.json"]) == 64
    assert build_manifest(None)["real_run"] is False
