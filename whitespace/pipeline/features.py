"""Pair features at an origin T, built from the snapshot only (issue #151).

Every value uses works dated on or before 31 December T (same filter and de-duplication as
``graphs.build_snapshot``). Current citation counts, venue and any later-dated field are
not features. Features per eligible pair, concept-level ones made symmetric with min/max:

* ``weight``: co-occurrence count at T (0, 1 or 2)
* ``log1p_<baseline>``: the six baseline scores from ``baselines.py`` (log1p-transformed)
* ``log_count_min/max``: log of the two concepts' paper counts at T
* ``growth_min/max``: log((papers in T-2..T) + 1) - log((papers in T-5..T-3) + 1) per concept
* ``age_min/max``: T minus the first year each concept appears in the snapshot

Memory: the baselines hold one score vector per baseline for the whole universe (float64).
Features are produced in blocks of rows (``feature_blocks``) as float32 so a ~12M pair
universe is never materialised as one wide matrix unless the caller asks for it.
"""
from __future__ import annotations

from collections.abc import Iterable, Iterator
from dataclasses import dataclass

import numpy as np

from .baselines import baseline_scores
from .common import Work, snapshot_end
from .graphs import PairSet, Snapshot

BASELINE_NAMES = (
    "current_weight", "degree_product", "preferential_attachment",
    "common_neighbours", "adamic_adar", "jaccard",
)
FEATURE_NAMES = (
    "weight",
    *(f"log1p_{b}" for b in BASELINE_NAMES),
    "log_count_min", "log_count_max", "growth_min", "growth_max", "age_min", "age_max",
)
BLOCK_ROWS = 500_000


@dataclass(frozen=True)
class FeatureContext:
    """Everything needed to emit feature blocks for one origin."""

    origin: int
    pairs: PairSet
    scores: dict[str, np.ndarray]
    log_count: np.ndarray  # per concept
    growth: np.ndarray
    age: np.ndarray


def _concept_stats(works: Iterable[Work], origin: int, names: tuple[str, ...]):
    """Total papers, papers in T-2..T, papers in T-5..T-3 and first year, per concept.

    Only works dated <= 31 Dec T are read; duplicate work ids count once.
    """
    index = {name: k for k, name in enumerate(names)}
    n = len(names)
    total = np.zeros(n)
    recent = np.zeros(n)
    previous = np.zeros(n)
    first = np.full(n, origin, dtype=float)
    end = snapshot_end(origin)
    seen: set[str] = set()
    for work in works:
        if work.date > end or work.id in seen:
            continue
        seen.add(work.id)
        year = work.date.year
        for c in set(work.concepts):
            k = index.get(c)
            if k is None:
                continue
            total[k] += 1
            if year >= origin - 2:
                recent[k] += 1
            elif year >= origin - 5:
                previous[k] += 1
            first[k] = min(first[k], year)
    return total, recent, previous, first


def build_context(works: Iterable[Work], snapshot: Snapshot, pairs: PairSet) -> FeatureContext:
    """Compute baseline scores and concept-level features for ``pairs`` at ``snapshot.year``."""
    origin = snapshot.year
    total, recent, previous, first = _concept_stats(works, origin, pairs.names)
    return FeatureContext(
        origin, pairs, baseline_scores(snapshot, pairs),
        np.log(np.maximum(total, 1.0)),
        np.log(recent + 1.0) - np.log(previous + 1.0),
        origin - first,
    )


def feature_block(ctx: FeatureContext, rows: slice) -> np.ndarray:
    """float32 feature matrix for ``pairs[rows]``, columns in ``FEATURE_NAMES`` order."""
    p, i, j = ctx.pairs, ctx.pairs.i[rows], ctx.pairs.j[rows]
    cols = [p.weight[rows].astype(float)]
    cols += [np.log1p(ctx.scores[b][rows]) for b in BASELINE_NAMES]
    for arr in (ctx.log_count, ctx.growth, ctx.age):
        cols += [np.minimum(arr[i], arr[j]), np.maximum(arr[i], arr[j])]
    return np.column_stack(cols).astype(np.float32)


def feature_blocks(ctx: FeatureContext, block: int = BLOCK_ROWS) -> Iterator[tuple[slice, np.ndarray]]:
    """Yield ``(rows, X)`` for consecutive row blocks of the universe."""
    for start in range(0, len(ctx.pairs), block):
        rows = slice(start, min(start + block, len(ctx.pairs)))
        yield rows, feature_block(ctx, rows)


def feature_matrix(ctx: FeatureContext, rows: np.ndarray | slice | None = None) -> np.ndarray:
    """Features for the given row indices (or all rows). Indices are processed in blocks."""
    if rows is None:
        rows = slice(0, len(ctx.pairs))
    if isinstance(rows, slice):
        return np.vstack([x for _, x in feature_blocks(ctx)]) if len(ctx.pairs) else np.empty((0, len(FEATURE_NAMES)), np.float32)
    idx = np.asarray(rows)
    sub = PairSet(ctx.pairs.names, ctx.pairs.i[idx], ctx.pairs.j[idx], ctx.pairs.weight[idx])
    scores = {k: v[idx] for k, v in ctx.scores.items()}
    return feature_block(FeatureContext(ctx.origin, sub, scores, ctx.log_count, ctx.growth, ctx.age), slice(None))
