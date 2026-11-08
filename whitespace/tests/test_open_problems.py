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
    assert a == b and len(a) == 10 and all("correct" not in x for x in a)
    assert len(op.label_frame(hits, n=100)) == 30


def _hit(i, concepts, conf=0.8, year=2022, kind="open_problem", sentence=None):
    return {"sentence": sentence or f"Synthetic sentence number {i} says this toy topic remains unexplored today.",
            "type": kind, "confidence": conf, "paper": {"id": f"W{i}", "title": f"Toy paper {i}", "year": year},
            "concept_ids": concepts, "sentence_level": True}


def test_build_export_shapes_caps_and_display_only_rates():
    hits = [_hit(i, ["a", "b"] if i % 2 else ["a"]) for i in range(1, 12)] + [_hit(50, ["zzz"])]
    counts = {("", 2022): (100, 10), ("a", 2022): (40, 8), ("b", 2022): (20, 2), ("zzz", 2022): (5, 1)}
    out = op.build_export(hits, counts, [("a", "b")], ["a", "b"], lambda i: f"https://example.org/{i}", 2022)
    d = out["gap_details"]["a|b"]
    assert len(d) == op.PER_GAP and all({"a", "b"} <= set(x["concept_ids"]) for x in d)  # both-concept hits first
    assert len(out["concepts"]["a"]) == op.PER_CONCEPT and "zzz" not in out["concepts"]
    f = out["file"]
    assert f["placeholder"] is False and f["quality"] == "unmeasured" and f["attribution"]
    assert f["rates_by_year"] == [{"year": 2022, "concept_rate": None, "ai_ml_rate": 0.1}]
    assert out["gap_rates"]["a"] == 0.2 and out["file"]["rates_by_concept"]["a"][0]["concept_rate"] == 0.2
    assert all(i["paper"]["url"].startswith("https://example.org/") for i in f["items"])


def test_validator_accepts_short_quotes_and_rejects_long_or_unattributed():
    from whitespace.pipeline import export_all as E

    good = {"sentence": "Whether this synthetic effect generalises remains an open question for the toy field.",
            "type": "open_problem", "confidence": 0.8, "concept_ids": [],
            "paper": {"id": "W1", "title": "Toy", "year": 2020, "url": "https://example.org/W1"}}
    errs: list[str] = []
    E._check_open_problem_items([good], "x", errs)
    assert errs == []
    bad_long = {**good, "sentence": "x" * 500}
    bad_link = {**good, "paper": {**good["paper"], "url": ""}}
    bad_type = {**good, "type": "opinion"}
    errs = []
    E._check_open_problem_items([bad_long, bad_link, bad_type], "x", errs)
    assert len(errs) == 3
    payload = {"placeholder": False, "synthetic": False, "concept_options": [], "rates_by_year": [],
               "items": [good]}  # no attribution / quality label
    errs = []
    E.check_contract("open-problems.json", payload, errs)
    assert any("attribution" in e for e in errs)


def test_a_one_sentence_abstract_is_never_quoted_whole():
    whole = "How this synthetic toy method behaves on very large inputs remains an open question for the field."
    assert op.classify(whole) == ("open_problem", 0.8)  # it would match on its own ...
    assert op.hits_in(whole) == []  # ... but it is the complete abstract, so it is dropped
    assert [h[0] for h in op.hits_in("A short synthetic intro sentence here. " + whole)] == [whole]


def test_validator_checks_quoted_sentences_on_every_concept_entry_not_only_the_first_200():
    from whitespace.pipeline import export_all as E

    def entry(sentence=None):
        e = {"placeholder": False, "synthetic": False, "counts_by_year": [], "forecast": None, "top_papers": [],
             "neighbours": [], "open_problems": []}
        if sentence:
            e["open_problems"] = [{"sentence": sentence, "type": "open_problem", "confidence": 0.8, "concept_ids": [],
                                   "paper": {"id": "W1", "title": "Toy", "year": 2020, "url": "https://example.org/W1"}}]
        return e

    entries = {f"c{i}": entry() for i in range(250)}
    entries["c250"] = entry("x" * 401)  # 401 characters: over the cap, and under the generic 800-character guard
    errs: list[str] = []
    E.check_contract("concepts.json", {"entries": entries}, errs)
    assert any("c250" in e and "sentence" in e for e in errs)


