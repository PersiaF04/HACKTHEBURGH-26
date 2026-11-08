"""Tests for pruned streaming document-frequency counting (issue #157).

Run as a script (``python -m whitespace.tests.test_streaming_counts``) to print the memory and time
comparison on 100,000 synthetic abstracts; nothing is committed as data.
"""
import datetime as dt
import random
import time
import tracemalloc

import pytest

from whitespace.pipeline import concepts as k

T_END = dt.date(2015, 12, 31)
LATE = dt.date(2017, 3, 1)

# a few stop words in the vocabulary so that "a of b" style trigrams occur
STOPS = ["of", "the", "and", "with"]


def random_corpus(seed, n_docs, vocab_size=8, doc_len=(1, 9), late_fraction=0.2):
    rng = random.Random(seed)
    words = [f"w{i}" for i in range(vocab_size)] + STOPS
    docs = []
    for _ in range(n_docs):
        n = rng.randint(*doc_len)
        text = " ".join(rng.choice(words) for _ in range(n))
        if rng.random() < 0.15:
            text = text.replace(" ", ", ", 1)  # a punctuation break
        late = rng.random() < late_fraction
        year = rng.choice([2017, 2018]) if late else rng.choice([2013, 2014, 2015])
        docs.append((dt.date(year, rng.randint(1, 12), rng.randint(1, 28)), text))
    return docs


@pytest.mark.parametrize("seed", range(40))
@pytest.mark.parametrize("min_papers", [1, 3, 10, 30])
def test_pruned_counts_equal_reference_above_threshold(seed, min_papers):
    docs = random_corpus(seed, 400)
    ref, ref_n = k.document_frequencies(docs, 2015)
    got, n = k.streaming_document_frequencies(lambda: iter(docs), 2015, min_papers)
    expected = {p: c for p, c in ref.items() if c >= min_papers}
    assert n == ref_n
    assert dict(got) == expected
    assert len(expected) > 0 or min_papers == 30  # the property is not vacuous for small thresholds


def test_property_actually_exercises_many_phrases_and_stop_word_trigrams():
    docs = random_corpus(0, 400)
    got, _ = k.streaming_document_frequencies(lambda: iter(docs), 2015, 3)
    assert sum(1 for p in got if p.count(" ") == 2) > 10
    assert any(p.split()[1] in STOPS for p in got if p.count(" ") == 2)


@pytest.mark.parametrize("origin", [2013, 2014, 2015, 2016, 2017, 2018])
def test_origins(origin):
    docs = random_corpus(7, 500)
    ref, ref_n = k.document_frequencies(docs, origin)
    got, n = k.streaming_document_frequencies(lambda: iter(docs), origin, 5)
    assert n == ref_n
    assert dict(got) == {p: c for p, c in ref.items() if c >= 5}


def test_source_is_called_at_most_three_times_and_streams():
    docs = random_corpus(1, 200)
    calls = []

    def source():
        calls.append(1)
        return (d for d in docs)  # a generator: never materialised by the counter

    k.streaming_document_frequencies(source, 2015, 3)
    assert len(calls) == 3


def test_post_origin_text_is_ignored():
    def corpus(poison):
        early = [(dt.date(2014, 1, 1), "alpha beta gamma")] * 40
        late = [(LATE, "zeta eta theta" if poison else "alpha beta gamma")] * 60
        return early + late

    a, na = k.streaming_document_frequencies(lambda: iter(corpus(False)), 2015, 30)
    b, nb = k.streaming_document_frequencies(lambda: iter(corpus(True)), 2015, 30)
    assert a == b and na == nb == 40
    assert a["alpha beta gamma"] == 40 and "zeta" not in b


def test_select_vocabulary_same_with_pruned_and_reference_counts():
    for seed in range(10):
        docs = random_corpus(seed, 600)
        for min_papers in (3, 10):
            kw = dict(min_papers=min_papers, ceiling_fraction=0.9, single_word_factor=1.0)
            ref, n = k.document_frequencies(docs, 2015)
            expected = k.select_concepts(ref, n, **kw)
            assert k.select_vocabulary(docs, 2015, **kw) == expected  # plain iterable
            assert k.select_vocabulary(lambda: iter(docs), 2015, **kw) == expected  # callable


# --- benchmark (script only) -----------------------------------------------------------------


def synthetic_abstracts(n_docs=100_000, doc_len=120, n_words=20_000, seed=0):
    """Zipf word draws dated 2012 to 2021; a function so nothing is stored when streaming."""
    import numpy as np

    def source():
        rng = np.random.default_rng(seed)
        names = [f"w{i}x" for i in range(n_words)]
        for i in range(n_docs):
            ranks = np.minimum(rng.zipf(1.1, doc_len), n_words) - 1
            year = 2012 + (i * 10) // n_docs
            yield dt.date(year, 6, 1), " ".join(names[r] for r in ranks)

    return source


def measure(fn):
    tracemalloc.start()
    t0 = time.perf_counter()
    result = fn()
    dt_s = time.perf_counter() - t0
    peak = tracemalloc.get_traced_memory()[1]
    tracemalloc.stop()
    return result, peak / 1e6, dt_s


if __name__ == "__main__":
    src = synthetic_abstracts()
    t0 = time.perf_counter()
    ref, n = k.document_frequencies(src(), 2021)
    ref_plain_s = time.perf_counter() - t0
    del ref
    t0 = time.perf_counter()
    k.streaming_document_frequencies(src, 2021)
    new_plain_s = time.perf_counter() - t0
    print(f"wall time without tracemalloc: reference {ref_plain_s:.0f} s, pruned {new_plain_s:.0f} s")
    (ref, n), ref_mb, ref_s = measure(lambda: k.document_frequencies(src(), 2021))
    ref_phrases = len(ref)
    sel_ref = k.select_concepts(ref, n)
    del ref
    (got, n2), new_mb, new_s = measure(lambda: k.streaming_document_frequencies(src, 2021))
    print(f"reference: peak {ref_mb:.0f} MB, {ref_s:.0f} s traced, {ref_phrases} phrases")
    print(f"pruned:    peak {new_mb:.0f} MB, {new_s:.0f} s traced, {len(got)} phrases >= 30")
    print("selection equal:", k.select_concepts(got, n2) == sel_ref, "concepts:", len(sel_ref))
