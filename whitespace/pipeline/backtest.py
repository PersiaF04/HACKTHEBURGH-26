"""Purged backtest runner (issue #151). Pure computation, no network; optional ledger file.

Flow (``run_backtest``): check ``assert_purged`` -> claim the one-shot guard -> train on the
fit origins (negatives subsampled 10:1, training only) -> fit Platt calibration on the
calibration origin (full universe) -> score each test origin on its FULL eligible universe,
the model and every baseline on identical pairs -> return the ``metrics`` dict.

Rules enforced here
* All features at origin T come from works dated <= 31 Dec T (see ``features.py``).
* Test labels are first read in the final stage. Test origins are scored once per
  configuration: ``OneShotGuard.claim`` raises on a repeat unless ``override=True``, which is
  logged (``logging`` warning) and recorded in ``metrics["one_shot_override_used"]``.
* The best baseline is chosen on the calibration origin (average precision, all strata),
  never on a test origin. The headline is pre-registered below as ``HEADLINE``.
* Ties: baselines have many exact ties, so rows are permuted with a seeded permutation
  before ranking (same permutation for the model and every baseline).
"""
from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np

from . import metrics as M
from .common import HORIZON_YEARS, LINK_THRESHOLD, MIN_PAPERS, Work, assert_purged
from .features import FEATURE_NAMES, build_context, feature_blocks, feature_matrix
from .graphs import PairSet, build_snapshot, eligible_pairs
from .labels import labels, strata
from .model import LogisticModel, Platt, subsample_negatives

log = logging.getLogger(__name__)

# Pre-registered headline: fixed in code before any test origin is scored.
HEADLINE = {"metric": "average_precision", "stratum": "all", "also": "precision_at_100"}
STRATA = ("0", "1", "2", "all")


class OneShotError(RuntimeError):
    """The test origin was already scored for this configuration."""


class OneShotGuard:
    """Remembers which configuration hashes have scored a test origin (optionally on disk)."""

    def __init__(self, path: str | Path | None = None):
        self.path = Path(path) if path else None
        self.used: set[str] = set()
        if self.path and self.path.exists():
            self.used = set(json.loads(self.path.read_text()))

    def claim(self, key: str, override: bool = False) -> bool:
        """Mark ``key`` as scored. Returns True if this was an override of an earlier claim."""
        repeat = key in self.used
        if repeat and not override:
            raise OneShotError(
                f"test origin already scored for configuration {key[:12]}; "
                "pass override_one_shot=True to rerun (the override is logged and recorded)"
            )
        if repeat:
            log.warning("ONE-SHOT OVERRIDE: re-scoring the test origin for configuration %s", key)
        self.used.add(key)
        if self.path:
            self.path.write_text(json.dumps(sorted(self.used)))
        return repeat


DEFAULT_GUARD = OneShotGuard()


@dataclass(frozen=True)
class BacktestConfig:
    fit_origins: tuple[int, ...]
    calibration_origins: tuple[int, ...]
    test_origins: tuple[int, ...]
    seed: int = 0
    l2: float = 1.0
    neg_ratio: int = 10
    n_min: int = MIN_PAPERS
    horizon: int = HORIZON_YEARS
    ks: tuple[int, ...] = (100, 1000)
    n_boot: int = 200


