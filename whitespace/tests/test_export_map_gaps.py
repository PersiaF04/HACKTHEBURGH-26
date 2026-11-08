"""Tests for the map, gaps and meta exporter (issue #162).

SYNTHETIC SANITY CHECKS ONLY. Corpora come from ``pipeline/synthetic.py``; nothing here says
anything about real literature.
"""
import json
import math

import numpy as np
import pytest

from whitespace.pipeline.backtest import BacktestConfig, train
from whitespace.pipeline.export_map_gaps import (
    MOMENTUM_K, build_export, clean, compute_layout, gap_score_parts, headline_from_backtest, sigmoid,
    trained_predictor, write_export,
)
from whitespace.pipeline.graphs import build_snapshot, vocabulary
from whitespace.pipeline.synthetic import generate_works, poison_after

CONFIG = BacktestConfig(fit_origins=(2012, 2013, 2014), calibration_origins=(2017,), test_origins=(2020,), seed=0)
YEARS = (2016, 2018)
KW = dict(n_min=CONFIG.n_min, edge_threshold=0.05, gap_pool=300, gap_limit=30, detail_limit=5)

# keys of the frontend fixtures (whitespace/web/mock/*.json on PR #159) and api.ts types
MAP_KEYS = {"placeholder", "year", "concepts", "edges", "focus"}
GAPS_KEYS = {"placeholder", "items"}
DETAIL_KEYS = {"summary", "closest_a", "closest_b", "shared_neighbours", "open_problems"}
META_KEYS = {"placeholder", "year_range", "counts", "headline_metrics"}
CONCEPT_KEYS = {"placeholder", "counts_by_year", "forecast", "top_papers", "open_problems", "neighbours"}
GAP_SUMMARY_KEYS = {"a", "b", "a_label", "b_label", "p_link", "p_lo", "p_hi", "momentum", "novelty",
                    "gap_rate", "gap_score"}


@pytest.fixture(scope="module")
def works():
    return generate_works(signal=True, seed=1)


@pytest.fixture(scope="module")
def predictor(works):
    return trained_predictor(train(works, CONFIG), CONFIG.n_min)


@pytest.fixture(scope="module")
def export(works, predictor):
    return build_export(works, YEARS, predictor, **KW)


def test_shape_matches_fixture_keys(export):
    assert MAP_KEYS <= set(export["map-2016.json"])
    assert GAPS_KEYS <= set(export["gaps.json"])
    assert META_KEYS <= set(export["meta.json"])
    detail = next(iter(export["gap-details.json"].values()))
    assert DETAIL_KEYS <= set(detail)
    assert GAP_SUMMARY_KEYS <= set(detail["summary"])
    assert CONCEPT_KEYS <= set(next(iter(export["concepts.json"].values())))
    m = export["map-2018.json"]
    assert m["year"] == 2018 and m["concepts"] and m["placeholder"] is False
    assert {"id", "label", "x", "y", "growth", "paper_count"} <= set(m["concepts"][0])
    assert all({"source", "target", "p_link"} == set(e) for e in m["edges"])
    assert export["meta.json"]["year_range"] == {"min": 2016, "max": 2018}


def test_deterministic(works, predictor, export):
    again = build_export(works, YEARS, predictor, **KW)
    assert json.dumps(again, sort_keys=True) == json.dumps(export, sort_keys=True)


def test_layout_properties(works):
    snap = build_snapshot(works, 2018)
    names = vocabulary(snap, 30)
    xy = compute_layout(snap, names)
    assert xy.shape == (len(names), 2)
    assert np.abs(xy).max() == pytest.approx(1.0)
    assert np.array_equal(xy, compute_layout(snap, names))
    assert xy.std(axis=0).min() > 0  # not collapsed to a line or point


def test_same_layout_every_year(export):
    pos = lambda f: {c["id"]: (c["x"], c["y"]) for c in export[f]["concepts"]}
    p16, p18 = pos("map-2016.json"), pos("map-2018.json")
    assert set(p16) <= set(p18)
    assert all(p16[c] == p18[c] for c in p16)
    assert export["map-2016.json"]["layout_year"] == 2018


