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
from collections.abc import Callable, Iterable, Iterator, Mapping
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


def _runs(text: str) -> Iterator[list[str]]:
    """Runs of normalised tokens between punctuation and digit-only tokens."""
    for segment in _PUNCT.split(text.lower().translate(_DASHES)):
        run: list[str] = []
        for token in segment.split():
            norm = _norm(token)
            if norm is None:  # digit-only token: ends the phrase
                if run:
                    yield run
                run = []
            else:
                run.append(norm)
        if run:
            yield run


def extract_phrases(text: str) -> set[str]:
    """The set of candidate phrases (1 to 3 normalised words) in ``text``."""
    out: set[str] = set()
    for run in _runs(text):
        _add_grams(run, out, _STOP)
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


# --- concept selection (issue #154) --------------------------------------------------------------
#
# ``build_vocabulary`` keeps every phrase with ``min_papers`` papers, which on real text is far too
# many (the eligible pair universe grows with the square of the concept count). ``select_concepts``
# shrinks it with deterministic rules that read only document frequencies counted at the origin.

MAX_CONCEPTS = 5000
SUBSUME_RATIO = 0.9  # drop a phrase when a longer phrase containing it has >= 90% of its count
CEILING_FRACTION = 0.02  # drop phrases found in more than 2% of all papers at T
SINGLE_WORD_FACTOR = 3.0  # a single word needs this many times ``min_papers`` papers
MULTI_WORD_BONUS = 1.2  # score multiplier for 2 and 3 word phrases


def document_frequencies(
    docs: Iterable[tuple[dt.date, str]], origin: int
) -> tuple[Counter[str], int]:
    """``(phrase -> document frequency, number of papers)`` over papers dated <= 31 Dec ``origin``.

    Later papers are skipped unread, so they cannot influence either value.
    """
    last = snapshot_end(origin)
    counts: Counter[str] = Counter()
    n_docs = 0
    for date, text in docs:
        if date <= last:
            n_docs += 1
            counts.update(extract_phrases(text))
    return counts, n_docs


def concept_score(phrase: str, df: int, multi_word_bonus: float = MULTI_WORD_BONUS) -> float:
    """Ranking score: document frequency, times ``multi_word_bonus`` for 2 to 3 word phrases."""
    return df * (multi_word_bonus if " " in phrase else 1.0)


def _phrase_ok(phrase: str) -> bool:
    """Quality rules: no edge stop word, no digit-only token, no repeated word."""
    words = phrase.split()
    if words[0] in _STOP or words[-1] in _STOP:
        return False
    if any(w.isdigit() for w in words):
        return False
    return len(set(words)) == len(words)


def _subphrases(words: list[str]) -> Iterable[str]:
    n = len(words)
    for size in range(1, n):
        for i in range(n - size + 1):
            yield " ".join(words[i : i + size])


def select_concepts(
    doc_freq: Mapping[str, int],
    n_docs: int,
    max_concepts: int = MAX_CONCEPTS,
    *,
    min_papers: int = MIN_PAPERS,
    ceiling_fraction: float = CEILING_FRACTION,
    subsume_ratio: float = SUBSUME_RATIO,
    single_word_factor: float = SINGLE_WORD_FACTOR,
    multi_word_bonus: float = MULTI_WORD_BONUS,
) -> frozenset[str]:
    """Pick at most ``max_concepts`` phrases from document frequencies counted at one origin.

    Pure function of ``doc_freq`` (phrase -> number of papers at T) and ``n_docs`` (papers at T);
    the caller must count both from papers dated <= 31 Dec T (see ``document_frequencies``).
    Steps, in order:

    1. Keep phrases with df >= ``min_papers``, passing ``_phrase_ok``, and df <= ``ceiling_fraction
       * n_docs`` (generic words). Single words need df >= ``single_word_factor * min_papers``.
    2. Subsumption: drop a phrase when a surviving longer phrase that contains it as a contiguous
       sub-phrase has df >= ``subsume_ratio * df(shorter)`` ("graph neural" goes, "graph neural
       network" stays).
    3. Rank by ``concept_score`` (df, times ``multi_word_bonus`` for 2 to 3 words), ties broken
       alphabetically, and keep the top ``max_concepts``.
    """
    ceiling = ceiling_fraction * n_docs
    single_min = single_word_factor * min_papers
    kept: dict[str, int] = {}
    for phrase, df in doc_freq.items():
        if df < min_papers or df > ceiling or not phrase or not _phrase_ok(phrase):
            continue
        if " " not in phrase and df < single_min:
            continue
        kept[phrase] = df
    dropped: set[str] = set()
    for phrase, df in kept.items():
        words = phrase.split()
        if len(words) < 2:
            continue
        for sub in _subphrases(words):
            sub_df = kept.get(sub)
            if sub_df is not None and df >= subsume_ratio * sub_df:
                dropped.add(sub)
    ranked = sorted(
        (p for p in kept if p not in dropped),
        key=lambda p: (-concept_score(p, kept[p], multi_word_bonus), p),
    )
    return frozenset(ranked[: max(0, max_concepts)])