# ---- attach to an existing export (issue #278) ------------------------------------------------------------

import shutil  # noqa: E402
from pathlib import Path  # noqa: E402

import pytest  # noqa: E402

DATA = Path(__file__).resolve().parents[1] / "web" / "public" / "data"


def _cache(tmp_path, pairs):
    """A synthetic extractor cache (invented sentences) with hits on the given gap concepts."""
    hits = []
    for n, (a, b) in enumerate(pairs):
        for k in range(3):
            hits.append(_hit(100 * n + k, [a, b], conf=0.8 - 0.1 * k, year=2020 + k))
    cache = tmp_path / "cache"
    cache.mkdir()
    (cache / "hits.jsonl").write_text("\n".join(json.dumps(h) for h in reversed(hits)) + "\n", encoding="utf-8")
    (cache / "counts.json").write_text(json.dumps({"columns": [], "rows": [["", 2022, 100, 10, 5]]}), encoding="utf-8")
    return cache


@pytest.mark.skipif(not (DATA / "manifest.json").is_file(), reason="no committed export to attach to")
def test_attach_fills_the_export_validates_and_is_deterministic(tmp_path):
    gaps = json.loads((DATA / "gaps.json").read_text(encoding="utf-8"))
    if gaps.get("placeholder"):
        pytest.skip("committed export is a placeholder")
    pairs = [(g["a"], g["b"]) for g in gaps["items"][:2]]
    cache = _cache(tmp_path, pairs)
    outs = []
    for name in ("one", "two"):
        out = tmp_path / name
        res = op.attach(DATA, cache, out)
        assert res["problems"] == [] and res["items"] > 0
        outs.append(out)
    for n in ("open-problems.json", "gap-details.json", "concepts.json", "manifest.json"):
        assert (outs[0] / n).read_bytes() == (outs[1] / n).read_bytes(), n  # deterministic, independent of hit order
    f = json.loads((outs[0] / "open-problems.json").read_text(encoding="utf-8"))
    assert f["placeholder"] is False and f["quality"] == "unmeasured" and f["attribution"] == op.ATTRIBUTION
    gd = json.loads((outs[0] / "gap-details.json").read_text(encoding="utf-8"))["entries"]
    first = gd[f"{pairs[0][0]}|{pairs[0][1]}"]["open_problems"]  # hits on both concepts come first (pairs can share one)
    assert len(first) >= 3 and all(set(pairs[0]) <= set(x["concept_ids"]) for x in first[:3])
    man = json.loads((outs[0] / "manifest.json").read_text(encoding="utf-8"))
    assert man["export"]["open_problems"]["post_process"] == "open_problems attach"
    import hashlib
    for n in ("open-problems.json", "gap-details.json", "concepts.json", "meta.json", "routes.json"):
        assert man["files"][n] == hashlib.sha256((outs[0] / n).read_bytes()).hexdigest(), n
    assert json.loads((DATA / "open-problems.json").read_text(encoding="utf-8")) == json.loads(
        (DATA / "open-problems.json").read_text(encoding="utf-8"))  # the source folder is untouched
    assert op.ATTRIBUTION.startswith("Short excerpts quoted from abstracts indexed by OpenAlex")
    assert "No full abstracts are included" in op.ATTRIBUTION


