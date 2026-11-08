"""Tests for whitespace.pipeline.metrics (issue #141). Synthetic inputs only, no data."""
from __future__ import annotations

import numpy as np
import pytest

from whitespace.pipeline import metrics as m

# ---------------------------------------------------------------- hand-computed fixture A
# labels y = [1,0,1,0,0], scores s = [.9,.8,.7,.6,.5]  (no ties; ranking = input order)
# n = 5, n_pos = 2, base rate = 2/5 = 0.4
Y_A = [1, 0, 1, 0, 0]
S_A = [0.9, 0.8, 0.7, 0.6, 0.5]


def test_topk_known_answers():
    # precision@1 = 1/1 = 1;  precision@2 = 1/2;  precision@3 = 2/3
    assert m.precision_at_k(S_A, Y_A, 1).value == pytest.approx(1.0)
    assert m.precision_at_k(S_A, Y_A, 2).value == pytest.approx(0.5)
    assert m.precision_at_k(S_A, Y_A, 3).value == pytest.approx(2 / 3)
    # recall@1 = 1/2;  recall@3 = 2/2 = 1
    assert m.recall_at_k(S_A, Y_A, 1).value == pytest.approx(0.5)
    assert m.recall_at_k(S_A, Y_A, 3).value == pytest.approx(1.0)
    # lift@2 = precision@2 / base = 0.5 / 0.4 = 1.25;  lift@1 = 1 / 0.4 = 2.5
    assert m.lift(S_A, Y_A, 2).value == pytest.approx(1.25)
    assert m.lift(S_A, Y_A, 1).value == pytest.approx(2.5)


def test_base_rate_always_returned():
    for r in (m.precision_at_k(S_A, Y_A, 2), m.recall_at_k(S_A, Y_A, 2), m.lift(S_A, Y_A, 2),
              m.average_precision(S_A, Y_A), m.roc_auc(S_A, Y_A)):
        assert r.base_rate == pytest.approx(0.4)
        assert (r.n, r.n_pos) == (5, 2)
        assert r.subsampled is False


def test_average_precision_and_auc_known_answers():
    # AP: positives at ranks 1 and 3 -> precision 1/1 and 2/3; AP = (1 + 2/3) / 2 = 5/6
    assert m.average_precision(S_A, Y_A).value == pytest.approx(5 / 6)
    # AUC: 2 positives x 3 negatives = 6 pairs. Positive at rank 1 beats all 3 negatives,
    # positive at rank 3 beats the 2 negatives behind it (ranks 4, 5): 5 / 6
    assert m.roc_auc(S_A, Y_A).value == pytest.approx(5 / 6)


def test_brier_and_ece_known_answers():
    cal = m.calibration(S_A, Y_A, n_bins=1)
    # Brier = mean((p - y)^2) = (0.01 + 0.64 + 0.09 + 0.36 + 0.25) / 5 = 1.35 / 5 = 0.27
    assert cal.brier == pytest.approx(0.27)
    # constant base-rate forecast: 0.4 * 0.6 = 0.24;  skill = 1 - 0.27 / 0.24 = -0.125
    assert cal.brier_reference == pytest.approx(0.24)
    assert cal.brier_skill == pytest.approx(-0.125)
    # one bin: mean prediction 3.5 / 5 = 0.7, observed 0.4 -> ECE = |0.4 - 0.7| = 0.3
    assert cal.bin_count.tolist() == [5]
    assert cal.ece == pytest.approx(0.3)
    # two bins on ascending p: sizes 3 and 2.
    #   bin1 p = .5 .6 .7, y = 0 0 1 -> mean .6, observed 1/3
    #   bin2 p = .8 .9,    y = 0 1   -> mean .85, observed 1/2
    # ECE = (3 * |1/3 - .6| + 2 * |.5 - .85|) / 5 = (0.8 + 0.7) / 5 = 0.3
    cal2 = m.calibration(S_A, Y_A, n_bins=2)
    assert cal2.bin_count.tolist() == [3, 2]
    assert cal2.mean_predicted == pytest.approx([0.6, 0.85])
    assert cal2.observed_rate == pytest.approx([1 / 3, 0.5])
    assert cal2.ece == pytest.approx(0.3)
    # perfect probabilities: Brier 0, skill 1
    perfect = m.calibration([1, 0, 1, 0], [1, 0, 1, 0], n_bins=2)
    assert perfect.brier == 0 and perfect.brier_skill == 1 and perfect.ece == 0