DocSource = Callable[[], Iterator[tuple[dt.date, str]]]  # a re-iterable source of (date, text)


def streaming_document_frequencies(
    source: DocSource, origin: int, min_papers: int = MIN_PAPERS
) -> tuple[Counter[str], int]:
    """Exact df of every phrase with df >= ``min_papers``, in up to three passes (issue #157).

    ``source`` is a callable returning a fresh iterator of ``(date, text)`` pairs each time it is
    called. Only papers dated <= 31 Dec ``origin`` are counted. Apriori property: a phrase is in
    ``min_papers`` papers only if each of its candidate sub-phrases is, so each pass counts only
    phrases whose shorter parts survived the previous pass.

    1. single words (and the paper count); keep words with df >= ``min_papers``.
    2. two-word phrases whose both words are kept.
    3. three-word phrases ``a b c`` whose ``a`` and ``c`` are kept and, when ``b`` is not a stop
       word, whose ``a b`` and ``b c`` are kept two-word phrases (when ``b`` is a stop word those
       two are not candidate phrases, so only the edge words constrain).

    Returns ``(counts, n_docs)`` where ``counts`` holds exactly the phrases with df >= min_papers
    (same values as ``document_frequencies``); phrases below the threshold are absent.
    """
    last = snapshot_end(origin)

    def texts() -> Iterator[str]:
        for date, text in source():
            if date <= last:
                yield text

    stop = _STOP
    n_docs = 0
    words: Counter[str] = Counter()
    for text in texts():
        n_docs += 1
        seen: set[str] = set()
        for run in _runs(text):
            seen.update(w for w in run if w not in stop)
        words.update(seen)
    words = Counter({w: n for w, n in words.items() if n >= min_papers})
    out: Counter[str] = Counter(words)

    pairs: Counter[str] = Counter()
    for text in texts():
        seen = set()
        for run in _runs(text):
            for i in range(len(run) - 1):
                a, b = run[i], run[i + 1]
                if a in words and b in words:  # kept words are never stop words
                    seen.add(f"{a} {b}")
        pairs.update(seen)
    pairs = Counter({p: n for p, n in pairs.items() if n >= min_papers})
    out.update(pairs)

    triples: Counter[str] = Counter()
    for text in texts():
        seen = set()
        for run in _runs(text):
            for i in range(len(run) - 2):
                a, b, c = run[i], run[i + 1], run[i + 2]
                if a not in words or c not in words:
                    continue
                if b not in stop and (f"{a} {b}" not in pairs or f"{b} {c}" not in pairs):
                    continue
                seen.add(f"{a} {b} {c}")
        triples.update(seen)
    out.update({p: n for p, n in triples.items() if n >= min_papers})
    return out, n_docs


def select_vocabulary(
    docs: Iterable[tuple[dt.date, str]] | DocSource,
    origin: int,
    max_concepts: int = MAX_CONCEPTS,
    **kwargs,
) -> frozenset[str]:
    """Concept vocabulary for ``origin``: count df from papers dated <= 31 Dec ``origin``, select.

    ``docs`` is a callable returning a fresh iterator of ``(date, text)`` (streamed, memory
    bounded) or a plain iterable (materialised first, because counting needs several passes).
    ``kwargs`` go to ``select_concepts`` (``min_papers``, ``ceiling_fraction`` ...). Use the result
    as the ``vocabulary`` argument of ``assign_concepts``.
    """
    if callable(docs):
        source = docs
    else:
        items = list(docs)
        source = lambda: iter(items)  # noqa: E731
    min_papers = kwargs.get("min_papers", MIN_PAPERS)
    doc_freq, n_docs = streaming_document_frequencies(source, origin, min_papers)
    return select_concepts(doc_freq, n_docs, max_concepts, **kwargs)