@pytest.mark.skipif(not (DATA / "manifest.json").is_file(), reason="no committed export to attach to")
def test_attach_refuses_a_folder_that_is_not_an_export_and_a_cache_that_breaks_validation(tmp_path):
    with pytest.raises(op.AttachError):
        op.attach(tmp_path, tmp_path / "nothing")
    gaps = json.loads((DATA / "gaps.json").read_text(encoding="utf-8"))
    if gaps.get("placeholder"):
        pytest.skip("committed export is a placeholder")
    a, b = gaps["items"][0]["a"], gaps["items"][0]["b"]
    cache = _cache(tmp_path, [(a, b)])
    bad = [json.loads(line) for line in (cache / "hits.jsonl").read_text(encoding="utf-8").splitlines()]
    bad[0]["sentence"] = "x" * 700  # longer than a quote may be: the validator must stop it
    (cache / "hits.jsonl").write_text("\n".join(json.dumps(h) for h in bad) + "\n", encoding="utf-8")
    with pytest.raises(op.AttachError):
        op.attach(DATA, cache, tmp_path / "out")


def test_cli_extract_still_accepts_the_old_positional_form(tmp_path):
    corpus = tmp_path / "c.jsonl"
    corpus.write_text(_line(1, 2020, "We study toy graphs in depth here. Their behaviour remains unexplored today.") + "\n",
                      encoding="utf-8")
    vocab = tmp_path / "v.json"
    vocab.write_text(json.dumps(["toy graph"]), encoding="utf-8")
    out = tmp_path / "o"
    assert op.main([str(corpus), "--vocabulary", str(vocab), "--out", str(out), "--workers", "1"]) == 0
    assert (out / "hits.jsonl").is_file() and (out / "label_frame.json").is_file()


def test_wilson_interval_and_label_stats_count_unsure_as_not_correct():
    lo, hi = op.wilson(50, 100)
    assert 0.40 < lo < 0.41 and 0.59 < hi < 0.60
    assert op.wilson(0, 0) == (0.0, 1.0)
    frame = [{"i": i, "type": t} for i, t in enumerate(["open_problem"] * 4 + ["future_work"] * 4 + ["limitation"] * 2, 1)]
    st = op.label_stats(frame, {"correct": [1, 2, 5], "incorrect": [3], "unsure": [4, 6]})
    assert st["overall"]["correct"] == 3 and st["overall"]["n"] == 10 and st["unsure"] == 2
    assert st["by_type"]["open_problem"]["correct"] == 2 and st["by_type"]["limitation"]["correct"] == 0
    assert st["wording"] == "AI-labelled precision 3/10 (not human-validated)"


@pytest.mark.skipif(not (DATA / "manifest.json").is_file(), reason="no committed export to attach to")
def test_attach_with_labels_writes_the_measured_wording_and_still_validates(tmp_path):
    gaps = json.loads((DATA / "gaps.json").read_text(encoding="utf-8"))
    if gaps.get("placeholder"):
        pytest.skip("committed export is a placeholder")
    cache = _cache(tmp_path, [(gaps["items"][0]["a"], gaps["items"][0]["b"])])
    frame = [{"i": i, "type": ["open_problem", "future_work", "limitation"][i % 3]} for i in range(1, 11)]
    (tmp_path / "frame.json").write_text(json.dumps(frame), encoding="utf-8")
    (tmp_path / "labels.json").write_text(json.dumps({"correct": [1, 2, 3, 4, 5, 6], "incorrect": [7, 8], "unsure": [9, 10]}),
                                          encoding="utf-8")
    res = op.attach(DATA, cache, tmp_path / "out", frame=tmp_path / "frame.json", labels=tmp_path / "labels.json")
    assert res["problems"] == []
    f = json.loads((tmp_path / "out" / "open-problems.json").read_text(encoding="utf-8"))
    assert f["quality"] == "ai_labelled" and f["note"].startswith("AI-labelled precision 6/10 (not human-validated)")
    meta = json.loads((tmp_path / "out" / "meta.json").read_text(encoding="utf-8"))
    assert meta["open_problems"]["quality"] == "ai_labelled"
    with pytest.raises(op.AttachError):
        op.attach(DATA, cache, tmp_path / "out2", labels=tmp_path / "labels.json")  # labels without their frame


