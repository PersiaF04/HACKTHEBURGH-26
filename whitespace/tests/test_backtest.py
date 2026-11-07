"""Tests for features, the logistic model and the purged backtest runner (issue #151).

SYNTHETIC SANITY CHECKS ONLY. The corpora come from ``pipeline/synthetic.py`` with a planted
signal or none. These tests say the harness behaves; they say nothing about real literature,
and the model has never seen real data.
"""
import datetime as dt
import json
import logging
import math
from itertools import count

import numpy as np
import pytest

from whitespace.pipeline import metrics as M
from whitespace.pipeline.backtest import (
    BacktestConfig, OneShotError, OneShotGuard, evaluate_origin, run_backtest, score_origin, train,
    origin_context,
)
from whitespace.pipeline.common import Work
from whitespace.pipeline.features import FEATURE_NAMES, build_context, feature_block, feature_matrix
from whitespace.pipeline.graphs import build_snapshot, eligible_pairs
from whitespace.pipeline.labels import labels
from whitespace.pipeline.model import LogisticModel, Platt, newton_logistic, sigmoid, subsample_negatives
from whitespace.pipeline.synthetic import generate_works, poison_after

CONFIG = BacktestConfig(fit_origins=(2012, 2013, 2014), calibration_origins=(2017,), test_origins=(2020,), seed=0)
SEED = 1  # synthetic corpus seed, listed in the PR

_ids = count()


def work(year, *concepts, month=6):
    return Work(f"T{next(_ids)}", dt.date(year, month, 1), tuple(concepts))


@pytest.fixture(scope="module")
def signal_works():
    return generate_works(signal=True, seed=SEED)


@pytest.fixture(scope="module")
def null_works():
    return generate_works(signal=False, seed=SEED)


@pytest.fixture(scope="module")
def signal_metrics(signal_works):
    return run_backtest(signal_works, CONFIG, guard=OneShotGuard(), data_label="synthetic",
                        generator={"signal": True, "seed": SEED, "n_works": len(signal_works)})


@pytest.fixture(scope="module")
def null_metrics(null_works):
    return run_backtest(null_works, CONFIG, guard=OneShotGuard(), data_label="synthetic",
                        generator={"signal": False, "seed": SEED, "n_works": len(null_works)})


# ---- (a) planted signal: the model beats the best baseline on identical pairs ---------------


def test_signal_model_beats_every_baseline_on_test_origin(signal_metrics):
    t = signal_metrics["test"]["2020"]
    model = t["model"]["all"]
    best_p100 = max(b["all"]["precision_at_100"] for b in t["baselines"].values())
    best_ap = max(b["all"]["average_precision"] for b in t["baselines"].values())
    assert model["precision_at_100"] > best_p100
    assert model["average_precision"] > best_ap
    assert t["headline"]["verdict"].startswith("model beats best baseline")
    assert signal_metrics["training"]["model_converged"] and signal_metrics["training"]["platt_converged"]


def test_test_metrics_use_full_universe_for_model_and_baselines(signal_works, signal_metrics):
    t = signal_metrics["test"]["2020"]
    universe = eligible_pairs(build_snapshot(signal_works, 2020), CONFIG.n_min)
    assert t["eligible_universe"] == len(universe) and t["subsampled"] is False
    assert t["model"]["all"]["pairs"] == len(universe)
    assert all(b["all"]["pairs"] == len(universe) for b in t["baselines"].values())
    # strata by starting weight partition the universe and carry their own base rates
    parts = [t["model"][w]["pairs"] for w in "012"]
    assert sum(parts) == len(universe)
    for w in "012":
        assert t["strata_base_rates"][w]["pairs"] == t["model"][w]["pairs"]
        assert all(b[w]["pairs"] == t["model"][w]["pairs"] for b in t["baselines"].values())
    # negatives were subsampled for training only
    for info in signal_metrics["training"]["fit_origins"].values():
        if info["train_rows"]:
            assert info["train_rows"] <= 11 * info["positives"]
            assert info["train_rows"] <= info["universe"]
    assert signal_metrics["training"]["subsampling"] == "training only"


def test_metrics_dict_is_json_and_has_manifest(signal_metrics, signal_works):
    parsed = json.loads(json.dumps(signal_metrics))
    man = parsed["manifest"]
    assert man["seed"] == 0 and man["test_origins"] == [2020] and len(man["config_hash"]) == 64
    assert man["generator_size"] == len(signal_works) and man["data_label"] == "synthetic"
    assert parsed["best_baseline"]["chosen_on"] == "calibration origins"
    t = parsed["test"]["2020"]
    for key in ("precision_at_100", "recall_at_100", "lift_at_100", "average_precision", "roc_auc"):
        assert key in t["model"]["all"] and key in t["baselines"]["current_weight"]["all"]
    assert set(t["calibration"]) >= {"brier", "ece", "bin_count"}