def config_hash(config: BacktestConfig, works: list[Work]) -> str:
    """Hash of the configuration plus a fingerprint of the corpus (ids and dates)."""
    corpus = hashlib.sha256()
    for w in sorted(works, key=lambda w: w.id):
        corpus.update(f"{w.id}|{w.date.isoformat()}|{','.join(w.concepts)};".encode())
    payload = json.dumps({"config": asdict(config), "corpus": corpus.hexdigest()}, sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()


# ---------------------------------------------------------------- training and scoring


@dataclass
class Trained:
    model: LogisticModel
    platt: Platt
    info: dict


def _decision(model: LogisticModel, ctx) -> np.ndarray:
    out = np.empty(len(ctx.pairs))
    for rows, X in feature_blocks(ctx):
        out[rows] = model.decision(X)
    return out


def origin_context(works: list[Work], origin: int, n_min: int):
    snap = build_snapshot(works, origin)
    pairs = eligible_pairs(snap, n_min)
    return pairs, build_context(works, snap, pairs)


def train(works: list[Work], config: BacktestConfig) -> Trained:
    """Fit on the fit origins (subsampled negatives) then Platt-calibrate on the calibration
    origins' full universes. Reads no test origin and no work dated after the latest label
    window of the calibration origins."""
    xs, ys, sizes = [], [], {}
    for origin in config.fit_origins:
        pairs, ctx = origin_context(works, origin, config.n_min)
        y = labels(works, origin, pairs, config.horizon)
        if not y.any() or y.all():
            raise ValueError(f"fit origin {origin} has no positives or no negatives")
        idx = subsample_negatives(y, config.neg_ratio, config.seed + origin)
        xs.append(feature_matrix(ctx, idx))
        ys.append(y[idx])
        sizes[origin] = {"universe": len(pairs), "positives": int(y.sum()), "train_rows": len(idx)}
    model = LogisticModel(config.l2).fit(np.vstack(xs), np.concatenate(ys))
    ds, yc = [], []
    for origin in config.calibration_origins:
        pairs, ctx = origin_context(works, origin, config.n_min)
        yc.append(labels(works, origin, pairs, config.horizon))
        ds.append(_decision(model, ctx))
        sizes[origin] = {"universe": len(pairs), "positives": int(yc[-1].sum()), "train_rows": 0}
    platt = Platt().fit(np.concatenate(ds), np.concatenate(yc))
    info = {
        "fit_origins": sizes,
        "model_converged": model.converged, "model_iterations": model.n_iter,
        "platt_converged": platt.converged, "platt_a": platt.a, "platt_b": platt.b,
        "coefficients": dict(zip(FEATURE_NAMES, map(float, model.coef))),
    }
    return Trained(model, platt, info)


def score_origin(works: list[Work], trained: Trained, origin: int, n_min: int):
    """Full-universe scores at ``origin``: (pairs, ctx, decision, calibrated probability)."""
    pairs, ctx = origin_context(works, origin, n_min)
    d = _decision(trained.model, ctx)
    return pairs, ctx, d, trained.platt.predict(d)


# ---------------------------------------------------------------- metrics


def _metric_block(scores: np.ndarray, y: np.ndarray, ks) -> dict:
    out: dict = {"pairs": int(len(y)), "positives": int(y.sum())}
    try:
        out["base_rate"] = float(y.mean())
        for k in ks:
            p, r, l = M.precision_at_k(scores, y, k), M.recall_at_k(scores, y, k), M.lift(scores, y, k)
            out[f"precision_at_{k}"] = p.value
            out[f"recall_at_{k}"] = r.value
            out[f"lift_at_{k}"] = l.value
            out[f"k_used_{k}"] = p.k_used
        out["average_precision"] = M.average_precision(scores, y).value
        out["roc_auc"] = M.roc_auc(scores, y).value
    except (M.DegenerateLabelsError, ValueError) as exc:
        out["undefined"] = str(exc)
    return out


def _by_stratum(scores: np.ndarray, y: np.ndarray, weight: np.ndarray, ks) -> dict:
    out = {}
    for name in STRATA:
        mask = np.ones(len(y), bool) if name == "all" else weight == int(name)
        out[name] = _metric_block(scores[mask], y[mask], ks) if mask.any() else {"pairs": 0, "undefined": "empty"}
    return out


def _ap(y, s):
    return M.average_precision(s, y).value


def _p100(y, s):
    return M.precision_at_k(s, y, 100).value


def _verdict(diff: M.BootstrapResult, best: str) -> str:
    if diff.ci_low > 0:
        return f"model beats best baseline ({best}) on {HEADLINE['metric']}: interval excludes 0"
    if diff.observed > 0:
        return f"inconclusive: model is ahead of best baseline ({best}) but the interval includes 0"
    return f"no improvement: model does not beat best baseline ({best}) on {HEADLINE['metric']}"


def evaluate_origin(works, trained, config, origin, best_baseline: str) -> dict:
    """Metrics for one test origin on the full eligible universe (labels read here)."""
    pairs, ctx, d, prob = score_origin(works, trained, origin, config.n_min)
    y = labels(works, origin, pairs, config.horizon)
    perm = np.random.default_rng(config.seed + 1000 + origin).permutation(len(y))
    pairs_p = PairSet(pairs.names, pairs.i[perm], pairs.j[perm], pairs.weight[perm])
    y, d, prob = y[perm], d[perm], prob[perm]
    systems = {"model": d, **{k: v[perm] for k, v in ctx.scores.items()}}
    result = {
        "eligible_universe": len(pairs),
        "subsampled": False,
        "strata_base_rates": strata(pairs_p, y),
        "model": _by_stratum(d, y, pairs_p.weight, config.ks),
        "baselines": {k: _by_stratum(v, y, pairs_p.weight, config.ks) for k, v in systems.items() if k != "model"},
    }
    try:
        cal = M.calibration(prob, y, 10)
        result["calibration"] = {
            "bin_count": cal.bin_count.tolist(), "mean_predicted": cal.mean_predicted.tolist(),
            "observed_rate": cal.observed_rate.tolist(), "brier": cal.brier,
            "brier_skill": cal.brier_skill, "ece": cal.ece,
        }
    except (M.DegenerateLabelsError, ValueError) as exc:
        result["calibration"] = {"undefined": str(exc)}
    try:
        boot = {
            name: M.grouped_bootstrap_diff(
                y, d, systems[best_baseline], pairs_p.i, metric=fn,
                n_boot=config.n_boot, seed=config.seed,
            )
            for name, fn in (("average_precision", _ap), ("precision_at_100", _p100))
        }
        result["headline"] = {
            **HEADLINE, "best_baseline": best_baseline,
            "paired_difference": {k: {"observed": b.observed, "ci_low": b.ci_low, "ci_high": b.ci_high,
                                      "n_boot": b.n_boot, "n_used": b.n_used, "groups": "lower-index concept"}
                                  for k, b in boot.items()},
            "verdict": _verdict(boot["average_precision"], best_baseline),
        }
    except (M.DegenerateLabelsError, ValueError) as exc:
        result["headline"] = {**HEADLINE, "best_baseline": best_baseline, "undefined": str(exc),
                              "verdict": "undefined: no positives or no negatives on this origin"}
    return result


def choose_best_baseline(works, trained, config) -> tuple[str, dict]:
    """Best baseline by average precision (all strata) pooled over the calibration origins
    (dev data, never a test origin). Returns its name and every baseline's score."""
    ys, scores = [], {}
    for origin in config.calibration_origins:
        pairs, ctx = origin_context(works, origin, config.n_min)
        ys.append(labels(works, origin, pairs, config.horizon))
        for k, v in ctx.scores.items():
            scores.setdefault(k, []).append(v)
    y = np.concatenate(ys)
    perm = np.random.default_rng(config.seed + 7).permutation(len(y))
    ap = {k: M.average_precision(np.concatenate(v)[perm], y[perm]).value for k, v in scores.items()}
    return max(ap, key=ap.get), ap


def run_backtest(
    works,
    config: BacktestConfig,
    *,
    guard: OneShotGuard | None = None,
    override_one_shot: bool = False,
    data_label: str = "unspecified",
    generator: dict | None = None,
) -> dict:
    """Run the purged backtest and return the ``metrics`` dict (see whitespace/README.md)."""
    works = list(works)
    assert_purged(config.fit_origins, config.calibration_origins, config.test_origins, config.horizon)
    key = config_hash(config, works)
    trained = train(works, config)
    best, dev_ap = choose_best_baseline(works, trained, config)
    # last gate before any test label is read
    overridden = (guard or DEFAULT_GUARD).claim(key, override_one_shot)
    per_origin = {str(o): evaluate_origin(works, trained, config, o, best) for o in config.test_origins}
    return {
        "manifest": {
            "config_hash": key, "seed": config.seed, "config": asdict(config),
            "fit_origins": list(config.fit_origins), "calibration_origins": list(config.calibration_origins),
            "test_origins": list(config.test_origins), "n_works": len(works),
            "link_threshold": LINK_THRESHOLD, "data_label": data_label,
            "generator": generator, "generator_size": (generator or {}).get("n_works"),
        },
        "one_shot_override_used": overridden,
        "training": trained.info | {"negatives_per_positive": config.neg_ratio, "subsampling": "training only"},
        "best_baseline": {"name": best, "chosen_on": "calibration origins", "average_precision": dev_ap},
        "headline": HEADLINE,
        "test": per_origin,
    }
