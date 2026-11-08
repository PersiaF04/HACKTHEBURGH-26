"""Tests for snapshot graphs, eligible pairs, labels and baselines (issue #140).

All toys are hand-built; the arithmetic is in the comments. ``n_min=1`` is used on toys
unless a test is about ``n_min``.
"""
import datetime as dt
import math
import random
from itertools import count

import numpy as np
import pytest

from whitespace.pipeline.baselines import baseline_scores, rank_order
from whitespace.pipeline.common import Work
from whitespace.pipeline.graphs import build_snapshot, eligible_pairs
from whitespace.pipeline.labels import labels, strata

_ids = count()


def work(date, *concepts):
    return Work(f"W{next(_ids)}", date, tuple(concepts))


def repeat(n, date, *concepts):
    return [work(date, *concepts) for _ in range(n)]


def keys_of(pairs):
    return list(pairs.keys())


# ---- baseline toy, origin T = 2020 -------------------------------------------------------
# Linked pairs (3 works each, all dated <= 2020): ab, ac, bd, cd.  One work {a, e}.
# Linked graph: a-b, a-c, b-d, c-d, e isolated.  Linked degrees: a2 b2 c2 d2 e0.
# Any-co-occurrence graph adds a-e.  Degrees: a3 (b,c,e) b2 c2 d2 e1.
# Concept counts: a 3+3+1=7, b 3+3=6, c 3+3=6, d 3+3=6, e 1.
# Eligible pairs (10 pairs - 4 linked) in canonical order: ad ae bc be ce de.
def toy_works():
    d = dt.date(2019, 6, 1)
    return (
        repeat(3, d, "a", "b") + repeat(3, d, "a", "c") + repeat(3, d, "b", "d")
        + repeat(3, dt.date(2020, 12, 31), "c", "d") + [work(d, "a", "e")]
    )


PAIRS = [("a", "d"), ("a", "e"), ("b", "c"), ("b", "e"), ("c", "e"), ("d", "e")]


def test_snapshot_counts_and_weights_use_only_works_up_to_31_dec_T():
    snap = build_snapshot(toy_works() + repeat(5, dt.date(2021, 1, 1), "a", "d"), 2020)
    assert snap.counts == {"a": 7, "b": 6, "c": 6, "d": 6, "e": 1}
    assert snap.weights[("a", "b")] == 3 and snap.weights[("c", "d")] == 3  # 31 Dec 2020 counts
    assert snap.weights[("a", "e")] == 1
    assert ("a", "d") not in snap.weights  # its five works are dated 1 Jan 2021


def test_duplicate_work_ids_and_repeated_concepts_count_once():
    d = dt.date(2019, 1, 1)
    w = Work("W", d, ("a", "b", "a"))
    snap = build_snapshot([w, w], 2019)
    assert snap.counts == {"a": 1, "b": 1} and snap.weights == {("a", "b"): 1}


def test_candidates_are_only_pairs_below_the_threshold():
    pairs = eligible_pairs(build_snapshot(toy_works(), 2020), n_min=1)
    assert keys_of(pairs) == PAIRS  # ab ac bd cd (weight 3) are excluded
    assert pairs.weight.tolist() == [0, 1, 0, 0, 0, 0]  # a-e has weight 1
    assert (pairs.weight < 3).all()


def test_n_min_removes_concepts_with_too_few_papers():
    pairs = eligible_pairs(build_snapshot(toy_works(), 2020), n_min=2)  # e has 1 paper
    assert keys_of(pairs) == [("a", "d"), ("b", "c")]


def test_pair_keys_are_unique_sorted_and_in_canonical_order():
    pairs = eligible_pairs(build_snapshot(toy_works(), 2020), n_min=1)
    keys = keys_of(pairs)
    assert len(keys) == len(set(keys))
    assert all(a < b for a, b in keys)
    assert keys == sorted(keys)
    assert (pairs.i < pairs.j).all()


# ---- poison test --------------------------------------------------------------------------
def poison(works, origin, seed):
    """Keep works dated <= 31 Dec T; replace every later work by random noise."""
    rng = random.Random(seed)
    names = ["a", "b", "c", "d", "e", "x", "y", "z"]
    out = [w for w in works if w.date <= dt.date(origin, 12, 31)]
    for _ in range(40):
        date = dt.date(origin + rng.randint(1, 6), rng.randint(1, 12), rng.randint(1, 28))
        out.append(work(date, *rng.sample(names, rng.randint(1, 4))))
    return out


