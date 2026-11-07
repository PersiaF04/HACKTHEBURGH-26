"""Small, dependency-free scoring helpers."""
from __future__ import annotations

import math
from typing import Sequence


def mean(xs: Sequence[float]) -> float:
    return sum(xs) / len(xs)


def quantile(sorted_xs: Sequence[float], q: float) -> float:
    """Linear-interpolated quantile of an already sorted sequence."""
    if not sorted_xs:
        raise ValueError("empty sequence")
    pos = q * (len(sorted_xs) - 1)
    lo, hi = math.floor(pos), math.ceil(pos)
    return sorted_xs[lo] + (sorted_xs[hi] - sorted_xs[lo]) * (pos - lo)


def mae(pred: Sequence[float], actual: Sequence[float]) -> float:
    return mean([abs(p - a) for p, a in zip(pred, actual)])


def brier(prob: Sequence[float], outcome: Sequence[bool]) -> float:
    return mean([(p - (1.0 if o else 0.0)) ** 2 for p, o in zip(prob, outcome)])


def auc(score: Sequence[float], outcome: Sequence[bool]) -> float | None:
    """Rank-based AUC with tie handling; None if only one class is present."""
    pairs = sorted(zip(score, outcome))
    n1 = sum(1 for _, o in pairs if o)
    n0 = len(pairs) - n1
    if n1 == 0 or n0 == 0:
        return None
    rank_sum, i = 0.0, 0
    while i < len(pairs):
        j = i
        while j < len(pairs) and pairs[j][0] == pairs[i][0]:
            j += 1
        avg_rank = (i + j + 1) / 2
        rank_sum += avg_rank * sum(1 for k in range(i, j) if pairs[k][1])
        i = j
    return (rank_sum - n1 * (n1 + 1) / 2) / (n1 * n0)


def reliability(prob: Sequence[float], outcome: Sequence[bool], bins: int = 10) -> list[dict]:
    """Reliability curve: predicted vs observed frequency per probability bin."""
    acc: dict[int, list[tuple[float, bool]]] = {}
    for p, o in zip(prob, outcome):
        acc.setdefault(min(int(p * bins), bins - 1), []).append((p, o))
    out = []
    for b in sorted(acc):
        rows = acc[b]
        out.append({
            "bin": round((b + 0.5) / bins, 2),
            "predicted": round(mean([p for p, _ in rows]), 3),
            "observed": round(mean([1.0 if o else 0.0 for _, o in rows]), 3),
            "n": len(rows),
        })
    return out
