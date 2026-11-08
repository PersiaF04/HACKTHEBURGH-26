"""Tests for the production gap-list stoplist (issue #255). Synthetic sanity checks only."""
import json

import pytest

from whitespace.pipeline import export_all as E
from whitespace.pipeline import run_real as R
from whitespace.pipeline.backtest import BacktestConfig, train
from whitespace.pipeline.export_map_gaps import GENERIC_PHRASES, build_gaps, trained_predictor
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


def test_denylist_is_short_lowercase_and_documented():
    assert 30 <= len(GENERIC_PHRASES) <= 80
    assert all(p == p.lower() and p == p.strip() for p in GENERIC_PHRASES)
    for owner_phrase in ("vice versa", "located", "many area", "already", "today", "achieving", "un", "abc",
                         "able to achieve"):
        assert owner_phrase in GENERIC_PHRASES


def test_off_by_default_adds_no_key(works, predictor):
    gaps, _ = build_gaps(works, 2018, predictor, **KW)
    assert "stoplist" not in gaps


def test_stoplisted_pairs_are_dropped_and_the_list_is_still_full(works, predictor):
    base, _ = build_gaps(works, 2018, predictor, **KW)
    assert len(base["items"]) == KW["limit"]
    top = base["items"][0]
    stop = frozenset({top["a"]})
    gaps, _ = build_gaps(works, 2018, predictor, stoplist=stop, **KW)
    assert len(gaps["items"]) == KW["limit"]  # refilled from the larger pool
    assert all(it["a"] not in stop and it["b"] not in stop for it in gaps["items"])
    assert [it["rank"] for it in gaps["items"]] == list(range(1, KW["limit"] + 1))
    rec = gaps["stoplist"]
    assert rec["applied"] is True and rec["phrases"] == sorted(stop)
    assert rec["hidden_candidates"] >= 1
    assert rec["note"] == "1 generic phrases hidden from this list; vocabulary and backtest unchanged"


def test_surviving_items_keep_their_scores(works, predictor):
    base, _ = build_gaps(works, 2018, predictor, **KW)
    stop = frozenset({base["items"][0]["a"]})
    gaps, _ = build_gaps(works, 2018, predictor, stoplist=stop, **KW)
    by_pair = {(it["a"], it["b"]): it for it in base["items"]}
    for it in gaps["items"]:
        old = by_pair.get((it["a"], it["b"]))
        if old:
            assert old["gap_score"] == it["gap_score"] and old["p_link"] == it["p_link"]


def test_export_states_the_stoplist_in_gaps_and_meta_and_validates(dry, tmp_path):
    out = tmp_path / "on"
    run = E.load_run(dry)
    trained, _ = E.train_production(run, "through-2020")
    E.ensure_caches(run, [2019, 2020], None)
    built = E.build_real_files(run, trained, [2019, 2020], **EXPORT_KW)
    rec = built["gaps.json"]["stoplist"]
    assert rec["phrases"] == sorted(GENERIC_PHRASES) and rec["applied"] is True
    assert built["meta.json"]["production_forecast"]["stoplist"] == rec
    errs = []
    E.check_contract("gaps.json", E.clean(built["gaps.json"]), errs)
    E.check_contract("meta.json", E.clean(built["meta.json"]), errs)
    assert errs == []
    assert E.export_run(dry, out, **EXPORT_KW)["problems"] == []


def test_no_stoplist_flag_restores_old_output_and_nothing_else_changes(dry, tmp_path):
    run = E.load_run(dry)
    trained, _ = E.train_production(run, "through-2020")
    years = [2019, 2020]
    E.ensure_caches(run, years, None)
    on = E.build_real_files(run, trained, years, **EXPORT_KW)
    off = E.build_real_files(run, trained, years, stoplist=None, **EXPORT_KW)
    assert "stoplist" not in off["gaps.json"]
    assert "stoplist" not in off["meta.json"]["production_forecast"]
    # maps and concepts (vocabulary) are untouched by the filter
    for name in on:
        if name.startswith("map-") or name == "concepts.json":
            assert json.dumps(on[name], sort_keys=True) == json.dumps(off[name], sort_keys=True), name
    # the CLI flag: backtest.json (and the maps) are byte-identical with and without it
    a, b = tmp_path / "a", tmp_path / "b"
    assert E.main([str(dry), "--out", str(a)] + _kw_args()) == 0
    assert E.main([str(dry), "--out", str(b), "--no-stoplist"] + _kw_args()) == 0
    for p in sorted(a.glob("*.json")):
        if p.name.startswith("map-") or p.name == "backtest.json":
            assert p.read_bytes() == (b / p.name).read_bytes(), p.name


def _kw_args():
    return ["--edge-threshold", "0", "--max-edges", "50", "--gap-pool", "200", "--gap-limit", "20",
            "--detail-limit", "5"]
