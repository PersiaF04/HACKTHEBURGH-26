"""Ranking metrics, calibration and a grouped paired bootstrap (issue #141).

Pure numpy on a score vector ``scores`` and a 0/1 label vector ``labels`` of equal length.
Higher score means "more likely positive". No data, no model: only arithmetic.

Conventions (shared by every function here)
-------------------------------------------
* **Ranking order.** Items are ranked by descending score. Exact score ties are broken by
  ascending index (position in the input arrays), via a stable sort. The order is therefore
  deterministic, but it is *arbitrary with respect to the truth*: inside a block of tied
  scores, whichever item has the lower index counts as "ahead".
* **Effect of exact ties.** Precision@k, recall@k, lift, average precision and ROC-AUC are all
  computed from that single ranking, so they can change if the input rows are permuted
  while a tie straddles the cut-off (``k``) or mixes positives and negatives. With constant
  scores, ROC-AUC is 1.0 if every positive has a lower index than every negative and 0.0 in
  the opposite layout (the textbook tie-averaged value would be 0.5). Callers whose score
  has many ties (for example integer co-occurrence weights) should check ``tied_fraction``
  and either shuffle rows with a seed before scoring or treat the results as order-dependent.
  The same rule is used for every model and baseline so comparisons stay like for like.
* **Base rate.** Every scalar result is a ``MetricResult`` that carries ``base_rate`` (the
  fraction of positives in the pool) and the pool size, so a value is never read without it.
* **Undefined cases raise.** Nothing returns NaN. ``DegenerateLabelsError`` (a ``ValueError``)
  is raised when a metric has no meaning: no positives (recall, lift, average precision,
  ROC-AUC, Brier skill), no negatives (ROC-AUC, Brier skill). Precision@k on a pool with no
  positives is a well-defined 0.0. A pool with only positives gives precision 1.0, lift 1.0,
  recall k/n_pos (capped at 1) and average precision 1.0.
* **k larger than n.** ``k`` is clipped to ``n`` and the clipped value is reported as
  ``k_used``. ``k < 1`` raises ``ValueError``.
* **Subsampled pools.** Metrics are only valid on the full eligible pool (PRD section 13).
  Every metric takes ``pool_subsampled`` (what the caller knows about the pool) and
  ``subsampled`` (an explicit acknowledgement). ``pool_subsampled=True`` without
  ``subsampled=True`` raises ``SubsampledPoolError``; with the acknowledgement the result is
  flagged ``subsampled=True`` and its base rate must not be read as the population rate.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import NamedTuple

import numpy as np

__all__ = [
    "DegenerateLabelsError",
    "SubsampledPoolError",
    "MetricResult",
    "Calibration",
    "BootstrapResult",
    "rank_order",
    "tied_fraction",
    "precision_at_k",
    "recall_at_k",
    "lift",
    "average_precision",
    "roc_auc",
    "calibration",
    "grouped_bootstrap_diff",
    "distinct_groups_in_top_k",
]


class DegenerateLabelsError(ValueError):
    """The metric is undefined for this label vector (no positives or no negatives)."""


class SubsampledPoolError(ValueError):
    """A metric was requested on a subsampled pool without ``subsampled=True``."""


class MetricResult(NamedTuple):
    """A scalar metric with the context needed to read it."""

    value: float
    base_rate: float  # positives / n in the pool the metric was computed on
    n: int  # pool size
    n_pos: int
    k_used: int | None  # effective k for @k metrics, else None
    subsampled: bool  # True only if the caller acknowledged a subsampled pool


# ---------------------------------------------------------------- validation helpers


def _check_pool(pool_subsampled: bool, subsampled: bool) -> None:
    if pool_subsampled and not subsampled:
        raise SubsampledPoolError(
            "pool is subsampled; metrics are only valid on the full eligible pool. "
            "Pass subsampled=True to acknowledge that the result is not a population value."
        )


def _as_arrays(scores, labels) -> tuple[np.ndarray, np.ndarray]:
    s = np.asarray(scores, dtype=float)
    y = np.asarray(labels)
    if s.ndim != 1 or y.ndim != 1 or s.shape != y.shape:
        raise ValueError("scores and labels must be 1-D arrays of equal length")
    if s.size == 0:
        raise ValueError("empty pool")
    if np.isnan(s).any():
        raise ValueError("scores contain NaN")
    if not np.isin(y, (0, 1)).all():
        raise ValueError("labels must be 0/1 (or bool)")
    return s, y.astype(np.int64)


def rank_order(scores) -> np.ndarray:
    """Indices that sort ``scores`` descending, exact ties broken by ascending index."""
    s = np.asarray(scores, dtype=float)
    return np.argsort(-s, kind="stable")


def tied_fraction(scores) -> float:
    """Fraction of items whose score equals at least one other item's score (0.0 to 1.0)."""
    s = np.asarray(scores, dtype=float)
    if s.size == 0:
        raise ValueError("empty pool")
    _, inverse, counts = np.unique(s, return_inverse=True, return_counts=True)
    return float((counts[inverse] > 1).mean())