@pytest.mark.parametrize("seed", range(5))
def test_poisoning_every_post_T_work_changes_nothing_at_T(seed):
    future = repeat(3, dt.date(2021, 3, 1), "a", "d") + repeat(2, dt.date(2022, 5, 1), "b", "e")
    clean_works = toy_works() + future
    noisy_works = poison(clean_works, 2020, seed)

    snap_clean, snap_noisy = build_snapshot(clean_works, 2020), build_snapshot(noisy_works, 2020)
    assert snap_clean == snap_noisy
    pairs_clean = eligible_pairs(snap_clean, n_min=1)
    pairs_noisy = eligible_pairs(snap_noisy, n_min=1)
    assert pairs_clean.names == pairs_noisy.names
    for field in ("i", "j", "weight"):
        assert np.array_equal(getattr(pairs_clean, field), getattr(pairs_noisy, field))
    scores_clean = baseline_scores(snap_clean, pairs_clean)
    scores_noisy = baseline_scores(snap_noisy, pairs_noisy)
    assert scores_clean.keys() == scores_noisy.keys()
    for name in scores_clean:
        assert np.array_equal(scores_clean[name], scores_noisy[name]), name


# ---- labels ---------------------------------------------------------------------------------
def crossing_toy():
    """Pair (x_w_k, y_w_k) starts with weight w (2019 works) and gains k works in 2021."""
    works = []
    for w in (0, 1, 2):
        for k in range(5):
            x, y = f"x{w}{k}", f"y{w}{k}"
            works += [work(dt.date(2019, 1, 1), x), work(dt.date(2019, 1, 1), y)]  # present at T
            works += repeat(w, dt.date(2019, 2, 1), x, y) + repeat(k, dt.date(2021, 2, 1), x, y)
    return works


# Positive iff start + new >= 3 (start < 3 always here):
# start 0: new 3, 4          start 1: new 2, 3, 4          start 2: new 1, 2, 3, 4
POSITIVE = {(0, 3), (0, 4), (1, 2), (1, 3), (1, 4), (2, 1), (2, 2), (2, 3), (2, 4)}


def test_label_threshold_crossing_for_start_weights_0_1_2_and_0_to_4_new_papers():
    works = crossing_toy()
    pairs = eligible_pairs(build_snapshot(works, 2020), n_min=1)
    y = dict(zip(keys_of(pairs), labels(works, 2020, pairs)))
    for w in (0, 1, 2):
        for k in range(5):
            assert y[(f"x{w}{k}", f"y{w}{k}")] == ((w, k) in POSITIVE), (w, k)
    assert sum(y.values()) == len(POSITIVE)  # no other pair co-occurs, so none is positive


def test_strata_on_the_crossing_toy():
    works = crossing_toy()
    pairs = eligible_pairs(build_snapshot(works, 2020), n_min=1)
    # 30 concepts -> 435 pairs. Weight 1 and weight 2: 5 pairs each; weight 0: 435 - 10 = 425.
    # Positives: weight 0 -> 2 (k = 3, 4); weight 1 -> 3 (k = 2, 3, 4); weight 2 -> 4 (k = 1..4).
    s = strata(pairs, labels(works, 2020, pairs))
    assert s["0"] == {"pairs": 425, "positives": 2, "base_rate": 2 / 425}
    assert s["1"] == {"pairs": 5, "positives": 3, "base_rate": 3 / 5}
    assert s["2"] == {"pairs": 5, "positives": 4, "base_rate": 4 / 5}
    assert s["all"] == {"pairs": 435, "positives": 9, "base_rate": 9 / 435}


def test_strata_helper_on_explicit_arrays():
    from whitespace.pipeline.graphs import PairSet

    z = np.zeros(6, dtype=np.int32)
    pairs = PairSet(("a",), z, z, np.array([0, 0, 0, 1, 2, 2], dtype=np.int8))
    s = strata(pairs, np.array([1, 0, 0, 1, 0, 1], dtype=bool))
    # weight 0: 3 pairs, 1 positive; weight 1: 1 pair, 1 positive; weight 2: 2 pairs, 1 positive
    assert (s["0"]["pairs"], s["0"]["positives"], s["0"]["base_rate"]) == (3, 1, 1 / 3)
    assert (s["1"]["pairs"], s["1"]["positives"], s["1"]["base_rate"]) == (1, 1, 1.0)
    assert (s["2"]["pairs"], s["2"]["positives"], s["2"]["base_rate"]) == (2, 1, 0.5)
    assert (s["all"]["pairs"], s["all"]["positives"], s["all"]["base_rate"]) == (6, 3, 0.5)


def test_strata_base_rate_is_nan_for_an_empty_stratum():
    works = [work(dt.date(2019, 1, 1), "a", "b"), work(dt.date(2019, 1, 1), "c")]
    pairs = eligible_pairs(build_snapshot(works, 2020), n_min=1)  # ab w1, ac w0, bc w0; no w2
    s = strata(pairs, labels(works, 2020, pairs))
    assert s["2"]["pairs"] == 0 and math.isnan(s["2"]["base_rate"])


