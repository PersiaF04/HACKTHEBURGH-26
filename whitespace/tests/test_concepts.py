"""Tests for snapshot-safe concept extraction (issue #148), on hand-built toys."""
import datetime as dt
import random

from whitespace.pipeline import concepts as k

EARLY = dt.date(2014, 6, 1)
T_END = dt.date(2015, 12, 31)  # snapshot end for origin 2015
LATE = dt.date(2017, 3, 1)


def docs(n, text, date=EARLY):
    return [(date, text)] * n


# --- normalisation -------------------------------------------------------------------------


def test_phrases_one_to_three_words_hyphen_and_plural():
    # tokens: graph, neural, network ("neural-networks" -> "neural networks" -> "network")
    got = k.extract_phrases("Graph neural-networks")
    assert got == {"graph", "neural", "network", "graph neural", "neural network", "graph neural network"}


def test_plural_rules_and_exceptions():
    assert k.extract_phrases("studies") == {"study"}  # ies -> y
    assert k.extract_phrases("processes") == {"process"}  # ses -> strip s
    assert k.extract_phrases("branches") == {"branch"}  # ches -> strip es
    assert k.extract_phrases("models") == {"model"}  # plain s
    assert k.extract_phrases("phases") == {"phase"}
    for word in ("analysis", "bias", "physics", "class", "series", "gas", "corpus"):
        assert k.extract_phrases(word) == {word}  # exceptions and -ss/-us/-is/-ics stay put


def test_case_is_folded():
    assert k.extract_phrases("Quantum QUANTUM quantum") == {"quantum", "quantum quantum", "quantum quantum quantum"}


def test_digit_only_tokens_dropped_and_break_phrases():
    # "2020" is digit-only: dropped, and "model" / "graph" are not joined across it.
    assert k.extract_phrases("graph 2020 model") == {"graph", "model"}
    # alphanumeric tokens are kept
    assert k.extract_phrases("gpt4 3d") == {"gpt4", "3d", "gpt4 3d"}


def test_punctuation_breaks_phrases():
    assert k.extract_phrases("graph, neural") == {"graph", "neural"}
    assert k.extract_phrases("graph. neural") == {"graph", "neural"}


def test_stop_words_not_edges_never_alone():
    assert k.extract_phrases("of the and") == set()
    # first and last words must be content words; inner stop word allowed
    assert k.extract_phrases("the quality of service is") == {
        "quality",
        "service",
        "quality of service",
    }
    # "of service" and "quality of" are excluded: they start or end with a stop word
    assert "of service" not in k.extract_phrases("quality of service")


def test_at_most_three_words():
    got = k.extract_phrases("alpha beta gamma delta")
    assert "alpha beta gamma delta" not in got
    assert max(len(p.split()) for p in got) == 3
    assert len(got) == 4 + 3 + 2  # 4 unigrams, 3 bigrams, 2 trigrams


# --- vocabulary: document frequency, threshold ---------------------------------------------


def test_min_papers_boundary_29_30_31():
    # "qubit" appears in n docs; threshold 30 keeps it only from n = 30 up.
    for n, expected in ((29, False), (30, True), (31, True)):
        vocab = k.build_vocabulary(docs(n, "qubit"), 2015, min_papers=30)
        assert ("qubit" in vocab) is expected, n


def test_default_min_papers_is_30():
    assert "qubit" not in k.build_vocabulary(docs(29, "qubit"), 2015)
    assert "qubit" in k.build_vocabulary(docs(30, "qubit"), 2015)


def test_document_frequency_not_term_frequency():
    # 15 docs x 3 repeats = term frequency 45 >= 30, but document frequency is only 15.
    vocab = k.build_vocabulary(docs(15, "qubit qubit qubit"), 2015)
    assert "qubit" not in vocab
    # 15 docs "qubit" + 15 docs "qubit qubit": df = 30 -> in, although tf = 45 either way.
    mixed = docs(15, "qubit") + docs(15, "qubit qubit")
    assert "qubit" in k.build_vocabulary(mixed, 2015)


def test_phrase_counted_once_per_doc_across_title_and_abstract():
    # one doc whose text repeats the phrase many times contributes exactly 1
    counted = k.build_vocabulary(docs(1, "qubit. qubit! qubit " * 50), 2015, min_papers=2)
    assert "qubit" not in counted


# --- vocabulary as of T --------------------------------------------------------------------


def test_snapshot_boundary_is_31_december_inclusive():
    on_last_day = docs(30, "qubit", dt.date(2015, 12, 31))
    day_after = docs(30, "qubit", dt.date(2016, 1, 1))
    assert "qubit" in k.build_vocabulary(on_last_day, 2015)
    assert "qubit" not in k.build_vocabulary(day_after, 2015)