def _prepare(scores, labels, pool_subsampled, subsampled):
    _check_pool(pool_subsampled, subsampled)
    s, y = _as_arrays(scores, labels)
    n = int(y.size)
    n_pos = int(y.sum())
    return s, y, n, n_pos, n_pos / n


def _result(value, base, n, n_pos, k_used, subsampled, pool_subsampled) -> MetricResult:
    return MetricResult(float(value), float(base), n, n_pos, k_used, bool(pool_subsampled and subsampled))


def _clip_k(k: int, n: int) -> int:
    if int(k) != k or k < 1:
        raise ValueError("k must be a positive integer")
    return min(int(k), n)


def _need_positives(n_pos: int, what: str) -> None:
    if n_pos == 0:
        raise DegenerateLabelsError(f"{what} is undefined: the pool has no positives")


def _need_both_classes(n_pos: int, n: int, what: str) -> None:
    if n_pos == 0 or n_pos == n:
        raise DegenerateLabelsError(f"{what} is undefined: the pool needs both positives and negatives")


# ---------------------------------------------------------------- top-k metrics


def precision_at_k(scores, labels, k: int, *, pool_subsampled=False, subsampled=False) -> MetricResult:
    """Fraction of the top ``k`` (ties by index) that are positive."""
    s, y, n, n_pos, base = _prepare(scores, labels, pool_subsampled, subsampled)
    k = _clip_k(k, n)
    hits = int(y[rank_order(s)[:k]].sum())
    return _result(hits / k, base, n, n_pos, k, subsampled, pool_subsampled)


def recall_at_k(scores, labels, k: int, *, pool_subsampled=False, subsampled=False) -> MetricResult:
    """Fraction of all positives found in the top ``k``. Raises if there are no positives."""
    s, y, n, n_pos, base = _prepare(scores, labels, pool_subsampled, subsampled)
    _need_positives(n_pos, "recall@k")
    k = _clip_k(k, n)
    hits = int(y[rank_order(s)[:k]].sum())
    return _result(hits / n_pos, base, n, n_pos, k, subsampled, pool_subsampled)


def lift(scores, labels, k: int, *, pool_subsampled=False, subsampled=False) -> MetricResult:
    """Precision@k divided by the base rate. Raises if the pool has no positives."""
    s, y, n, n_pos, base = _prepare(scores, labels, pool_subsampled, subsampled)
    _need_positives(n_pos, "lift")
    k = _clip_k(k, n)
    hits = int(y[rank_order(s)[:k]].sum())
    return _result((hits / k) / base, base, n, n_pos, k, subsampled, pool_subsampled)


# ---------------------------------------------------------------- whole-ranking metrics


