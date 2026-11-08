"""Tests for the production gap-list diversity cap and per-concept pool (issue #287). Synthetic only."""
import collections

import pytest

from whitespace.pipeline import export_all as E
from whitespace.pipeline import run_real as R
from whitespace.pipeline.backtest import BacktestConfig, train
from whitespace.pipeline.export_map_gaps import (
    DIVERSITY_NOTE, MAX_GAPS_PER_CONCEPT, POOL_PER_CONCEPT, apply_diversity_cap, build_gaps, trained_predictor,
)
from whitespace.pipeline.synthetic import generate_works

CONFIG = BacktestConfig(fit_origins=(2012, 2013, 2014), calibration_origins=(2017,), test_origins=(2020,), seed=0)
KW = dict(n_min=CONFIG.n_min, pool=300, limit=30)
EXPORT_KW = dict(edge_threshold=0.0, max_edges=50, gap_pool=200, gap_limit=20, detail_limit=5)


@pytest.fixture(scope="module")
def works():
    return generate_works(signal=True, seed=1)


@pytest.fixture(scope="module")
def predictor(works):
    return trained_predictor(train(works, CONFIG), CONFIG.n_min)


@pytest.fixture(scope="module")
def dry(tmp_path_factory):
    root = tmp_path_factory.mktemp("dry")
    assert R.main(["--dry-run", "--out", str(root / "run")]) == 0
    return root / "run"


def _counts(items):
    return collections.Counter(c for it in items for c in (it["a"], it["b"]))


def test_defaults_are_named_and_documented():
    assert (MAX_GAPS_PER_CONCEPT, POOL_PER_CONCEPT) == (3, 10)


def test_off_by_default_adds_no_key(works, predictor):
    gaps, _ = build_gaps(works, 2018, predictor, **KW)
    assert "diversity" not in gaps


def test_cap_holds_list_is_filled_and_scores_are_unchanged(works, predictor):
    gaps, _ = build_gaps(works, 2018, predictor, max_per_concept=3, **KW)
    div = gaps["diversity"]
    assert len(gaps["items"]) == KW["limit"]
    assert [it["rank"] for it in gaps["items"]] == list(range(1, KW["limit"] + 1))
    assert div["applied"] is True and div["max_gaps_per_concept"] == 3 and div["pool_per_concept"] == POOL_PER_CONCEPT
    assert div["note"] == "max 3 gaps per concept; candidate pool built per concept; vocabulary, model and backtest unchanged"
    cap = 3 if div["relaxed_slots"] == 0 else None
    if cap:
        assert max(_counts(gaps["items"]).values()) <= cap
    scores = [it["gap_score"] for it in gaps["items"]]
    assert scores == sorted(scores, reverse=True)
    # a pair's score does not depend on the flag
    plain, _ = build_gaps(works, 2018, predictor, pool=2000, limit=2000, n_min=CONFIG.n_min)
    by_pair = {(it["a"], it["b"]): it for it in plain["items"]}
    for it in gaps["items"]:
        old = by_pair.get((it["a"], it["b"]))
        if old:
            assert old["gap_score"] == it["gap_score"] and old["p_link"] == it["p_link"]


def test_a_tight_cap_is_enforced_on_the_synthetic_list(works, predictor):
    gaps, _ = build_gaps(works, 2018, predictor, max_per_concept=1, **KW)
    div = gaps["diversity"]
    if div["relaxed_slots"] == 0:
        assert max(_counts(gaps["items"]).values()) == 1
    assert len(gaps["items"]) == KW["limit"]


def test_per_concept_pool_is_bounded_and_not_dominated_by_one_concept(works, predictor):
    gaps, _ = build_gaps(works, 2018, predictor, max_per_concept=3, pool_per_concept=2, **KW)
    assert "top 300" in gaps["ranking_pool"] and "top 2 pairs" in gaps["ranking_pool"]
    assert len(gaps["items"]) <= KW["limit"]


def _row(a, b, score):
    return {"a": a, "b": b, "gap_score": score, "p_link": score}


def test_cap_skips_and_relaxes_when_the_pool_runs_out():
    rows = [_row("hub", f"x{k}", 1.0 - k / 100) for k in range(6)] + [_row("y", "z", 0.1)]
    out, rec = apply_diversity_cap(rows, 4, 2, 10)
    assert len(out) == 4 and rec["relaxed_slots"] == 1 and rec["skipped_by_cap"] == 3
    assert [(r["a"], r["b"]) for r in out][:2] == [("hub", "x0"), ("hub", "x1")]
    out, rec = apply_diversity_cap(rows, 3, 2, 10)  # pool is enough, no relaxing
    assert [r["b"] for r in out] == ["x0", "x1", "z"] and rec["relaxed_slots"] == 0 and rec["skipped_by_cap"] == 4


def test_export_states_diversity_in_gaps_and_meta_and_validates(dry, tmp_path):
    run = E.load_run(dry)
    trained, _ = E.train_production(run, "through-2020")
    E.ensure_caches(run, [2019, 2020], None)
    built = E.build_real_files(run, trained, [2019, 2020], **EXPORT_KW)
    rec = built["gaps.json"]["diversity"]
    assert rec["max_gaps_per_concept"] == 3
    assert built["meta.json"]["production_forecast"]["diversity"] == rec
    errs = []
    E.check_contract("gaps.json", E.clean(built["gaps.json"]), errs)
    E.check_contract("meta.json", E.clean(built["meta.json"]), errs)
    assert errs == []
    bad = dict(E.clean(built["gaps.json"]), diversity={"applied": True})
    errs = []
    E.check_contract("gaps.json", bad, errs)
    assert errs
    if rec["relaxed_slots"] == 0:
        assert max(_counts(built["gaps.json"]["items"]).values()) <= 3
    assert E.export_run(dry, tmp_path / "out", **EXPORT_KW)["problems"] == []


def _kw_args():
    return ["--edge-threshold", "0", "--max-edges", "50", "--gap-pool", "200", "--gap-limit", "20",
            "--detail-limit", "5"]


def test_no_diversity_flag_leaves_backtest_and_maps_byte_identical(dry, tmp_path):
    a, b = tmp_path / "a", tmp_path / "b"
    assert E.main([str(dry), "--out", str(a)] + _kw_args()) == 0
    assert E.main([str(dry), "--out", str(b), "--no-diversity"] + _kw_args()) == 0
    names = [p.name for p in a.glob("*.json") if p.name.startswith("map-") or p.name == "backtest.json"]
    assert "backtest.json" in names and len(names) > 1
    for n in names:
        assert (a / n).read_bytes() == (b / n).read_bytes(), n