def test_perfect_constant_forecast_has_zero_skill():
    # forecasting the base rate 0.5 for y = [1,0,1,0]: Brier = 0.25 = reference, skill = 0
    cal = m.calibration([0.5] * 4, [1, 0, 1, 0], n_bins=1)
    assert cal.brier_skill == pytest.approx(0.0)
    assert cal.ece == pytest.approx(0.0)


# ---------------------------------------------------------------- exact ties
def test_exact_ties_broken_by_index():
    # constant scores -> order is the input order. y = [0,1,1,0]
    y, s = [0, 1, 1, 0], [1.0] * 4
    assert m.rank_order(s).tolist() == [0, 1, 2, 3]
    assert m.precision_at_k(s, y, 1).value == 0.0
    assert m.precision_at_k(s, y, 2).value == 0.5
    # AP = (1/2 + 2/3) / 2 = 7/12
    assert m.average_precision(s, y).value == pytest.approx(7 / 12)
    # same scores, labels reversed to [1,0,0,1]: AP = (1/1 + 2/4) / 2 = 3/4 -> AP depends on row order
    assert m.average_precision(s, [1, 0, 0, 1]).value == pytest.approx(0.75)


def test_exact_ties_make_auc_order_dependent():
    s = [1.0] * 4
    assert m.roc_auc(s, [1, 1, 0, 0]).value == 1.0  # positives have the lower indices
    assert m.roc_auc(s, [0, 0, 1, 1]).value == 0.0  # the textbook tie-averaged value would be 0.5
    assert m.tied_fraction(s) == 1.0
    assert m.tied_fraction([1, 2, 3]) == 0.0
    assert m.tied_fraction([1, 1, 2, 3]) == 0.5


def test_tie_straddling_cutoff_uses_index():
    # scores 2,1,1,1: top-2 = item 0 plus the lowest-index tied item (item 1)
    assert m.rank_order([2, 1, 1, 1]).tolist() == [0, 1, 2, 3]
    assert m.precision_at_k([2, 1, 1, 1], [1, 0, 1, 1], 2).value == 0.5


# ---------------------------------------------------------------- degenerate labels
def test_all_negative_pool():
    y, s = [0, 0, 0, 0], [0.4, 0.3, 0.2, 0.1]
    r = m.precision_at_k(s, y, 2)
    assert r.value == 0.0 and r.base_rate == 0.0
    for fn in (lambda: m.recall_at_k(s, y, 2), lambda: m.lift(s, y, 2),
               lambda: m.average_precision(s, y), lambda: m.roc_auc(s, y),
               lambda: m.calibration([0.4, 0.3, 0.2, 0.1], y, n_bins=2)):
        with pytest.raises(m.DegenerateLabelsError):
            fn()


def test_all_positive_pool():
    y, s = [1, 1, 1, 1], [0.4, 0.3, 0.2, 0.1]
    assert m.precision_at_k(s, y, 2).value == 1.0
    assert m.recall_at_k(s, y, 2).value == 0.5  # 2 of 4 positives
    assert m.lift(s, y, 2).value == 1.0  # base rate 1
    assert m.average_precision(s, y).value == 1.0
    with pytest.raises(m.DegenerateLabelsError):
        m.roc_auc(s, y)  # no negatives
    with pytest.raises(m.DegenerateLabelsError):
        m.calibration([0.9, 0.8, 0.7, 0.6], y, n_bins=2)  # reference Brier is 0


def test_k_larger_than_n_is_clipped_and_reported():
    r = m.precision_at_k(S_A, Y_A, 50)
    assert r.k_used == 5 and r.value == pytest.approx(0.4)
    assert m.recall_at_k(S_A, Y_A, 50).value == 1.0
    assert m.lift(S_A, Y_A, 50).value == pytest.approx(1.0)
    assert m.distinct_groups_in_top_k(S_A, list("aabbc"), 50) == (3, 5)


def test_input_validation():
    with pytest.raises(ValueError):
        m.precision_at_k(S_A, Y_A, 0)
    with pytest.raises(ValueError):
        m.precision_at_k([1, 2], [1], 1)
    with pytest.raises(ValueError):
        m.precision_at_k([1, float("nan")], [1, 0], 1)
    with pytest.raises(ValueError):
        m.precision_at_k([1, 2], [1, 2], 1)  # label 2
    with pytest.raises(ValueError):
        m.precision_at_k([], [], 1)
    with pytest.raises(ValueError):
        m.calibration([1.2, 0.1], [1, 0], n_bins=1)
    with pytest.raises(ValueError):
        m.calibration(S_A, Y_A, n_bins=6)