def average_precision(scores, labels, *, pool_subsampled=False, subsampled=False) -> MetricResult:
    """Average precision (step-wise PR-AUC, no interpolation).

    AP = (1 / n_pos) * sum over positives of precision at that positive's rank. Ties are
    broken by index (see module docstring), so AP depends on row order inside tied blocks.
    A random ranking has expected AP close to the base rate.
    """
    s, y, n, n_pos, base = _prepare(scores, labels, pool_subsampled, subsampled)
    _need_positives(n_pos, "average precision")
    ys = y[rank_order(s)]
    precision_at_rank = np.cumsum(ys) / np.arange(1, n + 1)
    ap = precision_at_rank[ys == 1].sum() / n_pos
    return _result(ap, base, n, n_pos, None, subsampled, pool_subsampled)


def roc_auc(scores, labels, *, pool_subsampled=False, subsampled=False) -> MetricResult:
    """ROC-AUC as the share of (positive, negative) pairs where the positive ranks first.

    "Ranks first" uses the index-tiebroken order, so a tied positive/negative pair counts as 1
    or 0 depending on index, not 0.5 as in the textbook definition (see module docstring).
    """
    s, y, n, n_pos, base = _prepare(scores, labels, pool_subsampled, subsampled)
    _need_both_classes(n_pos, n, "ROC-AUC")
    n_neg = n - n_pos
    ys = y[rank_order(s)]
    neg_before = np.cumsum(1 - ys) - (1 - ys)  # negatives strictly ahead of each item
    correct = (n_neg - neg_before[ys == 1]).sum()  # negatives behind each positive
    return _result(correct / (n_pos * n_neg), base, n, n_pos, None, subsampled, pool_subsampled)


# ---------------------------------------------------------------- calibration


@dataclass(frozen=True)
class Calibration:
    """Reliability table and proper-score summaries for probabilities in [0, 1].

    Bins are equal-count over probabilities sorted ascending (ties by index), so sizes differ
    by at most one and the first ``n % n_bins`` bins are the larger ones. Equal probabilities
    can straddle a bin edge. Bin arrays are ordered from lowest to highest probability.
    """

    bin_count: np.ndarray
    mean_predicted: np.ndarray
    observed_rate: np.ndarray
    brier: float
    brier_reference: float  # Brier of the constant base-rate forecast, base * (1 - base)
    brier_skill: float  # 1 - brier / brier_reference; > 0 beats the constant
    ece: float  # sum_b (n_b / n) * |observed_b - mean_predicted_b|
    base_rate: float
    n: int
    n_pos: int
    subsampled: bool


def calibration(
    probs, labels, n_bins: int = 10, *, pool_subsampled=False, subsampled=False
) -> Calibration:
    """Equal-count reliability bins, Brier score, Brier skill and expected calibration error.

    Raises ``DegenerateLabelsError`` if the pool has a single class (the base-rate constant
    then has Brier 0 and the skill score is undefined), ``ValueError`` if a probability is
    outside [0, 1] or ``n_bins`` is not between 1 and n.
    """
    p, y, n, n_pos, base = _prepare(probs, labels, pool_subsampled, subsampled)
    if (p < 0).any() or (p > 1).any():
        raise ValueError("probabilities must lie in [0, 1]")
    if int(n_bins) != n_bins or not 1 <= n_bins <= n:
        raise ValueError("n_bins must be an integer between 1 and the pool size")
    _need_both_classes(n_pos, n, "Brier skill")
    order = np.argsort(p, kind="stable")
    ps, ys = p[order], y[order]
    groups_p = np.array_split(ps, n_bins)
    groups_y = np.array_split(ys, n_bins)
    count = np.array([g.size for g in groups_p])
    mean_pred = np.array([g.mean() for g in groups_p])
    observed = np.array([g.mean() for g in groups_y])
    brier = float(np.mean((p - y) ** 2))
    ref = base * (1.0 - base)
    ece = float(np.sum(count / n * np.abs(observed - mean_pred)))
    return Calibration(
        count, mean_pred, observed, brier, ref, 1.0 - brier / ref, ece, base, n, n_pos,
        bool(pool_subsampled and subsampled),
    )


