"""Open-problem extraction (issue #270). Every sentence here is invented; no corpus text is used."""
import json
from collections import Counter

from whitespace.pipeline import open_problems as op


def test_split_keeps_abbreviations_together():
    s = op.split_sentences("We study graphs, e.g. trees. It remains unclear why they scale. Done.")
    assert s[0].startswith("We study graphs, e.g. trees")
    assert any("remains unclear" in x for x in s)


def test_classify_types_and_confidence():
    assert op.classify("How the method behaves on very large inputs remains an open question for the field.") == ("open_problem", 0.8)
    assert op.classify("We leave the extension to streaming data as a task for future work here.") == ("future_work", 0.8)
    assert op.classify("A limitation of this synthetic study is that it only uses two toy datasets.") == ("limitation", 0.5)
    assert op.classify("Whether the effect holds for children has not been studied in any depth so far.") == ("open_problem", 0.5)


def test_other_peoples_limitations_and_non_gaps_are_not_hits():
    assert op.classify("Our synthetic method overcomes the limitations of existing approaches to scheduling.") is None
    assert op.classify("The synthetic dataset can be used in future research on toy problems of this kind.") is None
    assert op.classify("This synthetic survey covers challenges and limitations of modern toy systems today.") is None
    assert op.classify("There are no open problems left in this particular synthetic toy setting here.") is None
    assert op.classify("Nothing special happens in this ordinary synthetic sentence about a toy method.") is None


def test_length_bounds_drop_instead_of_truncate():
    long = "It remains unclear " + "why " * 120 + "this happens."
    assert len(long) > op.MAX_SENTENCE and op.classify(long) is None
    assert op.classify("Remains unclear.") is None  # too short to be a quote


def test_hits_in_returns_whole_sentences():
    text = ("We build a toy system. How it scales to ten thousand nodes remains unexplored in this synthetic report. "
            "Extending it is future work.")
    got = op.hits_in(text)
    assert [g[1] for g in got] == ["open_problem"]  # the 3rd sentence is shorter than MIN_SENTENCE
    assert got[0][0] in text


def _line(i, year, abstract, title="Synthetic toy graphs"):
    return json.dumps({"id": f"W{i}", "year": year, "title": title, "abstract": abstract})


def test_corpus_pass_counts_and_concepts(tmp_path):
    vocab = {"toy graph", "streaming data"}
    lines = [
        _line(1, 2020, "We study toy graphs in depth here. Their behaviour on streaming data remains unexplored today."),
        _line(2, 2020, "We study toy graphs in depth here and report nothing else of note at all."),
        _line(3, 2021, "We study toy graphs in depth here. Extending them is left for future work on streaming data."),
        "not json",
        json.dumps({"id": "W9", "year": 2020, "title": "no abstract"}),
    ]
    corpus = tmp_path / "c.jsonl"
    corpus.write_text("\n".join(lines) + "\n", encoding="utf-8")
    res = op.run_corpus(corpus, vocab, workers=1, chunk=2)
    assert res["papers"][("toy graph", 2020)] == 2 and res["with_hit"][("toy graph", 2020)] == 1
    assert res["papers"][("", 2021)] == 1 and res["with_hit"][("", 2021)] == 1
    assert len(res["hits"]) == 2
    h = next(h for h in res["hits"] if h["paper"]["id"] == "W1")
    assert h["concept_ids"] == ["streaming data"] and h["sentence_level"] is True
    r = op.rates(res["papers"], res["with_hit"], "toy graph")
    assert [(x["year"], x["gap_rate"]) for x in r] == [(2020, 0.5), (2021, 1.0)]


def test_select_caps_per_concept_and_prefers_confident():
    mk = lambda i, conf, yr: {"sentence": f"s{i}", "type": "limitation", "confidence": conf,  # noqa: E731
                              "paper": {"id": f"W{i}", "year": yr}, "concept_ids": ["a"], "sentence_level": True}
    hits = [mk(1, 0.5, 2020), mk(2, 0.8, 2019), mk(3, 0.8, 2021), mk(4, 0.5, 2022)]
    got = op.select_for_concepts(hits, ["a", "b"], per_concept=2)
    assert [h["paper"]["id"] for h in got["a"]] == ["W3", "W2"] and "b" not in got


def test_label_frame_is_reproducible_and_capped():
    hits = [{"sentence": f"s{i}", "type": "limitation", "confidence": 0.5, "paper": {"id": f"W{i}", "year": 2020},
             "concept_ids": [], "sentence_level": False} for i in range(30)]
    a, b = op.label_frame(hits, n=10), op.label_frame(hits, n=10)
    assert a == b and len(a) == 10 and Counter(x["correct"] for x in a) == {"": 10}
    assert len(op.label_frame(hits, n=100)) == 30
