"""Heuristic baselines scored on the same ``PairSet`` (issue #140). Pure functions, no I/O.

Graph definitions (chosen here; flagged in the PR):

* Linked graph: vocabulary concepts joined when the snapshot weight is >= ``threshold``
  (PRD: "an edge becomes linked once the pair co-occurs in at least three papers").
  Common neighbours, Adamic-Adar, Jaccard and preferential attachment use it.
* Degree product uses the any-co-occurrence graph (weight >= 1), so it differs from
  preferential attachment.

Ties are broken by canonical pair order: ``rank_order`` ranks by descending score, then by
ascending (i, j), which is the sorted-tuple order of the pair keys.
"""
from __future__ import annotations

import numpy as np

from .common import LINK_THRESHOLD
from .graphs import PairSet, Snapshot

BLOCK = 256  # rows of the neighbour matrix processed at once; bounds memory


def rank_order(scores: np.ndarray) -> np.ndarray:
    """Indices that rank pairs best first; ties keep canonical pair order (stable sort)."""
    return np.argsort(-scores, kind="stable")


def _graph(snapshot: Snapshot, pairs: PairSet, min_weight: int) -> tuple[np.ndarray, np.ndarray]:
    """Dense symmetric 0/1 matrix (float64) and degrees of the graph with weight >= min_weight."""
    index = {name: k for k, name in enumerate(pairs.names)}
    adj = np.zeros((len(index), len(index)))
    for (a, b), w in snapshot.weights.items():
        if w >= min_weight and a in index and b in index:
            adj[index[a], index[b]] = adj[index[b], index[a]] = 1.0
    return adj, adj.sum(axis=1)


def _row_blocks(pairs: PairSet):
    """Yield (row_start, row_stop, slice into pairs) for canonical-order pairs."""
    n = len(pairs.names)
    for start in range(0, n, BLOCK):
        stop = min(start + BLOCK, n)
        lo, hi = np.searchsorted(pairs.i, [start, stop])
        if hi > lo:
            yield start, stop, slice(lo, hi)


def _common_neighbour_scores(adj: np.ndarray, degree: np.ndarray, pairs: PairSet):
    """Common neighbours, Adamic-Adar and Jaccard in row blocks (no full n x n products)."""
    inv_log = np.zeros_like(degree)
    inv_log[degree > 1] = 1.0 / np.log(degree[degree > 1])  # degree 1 cannot be a shared neighbour
    cn, aa = np.zeros(len(pairs)), np.zeros(len(pairs))
    for start, stop, sl in _row_blocks(pairs):
        rows, cols = pairs.i[sl] - start, pairs.j[sl]
        cn[sl] = (adj[start:stop] @ adj)[rows, cols]
        aa[sl] = ((adj[start:stop] * inv_log) @ adj)[rows, cols]
    union = degree[pairs.i] + degree[pairs.j] - cn
    jac = np.divide(cn, union, out=np.zeros_like(cn), where=union > 0)
    return cn, aa, jac


def baseline_scores(
    snapshot: Snapshot, pairs: PairSet, threshold: int = LINK_THRESHOLD
) -> dict[str, np.ndarray]:
    """Score every pair in ``pairs`` with each baseline; higher means more likely to link.

    Returns float arrays aligned with ``pairs`` for: ``current_weight``, ``degree_product``,
    ``preferential_attachment``, ``common_neighbours``, ``adamic_adar``, ``jaccard``.
    """
    linked, linked_deg = _graph(snapshot, pairs, threshold)
    _, any_deg = _graph(snapshot, pairs, 1)
    cn, aa, jac = _common_neighbour_scores(linked, linked_deg, pairs)
    return {
        "current_weight": pairs.weight.astype(float),
        "degree_product": any_deg[pairs.i] * any_deg[pairs.j],
        "preferential_attachment": linked_deg[pairs.i] * linked_deg[pairs.j],
        "common_neighbours": cn,
        "adamic_adar": aa,
        "jaccard": jac,
    }