# ---------------------------------------------------------------- subsampled guard
def test_subsampled_guard():
    fns = [
        lambda **kw: m.precision_at_k(S_A, Y_A, 2, **kw),
        lambda **kw: m.recall_at_k(S_A, Y_A, 2, **kw),
        lambda **kw: m.lift(S_A, Y_A, 2, **kw),
        lambda **kw: m.average_precision(S_A, Y_A, **kw),
        lambda **kw: m.roc_auc(S_A, Y_A, **kw),
        lambda **kw: m.calibration(S_A, Y_A, 2, **kw),
        lambda **kw: m.grouped_bootstrap_diff(Y_A, S_A, S_A, [0, 0, 1, 1, 2], n_boot=3, **kw),
    ]
    for fn in fns:
        with pytest.raises(m.SubsampledPoolError):
            fn(pool_subsampled=True)
        assert fn(pool_subsampled=True, subsampled=True).subsampled is True
        assert fn().subsampled is False


# ---------------------------------------------------------------- large random scores
def test_random_scores_average_precision_tends_to_base_rate():
    # n = 200_000, base rate 0.05, seeded. Expected AP of a random ranking is close to the base
    # rate; the standard deviation is well under 0.005 at this size, so 0.01 is a safe tolerance.
    rng = np.random.default_rng(20260107)
    n = 200_000
    y = (rng.random(n) < 0.05).astype(int)
    s = rng.random(n)
    r = m.average_precision(s, y)
    assert r.base_rate == pytest.approx(0.05, abs=0.002)
    assert abs(r.value - r.base_rate) < 0.01
    assert abs(m.roc_auc(s, y).value - 0.5) < 0.01


# ---------------------------------------------------------------- independent reference
def ref_order(s):
    return sorted(range(len(s)), key=lambda i: (-s[i], i))


def ref_topk(s, y, k):
    n = len(s)
    k = min(k, n)
    npos = sum(y)
    hits = sum(y[i] for i in ref_order(s)[:k])
    return hits / k, hits / npos, (hits / k) / (npos / n)


def ref_ap(s, y):
    order, seen, total = ref_order(s), 0, 0.0
    for rank, i in enumerate(order, start=1):
        if y[i] == 1:
            seen += 1
            total += seen / rank
    return total / sum(y)


def ref_auc(s, y):
    pos_in_order = {i: r for r, i in enumerate(ref_order(s))}
    good = pairs = 0
    for i in range(len(s)):
        for j in range(len(s)):
            if y[i] == 1 and y[j] == 0:
                pairs += 1
                good += pos_in_order[i] < pos_in_order[j]
    return good / pairs


def ref_calibration(p, y, n_bins):
    n = len(p)
    order = sorted(range(n), key=lambda i: (p[i], i))
    base_size, extra = divmod(n, n_bins)
    ece, start = 0.0, 0
    for b in range(n_bins):
        size = base_size + (1 if b < extra else 0)
        idx = order[start:start + size]
        start += size
        mean_p = sum(p[i] for i in idx) / size
        obs = sum(y[i] for i in idx) / size
        ece += size / n * abs(obs - mean_p)
    brier = sum((p[i] - y[i]) ** 2 for i in range(n)) / n
    base = sum(y) / n
    return brier, 1 - brier / (base * (1 - base)), ece


@pytest.mark.parametrize("seed", range(25))
def test_matches_independent_reference_on_random_inputs(seed):
    rng = np.random.default_rng(seed)
    n = int(rng.integers(8, 60))
    y = rng.integers(0, 2, n)
    y[0], y[1] = 1, 0  # both classes present
    s = rng.integers(0, 6, n) / 5.0  # few distinct values -> many exact ties, in [0, 1]
    sl, yl = s.tolist(), y.tolist()
    k = int(rng.integers(1, n + 5))
    p, r, lf = ref_topk(sl, yl, k)
    assert m.precision_at_k(s, y, k).value == pytest.approx(p)
    assert m.recall_at_k(s, y, k).value == pytest.approx(r)
    assert m.lift(s, y, k).value == pytest.approx(lf)
    assert m.average_precision(s, y).value == pytest.approx(ref_ap(sl, yl))
    assert m.roc_auc(s, y).value == pytest.approx(ref_auc(sl, yl))
    nb = int(rng.integers(1, min(n, 12) + 1))
    cal = m.calibration(s, y, nb)
    brier, skill, ece = ref_calibration(sl, yl, nb)
    assert cal.brier == pytest.approx(brier)
    assert cal.brier_skill == pytest.approx(skill)
    assert cal.ece == pytest.approx(ece)
    assert cal.bin_count.sum() == n


