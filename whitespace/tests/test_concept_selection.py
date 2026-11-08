"""Tests for concept selection (issue #154), on hand-built toys."""
import datetime as dt
import random

from whitespace.pipeline import concepts as k

EARLY = dt.date(2014, 6, 1)
T_END = dt.date(2015, 12, 31)
LATE = dt.date(2017, 3, 1)


def docs(n, text, date=EARLY):
    return [(date, text)] * n


def sel(df, n_docs=10_000, **kw):
    kw.setdefault("min_papers", 30)
    return k.select_concepts(df, n_docs, **kw)


def test_cap_keeps_highest_score_with_alphabetical_ties():
    df = {f"w{i:02d} term": 100 for i in range(10)}
    df["big term"] = 150
    assert sel(df, max_concepts=4) == {"big term", "w00 term", "w01 term", "w02 term"}
    assert sel(df, max_concepts=0) == frozenset()
    assert len(sel(df, max_concepts=5000)) == 11


def test_subsumption_graph_neural_example():
    df = {"graph neural": 100, "graph neural network": 95, "neural network": 200, "graph": 400}
    got = sel(df, n_docs=100_000)
    assert "graph neural" not in got
    assert "graph neural network" in got
    # 95 < 0.9 * 200 and 95 < 0.9 * 400: the shorter, more frequent phrases stay
    assert {"neural network", "graph"} <= got


def test_subsumption_threshold_and_ratio_parameter():
    assert "graph neural" in sel({"graph neural": 100, "graph neural network": 89})  # 89 < 90
    assert "graph neural" not in sel({"graph neural": 100, "graph neural network": 90})
    assert "graph neural" not in sel({"graph neural": 100, "graph neural network": 85}, subsume_ratio=0.85)
    assert "graph neural" in sel({"graph neural": 100, "graph neural network": 99}, subsume_ratio=1.0)


def test_subsumption_by_phrase_failing_quality_does_not_apply():
    df = {"graph neural": 100, "graph neural graph": 100}  # repeated word: cannot replace it
    assert sel(df) == {"graph neural"}


def test_generic_ceiling():
    df = {"deep learning": 200, "rare thing": 100}
    assert sel(df, n_docs=10_000) == {"deep learning", "rare thing"}  # 200 == 2% of 10,000: kept
    assert sel(df, n_docs=9_000) == {"rare thing"}  # 200 > 180
    assert sel(df, n_docs=9_000, ceiling_fraction=0.03) == {"deep learning", "rare thing"}


def test_single_word_bar_higher_than_multi_word():
    df = {"qubit": 60, "photon": 90, "qubit gate": 30}
    assert sel(df) == {"photon", "qubit gate"}
    assert "qubit" in sel(df, single_word_factor=1.0)


def test_quality_rules():
    df = {
        "the model": 100,  # leading stop word
        "model of": 100,  # trailing stop word
        "model 2020": 100,  # digit-only token
        "model model": 100,  # repeated word
        "quality of service": 100,
    }
    assert sel(df) == {"quality of service"}


def test_score_prefers_multi_word_mildly():
    df = {"alpha": 100, "beta gamma": 90}  # 100 vs 90 * 1.2 = 108
    assert sel(df, max_concepts=1, single_word_factor=1.0) == {"beta gamma"}
    assert sel(df, max_concepts=1, single_word_factor=1.0, multi_word_bonus=1.0) == {"alpha"}
    assert k.concept_score("alpha", 10) == 10 and k.concept_score("a b", 10) == 12


def test_selection_deterministic_under_shuffled_input():
    df = {f"t{i % 7} u{i}": 40 + (i % 5) for i in range(60)}
    ref = sel(df, max_concepts=20)
    rng = random.Random(1)
    for _ in range(5):
        items = list(df.items())
        rng.shuffle(items)
        assert sel(dict(items), max_concepts=20) == ref
    corpus = docs(40, "alpha beta gamma") + docs(50, "delta epsilon", T_END) + docs(300, "filler")
    base = k.select_vocabulary(corpus, 2015, min_papers=30)
    for _ in range(3):
        shuffled = corpus[:]
        rng.shuffle(shuffled)
        assert k.select_vocabulary(shuffled, 2015, min_papers=30) == base


def late_corpus(poisoned):
    early = docs(40, "alpha beta gamma") + docs(200, "filler words here")
    late = [(LATE, "zeta eta theta" if poisoned else "alpha beta gamma")] * 60
    return early + late


def test_poison_selection_ignores_post_origin_text():
    kw = dict(min_papers=30, ceiling_fraction=0.5)
    clean = k.select_vocabulary(late_corpus(False), 2015, **kw)
    poison = k.select_vocabulary(late_corpus(True), 2015, **kw)
    assert clean == poison and "alpha beta gamma" in clean
    assert "zeta" not in poison
    # the denominator is the snapshot paper count, not the whole corpus
    assert k.document_frequencies(late_corpus(True), 2015)[1] == 240


def test_phrase_qualifying_only_after_origin_is_absent():
    corpus = docs(20, "magnon") + docs(100, "magnon", LATE) + docs(300, "filler")
    kw = dict(min_papers=30, single_word_factor=1.0, ceiling_fraction=1.0)
    assert "magnon" not in k.select_vocabulary(corpus, 2015, **kw)  # 20 by T < 30
    assert "magnon" in k.select_vocabulary(corpus, 2017, **kw)


def test_selected_vocabulary_feeds_assign_concepts():
    corpus = docs(40, "graph neural network") + docs(500, "filler")
    vocab = k.select_vocabulary(corpus, 2015, min_papers=30, ceiling_fraction=0.5)
    assert vocab == {"graph neural network"}  # sub-phrases subsumed
    assert k.assign_concepts("a graph neural network", vocab) == ("graph neural network",)
