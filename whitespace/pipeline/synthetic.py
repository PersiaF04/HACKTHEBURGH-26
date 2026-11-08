"""Synthetic corpus generator for sanity-checking the backtest runner (issue #151).

THIS IS NOT DATA. It plants (or omits) a known signal so tests can show the runner finds a
signal that exists and reports plainly when none exists. Nothing here says anything about
real research literature.

Planted signal (``signal=True``): concepts belong to latent topics. A growing share of
papers are "topic papers" whose concepts all come from one topic, and a few "hot" topics
gain weight over time. So pairs sharing a topic co-occur more, increasingly so, and
concepts in hot topics show rising paper counts. Null (``signal=False``): every paper draws
concepts from the same popularity distribution regardless of topic and nothing grows apart
from total volume.
"""
from __future__ import annotations

import datetime as dt

import numpy as np

from .common import Work


def generate_works(
    signal: bool,
    seed: int = 0,
    n_concepts: int = 200,
    n_topics: int = 6,
    first_year: int = 2010,
    last_year: int = 2023,
    papers_first_year: int = 500,
) -> list[Work]:
    """Works for ``first_year``..``last_year``; volume grows 8% a year in both versions."""
    rng = np.random.default_rng(seed)
    names = [f"c{k:03d}" for k in range(n_concepts)]
    topic_of = rng.integers(0, n_topics, size=n_concepts)
    popularity = 1.0 / np.arange(1, n_concepts + 1) ** 0.7
    rng.shuffle(popularity)
    if not signal:
        popularity = np.ones(n_concepts)  # null: every concept equally likely, no topics, no growth
    works: list[Work] = []
    for year in range(first_year, last_year + 1):
        t = year - first_year
        n_papers = int(papers_first_year * 1.08**t)
        topic_w = np.ones(n_topics)
        topic_w[:2] += 0.6 * t  # two hot topics
        topic_w /= topic_w.sum()
        share = min(0.7, 0.2 + 0.04 * t)  # fraction of topic papers
        for p in range(n_papers):
            size = int(rng.integers(2, 5))
            if signal and rng.random() < share:
                topic = rng.choice(n_topics, p=topic_w)
                pool = np.flatnonzero(topic_of == topic)
            else:
                pool = np.arange(n_concepts)
            if len(pool) < size:
                pool = np.arange(n_concepts)
            w = popularity[pool] / popularity[pool].sum()
            chosen = rng.choice(pool, size=size, replace=False, p=w)
            day = dt.date(year, 1, 1) + dt.timedelta(days=int(rng.integers(0, 365)))
            works.append(Work(f"S{seed}-{year}-{p}", day, tuple(sorted(names[c] for c in chosen))))
    return works


def poison_after(works: list[Work], origin: int, seed: int = 99) -> list[Work]:
    """Copy of ``works`` where every work dated after 31 Dec ``origin`` gets random concepts
    and a random date, still after the origin. Used to prove nothing later leaks in."""
    rng = np.random.default_rng(seed)
    names = sorted({c for w in works for c in w.concepts})
    out = []
    for w in works:
        if w.date.year <= origin:
            out.append(w)
            continue
        k = int(rng.integers(1, 5))
        concepts = tuple(sorted(rng.choice(names, size=min(k, len(names)), replace=False).tolist()))
        day = dt.date(origin + 1, 1, 1) + dt.timedelta(days=int(rng.integers(0, 3 * 365)))
        out.append(Work(w.id, day, concepts))
    return out