def test_poison_year_n_contains_nothing_from_later(works, predictor):
    """Final year N=2018: poisoning every work after 2018 changes nothing in any file."""
    clean_out = build_export(works, YEARS, predictor, **KW)
    poisoned = poison_after(works, 2018)
    assert poisoned != works
    out = build_export(poisoned, YEARS, predictor, **KW)
    assert json.dumps(out, sort_keys=True) == json.dumps(clean_out, sort_keys=True)


def test_poison_earlier_year_changes_only_positions(works, predictor):
    """The 2016 map, with the layout year held at 2018, ignores works after 2016 except x/y."""
    a = build_export(works, YEARS, predictor, **KW)["map-2016.json"]
    b = build_export(poison_after(works, 2016), YEARS, predictor, **KW)["map-2016.json"]
    strip = lambda m: {
        "edges": m["edges"],
        "concepts": [{k: v for k, v in c.items() if k not in ("x", "y")} for c in m["concepts"]],
    }
    assert strip(a) == strip(b)
    assert a["layout_year"] == b["layout_year"] == 2018  # positions are documented as final-snapshot


def test_gap_components_multiply(export):
    items = export["gaps.json"]["items"]
    assert items
    for it in items:
        f = it["factors"]
        assert f["gap_factor"] == 1.0  # open problems not mined: factor omitted
        assert it["gap_score"] == pytest.approx(f["p_link"] * f["momentum"] * f["novelty"] * f["gap_factor"])
        assert it["momentum"] == pytest.approx(sigmoid(MOMENTUM_K * min(it["growth_a"], it["growth_b"])))
        assert it["novelty"] == pytest.approx(1 - it["neighbour_overlap"])
        assert it["cosine"] is None and it["gap_rate"] is None
        assert it["p_lo"] is None and it["p_hi"] is None
        assert it["interval_validation"]["validated"] is False
    scores = [it["gap_score"] for it in items]
    assert scores == sorted(scores, reverse=True)


def test_momentum_requires_both_topics_growing():
    both = gap_score_parts(0.2, 1.0, 1.0, neighbour_overlap=0.3)["momentum"]
    shrinking = gap_score_parts(0.2, 1.9, -0.35, neighbour_overlap=0.3)["momentum"]
    assert shrinking < both
    assert shrinking == pytest.approx(sigmoid(MOMENTUM_K * -0.35))
    for ga, gb in [(6.0, 6.0), (-5.0, -5.0), (0.0, 0.0), (1.9, -0.35)]:
        assert 0.0 < gap_score_parts(0.2, ga, gb, neighbour_overlap=0.3)["momentum"] < 1.0


def test_gaps_json_states_momentum_formula(export):
    assert export["gaps.json"]["momentum_formula"] == "sigmoid(2.0 * min(growth_a, growth_b))"
    assert "min(growth_a, growth_b)" in export["gaps.json"]["formula_used"]


def test_gap_score_parts_with_all_inputs():
    p = gap_score_parts(0.2, 0.5, 0.25, neighbour_overlap=0.3, cosine=0.6, gap_rate_a=0.1, gap_rate_b=0.2)
    assert p["gap_score"] == pytest.approx(0.2 * sigmoid(0.5) * (1 - 0.6) * (1 + 0.1 + 0.2))
    assert p["gap_rate"] == pytest.approx(0.3)
    missing = gap_score_parts(0.2, 0.5, 0.25, neighbour_overlap=0.3)
    assert missing["gap_score"] == pytest.approx(0.2 * sigmoid(0.5) * 0.7)
    assert missing["gap_rate"] is None


def test_gap_rates_used_when_supplied(works, predictor):
    rates = {f"c{k:03d}": 0.1 for k in range(200)}
    out = build_export(works, YEARS, predictor, gap_rates=rates, **KW)
    it = out["gaps.json"]["items"][0]
    assert it["gap_rate"] == pytest.approx(0.2)
    assert it["factors"]["gap_factor"] == pytest.approx(1.2)
    assert "gap_rate_a" in out["gaps.json"]["formula_used"]
    assert not any("gap_rate" in o for o in out["gaps.json"]["omitted_components"])