def test_vocabulary_is_as_of_T():
    # lattice: 20 docs in 2014 + 10 in 2016 -> 20 at T=2014/2015, 30 at T=2016.
    # photon: 30 docs in 2014 -> present at every T >= 2014.
    corpus = docs(20, "lattice", EARLY) + docs(10, "lattice", dt.date(2016, 3, 1)) + docs(30, "photon", EARLY)
    v2014 = k.build_vocabulary(corpus, 2014)
    v2015 = k.build_vocabulary(corpus, 2015)
    v2016 = k.build_vocabulary(corpus, 2016)
    assert "lattice" not in v2014 and "lattice" not in v2015
    assert "lattice" in v2016
    assert "photon" in v2014 and "photon" in v2016
    assert v2014 <= v2016  # cumulative here: nothing present at 2014 vanishes


def test_phrase_reaching_threshold_only_after_origin_is_excluded():
    # magnon: 29 docs by end of 2015, the 30th in 2016. Not in vocabulary 2015; in 2016.
    corpus = docs(29, "magnon", dt.date(2015, 5, 5)) + docs(1, "magnon", dt.date(2016, 2, 2))
    assert "magnon" not in k.build_vocabulary(corpus, 2015)
    assert "magnon" in k.build_vocabulary(corpus, 2016)
    # and it cannot be assigned at T=2015 even though a late paper uses it
    assert k.assign_concepts("magnon", k.build_vocabulary(corpus, 2015)) == ()


def test_poison_test_post_origin_text_cannot_change_vocabulary_or_assignments():
    base = docs(30, "alpha beta", EARLY) + docs(31, "gamma delta", dt.date(2015, 7, 7))
    clean_late = [(dt.date(2016, 1, 1), "alpha beta"), (dt.date(2019, 5, 5), "gamma")]
    # poison: rewrite every text dated after T; add many extra late docs that would cross 30
    poison_late = [(d, "zeta eta theta alpha gamma completely different words") for d, _ in clean_late]
    poison_late += docs(100, "zeta eta theta", dt.date(2020, 1, 1))
    texts = ["alpha beta gamma", "gamma delta", "zeta eta", "nothing here at all", "alpha"]

    v_clean = k.build_vocabulary(base + clean_late, 2015)
    v_poison = k.build_vocabulary(base + poison_late, 2015)
    assert v_clean == v_poison  # identical vocabulary at T=2015
    assert "zeta" not in v_poison  # 100 poison docs, all after T: invisible
    for text in texts:
        assert k.assign_concepts(text, v_clean) == k.assign_concepts(text, v_poison)
        assert k.assign_concepts_flagged(text, v_clean, "T1") == k.assign_concepts_flagged(
            text, v_poison, "T1"
        )


# --- assignment ----------------------------------------------------------------------------


def test_assignment_uses_only_vocabulary_and_is_sorted():
    vocab = frozenset({"model", "graph", "graph model", "unrelated"})
    got = k.assign_concepts("A graph model of models", vocab)
    assert got == ("graph", "graph model", "model")  # sorted, a tuple
    assert isinstance(got, tuple)
    assert set(got) <= vocab  # never a phrase outside the vocabulary
    assert "unrelated" not in got


def test_fallback_flagged_only_when_no_phrase():
    vocab = frozenset({"graph"})
    # has a phrase: fallback ignored, not flagged
    assert k.assign_concepts_flagged("graph", vocab, "T12072") == (("graph",), False)
    # no phrase, hook supplied: topic concept, flagged
    out = k.assign_concepts_flagged("nothing relevant", vocab, "T12072")
    assert out == (("topic:T12072",), True)
    assert out.used_fallback is True
    # no phrase, no hook: empty and not flagged
    assert k.assign_concepts_flagged("nothing relevant", vocab) == ((), False)
    # assign_concepts never invents the fallback
    assert k.assign_concepts("nothing relevant", vocab) == ()


# --- determinism ---------------------------------------------------------------------------


def test_deterministic_across_shuffled_input():
    corpus = (
        docs(30, "alpha beta gamma", EARLY)
        + docs(35, "beta gamma delta", dt.date(2015, 3, 3))
        + docs(40, "delta epsilon", LATE)
    )
    reference = k.build_vocabulary(corpus, 2015)
    rng = random.Random(0)
    for _ in range(5):
        shuffled = corpus[:]
        rng.shuffle(shuffled)
        assert k.build_vocabulary(shuffled, 2015) == reference
    text = "gamma beta alpha delta"
    out = k.assign_concepts(text, reference)
    assert list(out) == sorted(out)
    assert out == k.assign_concepts(text, set(reference))  # set vs frozenset: same result
    # hand check: alpha beta gamma (30) and beta gamma delta (35) docs before the end of 2015
    # unigrams alpha=30 beta=65 gamma=65 delta=35 pass; "alpha beta" 30, "beta gamma" 65,
    # "gamma delta" 35 pass; "alpha beta gamma" 30, "beta gamma delta" 35 pass; epsilon is 2017.
    assert "epsilon" not in reference and "alpha beta gamma" in reference
