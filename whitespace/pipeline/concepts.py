"""Snapshot-safe concept extraction from title and abstract text (issue #148).

A concept is a normalised keyword phrase of 1 to 3 words taken from the text of a paper.
``build_vocabulary`` keeps the phrases that occur in at least ``min_papers`` papers dated on or
before 31 December of the origin ``T``; ``assign_concepts`` maps a paper to the vocabulary phrases
it contains. Everything is a pure function of its arguments: no network, no files, no clock.

Leakage rule (PRD section 13, issue #122): the vocabulary for origin ``T`` is counted from papers
dated ``<= snapshot_end(T)`` only, so changing any later text cannot change it. Phrases come from
the paper's own text, not from OpenAlex topic assignments, because those are retroactive (they
were produced by a classifier run after the snapshot). A topic id enters only through the optional
``fallback_topic`` hook, and is flagged so it can be audited.

Method
------
* Lower-case, hyphens become spaces, punctuation ends a phrase, digit-only tokens end a phrase.
* Minimal stemming: plural ``ies/es/s`` stripping with a small exception set (``analysis``,
  ``bias``, ``series`` ...). It is deliberately crude; it merges ``models``/``model`` and no more.
* Candidates are every run of 1 to 3 consecutive tokens whose first and last token are not stop
  words (so no phrase is made only of stop words; inner stop words are allowed: ``quality of
  service``). The stop-word list is embedded below.
* Frequency is DOCUMENT frequency: a phrase counts once per paper, however often it repeats.

NOT implemented here, on purpose
--------------------------------
* The PRD's embedding-based near-duplicate merge (cosine similarity above 0.92). It needs the
  embedding model and concept embeddings, which belong to a later issue. Only deterministic
  string normalisation (case, hyphens, plurals) merges variants here, so ``neural net`` and
  ``neural network`` stay separate concepts until that later step exists.
* KeyBERT or any model-based keyphrase ranking: it needs an embedding model and is slower. Here
  every n-gram that meets the paper-count threshold is a concept, which is simpler and
  reproducible but yields more generic and overlapping phrases than a ranked extractor would.
"""
from __future__ import annotations

import datetime as dt
import re
from collections import Counter
from collections.abc import Iterable
from typing import NamedTuple

from whitespace.pipeline.common import MIN_PAPERS, snapshot_end

MAX_WORDS = 3
FALLBACK_PREFIX = "topic:"  # marks a concept that came from the fallback hook, not from text

_STOP_TEXT = """
a about above after again against all almost also although always am among an and any are as at
be because been before being below between both but by can could did do does doing done down
during each either else even ever every few for from further had has have having he her here hers
him his how however i if in into is it its itself just may me might more most much must my no nor
not now of off on once only onto or other our out over own per rather same she should since so
some such than that the their theirs them then there therefore these they this those through thus
to too toward towards under until up upon us very via was we were what when where whether which
while who whom whose why will with within without would yet you your
abstract approach also paper propose proposed proposes present presents presented show shows
shown showed result results use used uses using based novel new well one two three
"""
_STOP = frozenset(_STOP_TEXT.split()) | frozenset("abcdefghijklmnopqrstuvwxyz")

# Words ending in s that are not plurals (checked before the plural rules).
_NO_STEM = frozenset(
    "analysis axis basis bias canvas chaos class gas hypothesis lens news series species status "
    "synthesis thesis atlas bus plus focus corpus virus census consensus bonus".split()
)

_DASHES = dict.fromkeys(map(ord, "‐‑‒–—―−-"), " ")
_PUNCT = re.compile(r"[^\w\s]+|_+")  # anything that is not a letter, digit or space ends a phrase
_cache: dict[str, str | None] = {}  # raw token -> normalised token; None = digit-only boundary


def _stem(word: str) -> str:
    """Strip a plural ending; leave short words and the exception set alone."""
    n = len(word)
    if n <= 3 or word in _NO_STEM or not word.endswith("s"):
        return word
    if word.endswith(("ss", "us", "is", "ics")):  # class, corpus, basis, physics
        return word
    if word.endswith("ies") and n > 4:
        return word[:-3] + "y"  # studies -> study
    if word.endswith(("sses", "ches", "shes", "xes", "zes")):
        return word[:-2]  # processes -> process, approaches -> approach
    return word[:-1]  # models -> model, phases -> phase


def _norm(token: str) -> str | None:
    out = _cache.get(token, "")
    if out != "":
        return out
    if token.isdigit():
        res = None
    elif token in _STOP:
        res = token
    else:
        res = _stem(token)
    _cache[token] = res
    return res


def extract_phrases(text: str) -> set[str]:
    """The set of candidate phrases (1 to 3 normalised words) in ``text``."""
    out: set[str] = set()
    stop = _STOP
    for segment in _PUNCT.split(text.lower().translate(_DASHES)):
        run: list[str] = []
        for token in segment.split():
            norm = _norm(token)
            if norm is None:  # digit-only token: ends the phrase
                _add_grams(run, out, stop)
                run = []
            else:
                run.append(norm)
        _add_grams(run, out, stop)
    return out


def _add_grams(run: list[str], out: set[str], stop: frozenset[str]) -> None:
    n = len(run)
    for i in range(n):
        a = run[i]
        if a in stop:
            continue
        out.add(a)
        if i + 1 < n:
            b = run[i + 1]
            if b not in stop:
                out.add(f"{a} {b}")
            if i + 2 < n:
                c = run[i + 2]
                if c not in stop:
                    out.add(f"{a} {b} {c}")


def build_vocabulary(
    docs: Iterable[tuple[dt.date, str]], origin: int, min_papers: int = MIN_PAPERS
) -> frozenset[str]:
    """Phrases found in at least ``min_papers`` papers dated on or before 31 Dec ``origin``.

    ``docs`` is any iterable of ``(date, title_plus_abstract)`` pairs, in any order. Papers dated
    after the snapshot are skipped without being read, so their text cannot influence the result.
    Counts are document frequencies.
    """
    last = snapshot_end(origin)
    counts: Counter[str] = Counter()
    for date, text in docs:
        if date <= last:
            counts.update(extract_phrases(text))
    return frozenset(p for p, n in counts.items() if n >= min_papers)


class Assignment(NamedTuple):
    """Concepts of one paper; ``used_fallback`` is True when they came from the topic hook."""

    concepts: tuple[str, ...]
    used_fallback: bool


def assign_concepts_flagged(
    text: str, vocabulary: frozenset[str] | set[str], fallback_topic: str | None = None
) -> Assignment:
    """Vocabulary phrases present in ``text`` (sorted), or the fallback topic if there are none.

    The fallback is ``"topic:<id>"`` with ``used_fallback=True`` and is used only when the paper has
    no vocabulary phrase and ``fallback_topic`` is given. The topic id comes from OpenAlex, whose
    assignments are retroactive: callers must pin the vintage and audit the flagged papers.
    """
    found = tuple(sorted(extract_phrases(text) & vocabulary))
    if found:
        return Assignment(found, False)
    if fallback_topic:
        return Assignment((FALLBACK_PREFIX + fallback_topic,), True)
    return Assignment((), False)


def assign_concepts(text: str, vocabulary: frozenset[str] | set[str]) -> tuple[str, ...]:
    """Sorted tuple of the vocabulary phrases present in ``text``; never a phrase outside it."""
    return assign_concepts_flagged(text, vocabulary).concepts