def test_trigger_phrases_get_no_rate_and_other_concepts_do():
    for c in ("future work", "open problem", "open question", "future research direction", "unclear", "research direction"):
        assert op.is_trigger_phrase(c), c
    for c in ("covid", "pretrained language model", "open source", "reinforcement learning"):
        assert not op.is_trigger_phrase(c), c
    hits = [_hit(1, ["a"])]
    counts = {("", 2022): (100, 10), ("a", 2022): (40, 8), ("future work", 2022): (40, 30), ("few", 2022): (5, 1)}
    out = op.build_export(hits, counts, [("a", "few")], ["a", "future work", "few"], lambda i: f"https://example.org/{i}", 2022)
    assert out["gap_rates"] == {"a": 0.2}  # trigger phrase and the concept with under 30 papers have no rate


@pytest.mark.skipif(not (DATA / "manifest.json").is_file(), reason="no committed export to attach to")
def test_attach_fills_display_only_rates_and_leaves_the_gap_score_untouched(tmp_path):
    gaps = json.loads((DATA / "gaps.json").read_text(encoding="utf-8"))
    if gaps.get("placeholder"):
        pytest.skip("committed export is a placeholder")
    a, b = gaps["items"][0]["a"], gaps["items"][0]["b"]
    cache = _cache(tmp_path, [(a, b)])
    # synthetic per-year counts: concept a has 40 papers in 2023 (8 with a stated problem), b has 20 (1)
    final = json.loads((DATA / "meta.json").read_text(encoding="utf-8"))["year_range"]["max"]
    rows = [["", final, 1000, 100], [a, final, 40, 8], [b, final, 20, 1], [a, final + 1, 10, 10]]
    (cache / "counts.json").write_text(json.dumps({"columns": [], "rows": rows}), encoding="utf-8")
    res = op.attach(DATA, cache, tmp_path / "out")
    assert res["problems"] == []
    after = json.loads((tmp_path / "out" / "gaps.json").read_text(encoding="utf-8"))
    for x, y in zip(gaps["items"], after["items"]):
        for k in ("gap_score", "factors", "rank", "p_link", "momentum", "novelty"):
            assert x[k] == y[k], k  # the ranking is not touched
    assert after["formula_used"] == gaps["formula_used"]
    first = after["items"][0]
    assert first["gap_rate_a"] == 0.2  # 8 of 40 up to the snapshot year; the later year (final + 1) is not counted
    assert first["gap_rate_b"] is None and first["gap_rate"] is None  # b has under 30 papers: null, never 0
    assert any("display only" in x for x in after["omitted_components"])
    c = json.loads((tmp_path / "out" / "concepts.json").read_text(encoding="utf-8"))["entries"]
    if a in c:
        assert c[a]["gap_rate"] == 0.2
    op_file = json.loads((tmp_path / "out" / "open-problems.json").read_text(encoding="utf-8"))
    assert op_file["rates_by_concept"][a][0] == {"year": final, "concept_rate": 0.2, "ai_ml_rate": 0.1, "papers": 40,
                                                 "with_open_problem": 8}


def test_types_filter_keeps_only_the_chosen_statement_types():
    hits = [_hit(1, ["a"], kind="open_problem"), _hit(2, ["a"], kind="future_work"), _hit(3, ["a"], kind="limitation")]
    counts = {("", 2022): (100, 10, 5), ("a", 2022): (40, 8, 4)}
    out = op.build_export(hits, counts, [("a", "a")], ["a"], lambda i: f"https://example.org/{i}", 2022, types=("open_problem",))
    assert out["gap_rates"] == {"a": 0.1}  # rates count papers with an open_problem statement only (4 of 40)
    assert {i["type"] for i in out["file"]["items"]} == {"open_problem"}
    with pytest.raises(ValueError):
        op.build_export(hits, counts, [("a", "a")], ["a"], lambda i: i, 2022, types=("open_problem", "limitation"))
    assert {i["type"] for v in out["concepts"].values() for i in v} == {"open_problem"}