# ---------------------------------------------------------------- grouped paired bootstrap


@dataclass(frozen=True)
class BootstrapResult:
    """Paired difference ``metric(scores_a) - metric(scores_b)`` with a percentile interval."""

    observed: float  # difference on the original data
    mean: float  # mean difference across usable replicates
    ci_low: float
    ci_high: float
    confidence: float
    n_boot: int  # replicates requested
    n_used: int  # replicates with a defined metric (both scores need positives and negatives)
    n_groups: int
    seed: int
    subsampled: bool


def _default_metric(y: np.ndarray, s: np.ndarray) -> float:
    return average_precision(s, y).value


def grouped_bootstrap_diff(
    labels,
    scores_a,
    scores_b,
    groups,
    *,
    metric: Callable[[np.ndarray, np.ndarray], float] = _default_metric,
    n_boot: int = 1000,
    seed: int = 0,
    confidence: float = 0.95,
    pool_subsampled=False,
    subsampled=False,
) -> BootstrapResult:
    """Seeded cluster bootstrap of ``metric(a) - metric(b)`` on the same labels.

    Each replicate draws ``n_groups`` group ids with replacement
    (``np.random.default_rng(seed).integers(0, n_groups, n_groups)``, one draw per replicate
    in order), concatenates the member rows of the drawn groups (a group drawn twice appears
    twice, rows in original order), and evaluates both score vectors on that same resample,
    which keeps the comparison paired. ``metric(labels, scores)`` returns a float; the default
    is average precision. A replicate where the metric raises ``DegenerateLabelsError`` (for
    example no positives drawn) is skipped and counted via ``n_used``; if none is usable this
    raises. The interval is the percentile interval of the usable differences. Group ids can
    be any hashable values (for example a concept block).
    """
    _check_pool(pool_subsampled, subsampled)
    a, y = _as_arrays(scores_a, labels)
    b, _ = _as_arrays(scores_b, labels)
    g = np.asarray(groups)
    if g.shape != y.shape:
        raise ValueError("groups must have the same length as labels")
    if n_boot < 1:
        raise ValueError("n_boot must be at least 1")
    if not 0 < confidence < 1:
        raise ValueError("confidence must be in (0, 1)")
    _, inverse = np.unique(g, return_inverse=True)
    members = [np.flatnonzero(inverse == i) for i in range(int(inverse.max()) + 1)]
    n_groups = len(members)
    observed = float(metric(y, a) - metric(y, b))
    rng = np.random.default_rng(seed)
    diffs = []
    for _ in range(n_boot):
        drawn = rng.integers(0, n_groups, size=n_groups)
        idx = np.concatenate([members[i] for i in drawn])
        try:
            diffs.append(float(metric(y[idx], a[idx]) - metric(y[idx], b[idx])))
        except DegenerateLabelsError:
            continue
    if not diffs:
        raise DegenerateLabelsError("no bootstrap replicate had a defined metric")
    d = np.array(diffs)
    lo, hi = np.percentile(d, [50 * (1 - confidence), 50 * (1 + confidence)])
    return BootstrapResult(
        observed, float(d.mean()), float(lo), float(hi), confidence, n_boot, len(diffs),
        n_groups, seed, bool(pool_subsampled and subsampled),
    )


# ---------------------------------------------------------------- diversity of the top k


def distinct_groups_in_top_k(scores, groups, k: int) -> tuple[int, int]:
    """Number of distinct group ids (for example concepts) among the top ``k``, and ``k_used``.

    Ties are broken by index. Use it to show that a top-k list is not one concept repeated.
    """
    s = np.asarray(scores, dtype=float)
    g = np.asarray(groups)
    if s.ndim != 1 or s.shape != g.shape or s.size == 0:
        raise ValueError("scores and groups must be non-empty 1-D arrays of equal length")
    if np.isnan(s).any():
        raise ValueError("scores contain NaN")
    k = _clip_k(k, s.size)
    return int(np.unique(g[rank_order(s)[:k]]).size), k