def test_run_is_deterministic(signal_works, signal_metrics):
    again = run_backtest(signal_works, CONFIG, guard=OneShotGuard(), data_label="synthetic",
                         generator={"signal": True, "seed": SEED, "n_works": len(signal_works)})
    assert again == signal_metrics


# ---- (b) null corpus: no improvement, reported plainly -------------------------------------


def test_null_corpus_reports_no_improvement(null_metrics):
    h = null_metrics["test"]["2020"]["headline"]
    assert h["verdict"].startswith("no improvement")
    assert h["paired_difference"]["average_precision"]["ci_low"] <= 0
    t = null_metrics["test"]["2020"]
    best_ap = max(b["all"]["average_precision"] for b in t["baselines"].values())
    assert t["model"]["all"]["average_precision"] - best_ap < 0.03


# ---- (c) poison test ------------------------------------------------------------------------


def test_poisoning_later_works_leaves_features_and_scores_unchanged(signal_works):
    trained = train(signal_works, CONFIG)
    poisoned = poison_after(signal_works, 2020)
    assert poisoned != signal_works
    pairs, ctx, d, p = score_origin(signal_works, trained, 2020, CONFIG.n_min)
    pairs2, ctx2, d2, p2 = score_origin(poisoned, trained, 2020, CONFIG.n_min)
    assert np.array_equal(pairs.i, pairs2.i) and np.array_equal(pairs.j, pairs2.j)
    assert np.array_equal(feature_matrix(ctx), feature_matrix(ctx2))
    assert np.array_equal(d, d2) and np.array_equal(p, p2)
    # the poison is not vacuous: labels (which may look ahead) do change
    assert not np.array_equal(labels(signal_works, 2020, pairs), labels(poisoned, 2020, pairs))


def test_poisoning_after_fit_origin_leaves_training_unchanged(signal_works):
    # poison everything after 2017: fit origins (<= 2014, labels to 2017) and the 2017
    # calibration features must be unchanged, so the trained model is identical
    a = train(signal_works, CONFIG)
    b = train(poison_after(signal_works, 2017), CONFIG)
    assert np.array_equal(a.model.coef, b.model.coef) and a.model.intercept == b.model.intercept


# ---- (d) purge ----------------------------------------------------------------------------


def test_purge_rejects_2019_calibration_origin_for_2020_test(signal_works):
    bad = BacktestConfig((2012, 2013, 2014), (2019,), (2020,))
    with pytest.raises(ValueError, match="calibration origin 2019"):
        run_backtest(signal_works, bad, guard=OneShotGuard())
    with pytest.raises(ValueError, match="fit origin"):
        run_backtest(signal_works, BacktestConfig((2012, 2015), (2017,), (2020,)), guard=OneShotGuard())


# ---- (e) one-shot guard ---------------------------------------------------------------------


def test_one_shot_guard_blocks_second_scoring_unless_overridden(signal_works, caplog, tmp_path):
    guard = OneShotGuard(tmp_path / "ledger.json")
    first = run_backtest(signal_works, CONFIG, guard=guard)
    assert first["one_shot_override_used"] is False
    with pytest.raises(OneShotError):
        run_backtest(signal_works, CONFIG, guard=guard)
    with pytest.raises(OneShotError):  # the ledger on disk survives a new guard object
        run_backtest(signal_works, CONFIG, guard=OneShotGuard(tmp_path / "ledger.json"))
    with caplog.at_level(logging.WARNING):
        third = run_backtest(signal_works, CONFIG, guard=guard, override_one_shot=True)
    assert third["one_shot_override_used"] is True and "ONE-SHOT OVERRIDE" in caplog.text
    # a different configuration is a different run
    other = BacktestConfig(CONFIG.fit_origins, CONFIG.calibration_origins, CONFIG.test_origins, seed=5)
    assert run_backtest(signal_works, other, guard=guard)["one_shot_override_used"] is False


def test_test_labels_not_read_before_guard(signal_works, monkeypatch):
    guard = OneShotGuard()
    run_backtest(signal_works, CONFIG, guard=guard)
    import whitespace.pipeline.backtest as bt

    seen = []
    real = bt.labels
    monkeypatch.setattr(bt, "labels", lambda w, o, *a, **k: seen.append(o) or real(w, o, *a, **k))
    with pytest.raises(OneShotError):
        run_backtest(signal_works, CONFIG, guard=guard)
    assert 2020 not in seen


# ---- model units ----------------------------------------------------------------------------