def test_label_window_boundaries():
    d = dt.date(2019, 1, 1)
    # every pair has two works in 2019; the third work is dated on a boundary
    third = {
        ("b1", "b2"): dt.date(2020, 12, 31),  # inside the snapshot: weight 3 at T -> not eligible
        ("c1", "c2"): dt.date(2021, 1, 1),  # first day of the window -> positive
        ("d1", "d2"): dt.date(2023, 12, 31),  # last day of the window -> positive
        ("e1", "e2"): dt.date(2024, 1, 1),  # T+4, outside -> negative
    }
    works = []
    for (p, q), date in third.items():
        works += repeat(2, d, p, q) + [work(date, p, q)]
    pairs = eligible_pairs(build_snapshot(works, 2020), n_min=1)
    y = dict(zip(keys_of(pairs), labels(works, 2020, pairs)))
    assert ("b1", "b2") not in y
    assert y[("c1", "c2")] and y[("d1", "d2")] and not y[("e1", "e2")]
    assert [k for k, v in y.items() if v] == [("c1", "c2"), ("d1", "d2")]


def test_horizon_argument_moves_the_window():
    d = dt.date(2019, 1, 1)
    works = repeat(2, d, "a", "b") + [work(dt.date(2022, 6, 1), "a", "b")]
    pairs = eligible_pairs(build_snapshot(works, 2020), n_min=1)
    assert labels(works, 2020, pairs, horizon=3).tolist() == [True]
    assert labels(works, 2020, pairs, horizon=1).tolist() == [False]  # window ends 31 Dec 2021


def test_vocabulary_is_fixed_as_of_T():
    d = dt.date(2019, 1, 1)
    works = (
        repeat(2, d, "a", "b") + [work(d, "c")]  # c has 1 paper at T
        + repeat(5, dt.date(2022, 1, 1), "a", "late")  # "late" does not exist at T
        + repeat(5, dt.date(2022, 1, 1), "a", "c")  # c gains papers later
    )
    snap = build_snapshot(works, 2020)
    assert "late" not in snap.counts
    pairs = eligible_pairs(snap, n_min=2)  # at T: a has 2 papers, b 2, c 1
    assert pairs.names == ("a", "b") and keys_of(pairs) == [("a", "b")]
    assert labels(works, 2020, pairs).tolist() == [False]  # a-b gains nothing; late and c are out


# ---- baselines --------------------------------------------------------------------------------
def test_baseline_scores_hand_computed():
    snap = build_snapshot(toy_works(), 2020)
    pairs = eligible_pairs(snap, n_min=1)
    s = baseline_scores(snap, pairs)
    inv_ln2 = 1 / math.log(2)
    # order: ad ae bc be ce de
    assert s["current_weight"].tolist() == [0, 1, 0, 0, 0, 0]
    # any-graph degrees a3 b2 c2 d2 e1: ad 3*2, ae 3*1, bc 2*2, be 2*1, ce 2*1, de 2*1
    assert s["degree_product"].tolist() == [6, 3, 4, 2, 2, 2]
    # linked degrees a2 b2 c2 d2 e0: ad 4, ae 0, bc 4, others 0
    assert s["preferential_attachment"].tolist() == [4, 0, 4, 0, 0, 0]
    # ad share b and c; bc share a and d; nobody is linked to e
    assert s["common_neighbours"].tolist() == [2, 0, 2, 0, 0, 0]
    # each shared neighbour has linked degree 2 -> 1/ln 2; two of them
    assert np.allclose(s["adamic_adar"], [2 * inv_ln2, 0, 2 * inv_ln2, 0, 0, 0])
    # ad: 2 / (2 + 2 - 2) = 1; bc likewise; ae: union 2 + 0 - 0 = 2 -> 0
    assert np.allclose(s["jaccard"], [1, 0, 1, 0, 0, 0])


def test_all_baselines_score_the_identical_pair_set_with_identical_ties():
    snap = build_snapshot(toy_works(), 2020)
    pairs = eligible_pairs(snap, n_min=1)
    scores = baseline_scores(snap, pairs)
    assert set(scores) == {
        "current_weight", "degree_product", "preferential_attachment",
        "common_neighbours", "adamic_adar", "jaccard",
    }
    assert all(len(v) == len(pairs) == len(PAIRS) for v in scores.values())
    # ties keep canonical pair order: common neighbours tie ad/bc at 2, then ae be ce de at 0
    order = [PAIRS[k] for k in rank_order(scores["common_neighbours"])]
    assert order == [("a", "d"), ("b", "c"), ("a", "e"), ("b", "e"), ("c", "e"), ("d", "e")]
    # degree product 6, 4, 3, then the 2-way tie in canonical order
    order = [PAIRS[k] for k in rank_order(scores["degree_product"])]
    assert order == [("a", "d"), ("b", "c"), ("a", "e"), ("b", "e"), ("c", "e"), ("d", "e")]
    # an all-equal score ranks by canonical order, whatever the input
    assert rank_order(np.zeros(6)).tolist() == list(range(6))
    assert rank_order(scores["current_weight"])[0] == 1  # the single weight-1 pair, a-e
