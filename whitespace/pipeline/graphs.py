"""Snapshot graph and eligible pair universe at an origin year T (issue #140).

Pure functions, no I/O. Definitions follow PRD.md sections 8 and 13 and ``common.py``:

* The snapshot holds works dated on or before 31 December T.
* A pair key is a sorted tuple ``(a, b)`` with ``a < b``. Its weight is the number of
  distinct works containing both concepts. Duplicate work ids count once.
* The eligible universe is every pair of concepts that each have at least ``n_min`` works
  at T and whose weight at T is below ``threshold``.

The universe can reach ~12M pairs at 5,000 concepts, so it is held as numpy index arrays
(``PairSet``), not as Python tuples. Pairs are in canonical order: by concept index ``i``,
then ``j``, with concepts sorted by name, i.e. the same order as sorting the tuple keys.
"""
from __future__ import annotations

import datetime as dt
from collections import Counter
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from itertools import combinations

import numpy as np

from .common import LINK_THRESHOLD, MIN_PAPERS, Work, snapshot_end


@dataclass(frozen=True)
class Snapshot:
    """Counts at the end of ``year``: papers per concept and weight per sorted pair key."""

    year: int
    counts: dict[str, int]
    weights: dict[tuple[str, str], int]


@dataclass(frozen=True)
class PairSet:
    """Eligible pairs as index arrays over ``names`` (sorted). Pair k is ``(names[i[k]], names[j[k]])``."""

    names: tuple[str, ...]
    i: np.ndarray  # int32, i < j
    j: np.ndarray  # int32
    weight: np.ndarray  # int8, weight at T (below the threshold)

    def __len__(self) -> int:
        return len(self.i)

    def keys(self) -> Iterator[tuple[str, str]]:
        """Lazily yield the sorted tuple keys in canonical order."""
        for a, b in zip(self.i.tolist(), self.j.tolist()):
            yield self.names[a], self.names[b]


def distinct_concepts(works: Iterable[Work], end: dt.date) -> Iterator[tuple[str, ...]]:
    """Sorted, de-duplicated concepts of each distinct work dated on or before ``end``."""
    seen: set[str] = set()
    for work in works:
        if work.date <= end and work.id not in seen:
            seen.add(work.id)
            yield tuple(sorted(set(work.concepts)))


def build_snapshot(works: Iterable[Work], origin: int) -> Snapshot:
    """Concept paper counts and pair weights using only works dated <= 31 Dec ``origin``."""
    counts: Counter[str] = Counter()
    weights: Counter[tuple[str, str]] = Counter()
    for concepts in distinct_concepts(works, snapshot_end(origin)):
        counts.update(concepts)
        weights.update(combinations(concepts, 2))
    return Snapshot(origin, dict(counts), dict(weights))


def vocabulary(snapshot: Snapshot, n_min: int = MIN_PAPERS) -> tuple[str, ...]:
    """Concepts with at least ``n_min`` works at T, sorted. Built from the snapshot only."""
    return tuple(sorted(c for c, n in snapshot.counts.items() if n >= n_min))


def eligible_pairs(
    snapshot: Snapshot, n_min: int = MIN_PAPERS, threshold: int = LINK_THRESHOLD
) -> PairSet:
    """The full eligible universe: both concepts with >= ``n_min`` works and weight < ``threshold``."""
    names = vocabulary(snapshot, n_min)
    n = len(names)
    index = {name: k for k, name in enumerate(names)}
    # weights of pairs inside the vocabulary, dense and capped at the threshold (int8)
    dense = np.zeros((n, n), dtype=np.int8)
    for (a, b), w in snapshot.weights.items():
        if a in index and b in index:
            dense[index[a], index[b]] = min(w, threshold)
    i, j = np.nonzero(np.triu(dense < threshold, k=1))
    return PairSet(names, i.astype(np.int32), j.astype(np.int32), dense[i, j])