def test_newton_logistic_recovers_known_coefficients_and_converges():
    rng = np.random.default_rng(0)
    X = rng.normal(size=(20000, 3))
    true = np.array([-1.0, 2.0, -1.0, 0.5])
    y = rng.random(20000) < sigmoid(true[0] + X @ true[1:])
    beta, converged, n_iter = newton_logistic(X, y, l2=1e-6)
    assert converged and n_iter < 20
    assert beta == pytest.approx(true, abs=0.1)


def test_l2_shrinks_coefficients():
    rng = np.random.default_rng(1)
    X = rng.normal(size=(500, 2))
    y = rng.random(500) < sigmoid(2 * X[:, 0])
    weak, _, _ = newton_logistic(X, y, l2=0.01)
    strong, _, _ = newton_logistic(X, y, l2=500.0)
    assert np.linalg.norm(strong[1:]) < 0.3 * np.linalg.norm(weak[1:])


def test_subsample_negatives_keeps_all_positives_ratio_and_is_seeded():
    y = np.zeros(1000, bool)
    y[::50] = True  # 20 positives
    idx = subsample_negatives(y, 10, seed=3)
    assert y[idx].sum() == 20 and len(idx) == 220 and (idx == np.sort(idx)).all()
    assert np.array_equal(idx, subsample_negatives(y, 10, seed=3))
    assert not np.array_equal(idx, subsample_negatives(y, 10, seed=4))
    assert len(subsample_negatives(y, 1000, seed=0)) == 1000  # cannot exceed the negatives available


def test_platt_corrects_the_prior_shift_from_negative_subsampling():
    rng = np.random.default_rng(2)
    X = rng.normal(size=(60000, 2))
    y = rng.random(60000) < sigmoid(-4 + 1.5 * X[:, 0])  # rare positives
    idx = subsample_negatives(y, 10, seed=0)
    model = LogisticModel(l2=1.0).fit(X[idx], y[idx])
    assert model.converged
    raw = sigmoid(model.decision(X))
    assert raw.mean() > 1.5 * y.mean()  # subsampled model over-predicts on the full pool
    p = Platt().fit(model.decision(X), y).predict(model.decision(X))
    assert p.mean() == pytest.approx(y.mean(), rel=0.05)
    assert M.calibration(p, y).ece < 0.01


def test_model_requires_both_classes():
    with pytest.raises(ValueError):
        LogisticModel().fit(np.zeros((4, 2)), np.zeros(4))


# ---- works_for_origin(T): per-origin concept assignment (issue #164) -------------------------


def test_works_for_origin_callable_gives_each_origin_its_own_universe():
    base = generate_works(signal=True, seed=SEED)

    def relabel(w, tag):
        return Work(w.id, w.date, tuple(f"{c}{tag}" for c in w.concepts))

    def works_for_origin(origin):  # a different concept vocabulary at every origin
        return [relabel(w, f"_o{origin}") for w in base if w.date.year <= origin + 3]

    cfg = BacktestConfig((2012, 2013), (2016,), (2019,), seed=0, n_boot=5)
    ctx = {o: origin_context(works_for_origin(o), o, cfg.n_min)[0] for o in (2012, 2013)}
    assert ctx[2012].names != ctx[2013].names
    assert all(n.endswith("_o2012") for n in ctx[2012].names) and all(n.endswith("_o2013") for n in ctx[2013].names)
    result = run_backtest(works_for_origin, cfg, guard=OneShotGuard())
    assert result["training"]["fit_origins"][2012]["universe"] == len(ctx[2012])
    assert result["training"]["fit_origins"][2013]["universe"] == len(ctx[2013])
    assert set(result["manifest"]["n_works"]) == {"2012", "2013", "2016", "2019"}
    # the same list, passed whole, still works and keeps its numeric n_works
    assert run_backtest(base, cfg, guard=OneShotGuard())["manifest"]["n_works"] == len(base)


def test_return_test_artifacts_is_opt_in_and_guarded(signal_works):
    cfg = BacktestConfig((2012, 2013), (2016,), (2019,), seed=0, n_boot=5)
    guard = OneShotGuard()
    plain = run_backtest(signal_works, cfg, guard=OneShotGuard())
    assert "artifacts" not in plain
    res = run_backtest(signal_works, cfg, guard=guard, return_test_artifacts=True)
    a = res["artifacts"]["2019"]
    n = res["test"]["2019"]["eligible_universe"]
    assert len(a["pairs"]) == len(a["calibrated_score"]) == len(a["labels"]) == len(a["starting_weight"]) == n
    assert a["labels"].sum() == res["test"]["2019"]["strata_base_rates"]["all"]["positives"]
    assert res["test"] == plain["test"]  # same numbers either way
    with pytest.raises(OneShotError):  # the guard still fires once
        run_backtest(signal_works, cfg, guard=guard, return_test_artifacts=True)