# ---------------------------------------------------------------- grouped bootstrap
def _boot_data(seed=1, n_groups=12, per=8):
    rng = np.random.default_rng(seed)
    groups = np.repeat(np.arange(n_groups), per)
    y = (rng.random(groups.size) < 0.3).astype(int)
    good = y + rng.normal(0, 0.8, y.size)  # informative score
    noise = rng.normal(0, 1, y.size)  # uninformative score
    return y, good, noise, groups


def test_bootstrap_matches_reference_resampler():
    y, a, b, groups = _boot_data()
    res = m.grouped_bootstrap_diff(y, a, b, groups, n_boot=40, seed=7)
    # reference: same documented draw scheme, plain loops
    rng = np.random.default_rng(7)
    ids = sorted(set(groups.tolist()))
    diffs = []
    for _ in range(40):
        drawn = rng.integers(0, len(ids), size=len(ids))
        rows = [i for g in drawn for i in range(len(y)) if groups[i] == ids[g]]
        ys = [int(y[i]) for i in rows]
        if sum(ys) == 0:
            continue
        diffs.append(ref_ap([a[i] for i in rows], ys) - ref_ap([b[i] for i in rows], ys))
    assert res.n_used == len(diffs)
    assert res.mean == pytest.approx(np.mean(diffs))
    assert res.ci_low == pytest.approx(np.percentile(diffs, 2.5))
    assert res.ci_high == pytest.approx(np.percentile(diffs, 97.5))
    assert res.observed == pytest.approx(ref_ap(a.tolist(), y.tolist()) - ref_ap(b.tolist(), y.tolist()))
    assert res.n_groups == 12


def test_bootstrap_is_seeded_and_paired():
    y, a, b, groups = _boot_data()
    r1 = m.grouped_bootstrap_diff(y, a, b, groups, n_boot=50, seed=3)
    assert r1 == m.grouped_bootstrap_diff(y, a, b, groups, n_boot=50, seed=3)
    assert r1 != m.grouped_bootstrap_diff(y, a, b, groups, n_boot=50, seed=4)
    assert r1.ci_low <= r1.mean <= r1.ci_high
    assert r1.observed > 0  # informative score beats noise on these synthetic labels
    same = m.grouped_bootstrap_diff(y, a, a, groups, n_boot=20, seed=3)
    assert same.observed == 0 and same.ci_low == 0 and same.ci_high == 0
    # a custom metric is accepted
    auc = m.grouped_bootstrap_diff(y, a, b, groups, n_boot=20, seed=3,
                                   metric=lambda yy, ss: m.roc_auc(ss, yy).value)
    assert auc.observed > 0


def test_bootstrap_degenerate_replicates():
    # one positive in one group: replicates without that group are skipped, not NaN
    y = np.array([0, 0, 0, 0, 1, 0])
    s = np.arange(6, dtype=float)
    res = m.grouped_bootstrap_diff(y, s, -s, [0, 0, 1, 1, 2, 2], n_boot=60, seed=0)
    assert 0 < res.n_used < 60
    assert np.isfinite([res.mean, res.ci_low, res.ci_high]).all()
    with pytest.raises(m.DegenerateLabelsError):
        m.grouped_bootstrap_diff(np.zeros(6, int), s, -s, [0, 0, 1, 1, 2, 2], n_boot=5)


# ---------------------------------------------------------------- distinct groups
def test_distinct_groups_in_top_k():
    # ranking order = input order (descending scores); groups a a b a c
    s = [5, 4, 3, 2, 1]
    g = ["a", "a", "b", "a", "c"]
    assert m.distinct_groups_in_top_k(s, g, 2) == (1, 2)
    assert m.distinct_groups_in_top_k(s, g, 3) == (2, 3)
    assert m.distinct_groups_in_top_k(s, g, 5) == (3, 5)
    assert m.distinct_groups_in_top_k([1, 1, 1], ["x", "y", "z"], 2) == (2, 2)  # ties by index