def test_not_a_probability_and_omissions_stated(export):
    gaps, meta = export["gaps.json"], export["meta.json"]
    assert "not a probability" in gaps["note"]
    assert "gap_rate" not in gaps["formula_used"] and "cosine" not in gaps["formula_used"]
    assert any("cosine" in o for o in meta["gap_score"]["omitted_components"])
    assert any("gap_rate" in o for o in meta["gap_score"]["omitted_components"])
    assert meta["gap_score"]["formula_used"] == gaps["formula_used"]


def test_no_abstract_text_anywhere(export):
    def keys(o):
        if isinstance(o, dict):
            for k, v in o.items():
                yield k
                yield from keys(v)
        elif isinstance(o, list):
            for v in o:
                yield from keys(v)
    all_keys = set(keys(export))
    assert not {k for k in all_keys if "abstract" in k.lower() or k in ("sentence", "text")}
    for detail in export["gap-details.json"].values():
        for p in detail["closest_a"] + detail["closest_b"]:
            assert set(p) == {"id", "title", "year", "url"}
        assert detail["open_problems"] == []


def test_no_future_papers_in_details(export):
    for d in export["gap-details.json"].values():
        for p in d["closest_a"] + d["closest_b"]:
            assert p["year"] <= 2018


def test_meta_headline_null_without_backtest(export):
    h = export["meta.json"]["headline_metrics"]
    assert set(h) and all(v is None for v in h.values())
    assert export["meta.json"]["backtest_available"] is False


def _backtest(manifest):
    return {
        "manifest": manifest,
        "test": {"2020": {"headline": {
            "verdict": "inconclusive", "best_baseline": "adamic_adar",
            "paired_difference": {
                "average_precision": {"observed": 0.01, "ci_low": -0.02, "ci_high": 0.04},
                "precision_at_100": {"observed": float("nan"), "ci_low": 0.0, "ci_high": 0.1},
            }}}},
    }


def test_meta_headline_copied_from_real_backtest(works, predictor):
    meta = build_export(works, YEARS, predictor, backtest=_backtest({"data_label": "real"}), **KW)["meta.json"]
    h = meta["headline_metrics"]
    assert h["average_precision_difference"] == 0.01 and h["verdict"] == "inconclusive"
    assert h["precision_at_100_difference"] is None  # NaN to null
    assert h["backtest_data_label"] == "real" and h["test_origin"] == 2020
    assert meta["backtest_available"] is True and meta["backtest_data_label"] == "real"
    assert headline_from_backtest({"manifest": {"data_label": "real"},
                                   "test": {"2020": {"headline": {"undefined": "x"}}}})["verdict"] is None


@pytest.mark.parametrize("manifest,label", [
    ({"data_label": "synthetic"}, "synthetic"),
    ({"data_label": "unlabelled"}, "unlabelled"),
    (None, "unlabelled"),
    ({}, "unlabelled"),
    ({"data_label": "real", "generator": {"n_works": 5}}, "real"),
])
def test_meta_headline_null_unless_real(works, predictor, manifest, label):
    bt = _backtest(manifest)
    if manifest is None:
        del bt["manifest"]
    meta = build_export(works, YEARS, predictor, backtest=bt, **KW)["meta.json"]
    h = meta["headline_metrics"]
    assert all(v is None for k, v in h.items() if k != "backtest_data_label")
    assert h["backtest_data_label"] == label
    assert meta["backtest_available"] is False and meta["backtest_data_label"] == label


def test_nan_to_null_and_writer(tmp_path, export):
    assert clean({"a": float("nan"), "b": [float("inf"), np.float32(1.5), np.int64(2)]}) == \
        {"a": None, "b": [None, 1.5, 2]}
    with pytest.raises(ValueError):
        write_export(tmp_path, {"bad.json": {"x": float("nan")}})
    paths = write_export(tmp_path / "out", export)
    names = {p.name for p in paths}
    assert {"map-2016.json", "map-2018.json", "gaps.json", "gap-details.json", "meta.json"} <= names
    for p in paths:
        json.loads(p.read_text(encoding="utf-8"))
    assert not any(math.isnan(c["growth"]) for c in export["map-2018.json"]["concepts"])
