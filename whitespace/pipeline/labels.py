"""Labels and strata for the eligible pair universe (issue #140). Pure functions, no I/O."""
from __future__ import annotations

from collections import Counter
from collections.abc import Iterable
from itertools import combinations

import numpy as np

from .common import HORIZON_YEARS, LINK_THRESHOLD, Work, label_window
from .graphs import PairSet, distinct_concepts


def labels(
    works: Iterable[Work],
    origin: int,
    pairs: PairSet,
    horizon: int = HORIZON_YEARS,
    threshold: int = LINK_THRESHOLD,
) -> np.ndarray:
    """Boolean array aligned with ``pairs``: weight < threshold at T and >= threshold by end of T+horizon.

    The cumulative weight counts every distinct work dated on or before 31 Dec T+horizon
    (snapshot works plus window works). Only the vocabulary of ``pairs`` (fixed as of T) is
    used, so concepts that first appear later cannot create labels.
    """
    index = {name: k for k, name in enumerate(pairs.names)}
    n = len(index)
    cumulative: Counter[int] = Counter()
    for concepts in distinct_concepts(works, label_window(origin, horizon)[1]):
        ids = sorted(index[c] for c in concepts if c in index)
        cumulative.update(a * n + b for a, b in combinations(ids, 2))
    reached = np.array([code for code, w in cumulative.items() if w >= threshold], dtype=np.int64)
    codes = pairs.i.astype(np.int64) * n + pairs.j
    return np.isin(codes, reached) & (pairs.weight < threshold)


def strata(pairs: PairSet, y: np.ndarray) -> dict[str, dict[str, float]]:
    """Pairs, positives and base rate for starting weight 0, 1, 2 (keys "0", "1", "2") and "all"."""
    out = {}
    masks = [(str(w), pairs.weight == w) for w in (0, 1, 2)] + [("all", np.ones(len(y), bool))]
    for name, mask in masks:
        n, pos = int(mask.sum()), int(y[mask].sum())
        out[name] = {"pairs": n, "positives": pos, "base_rate": pos / n if n else float("nan")}
    return out
