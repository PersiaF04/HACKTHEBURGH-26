"""Offline tests for the local Papers with Code join (issue #173). Tiny fixtures, no network."""
import csv
import json
import socket

import pytest

from whitespace.pipeline import code_join_local as cj
from whitespace.pipeline import code_layer as cl

SECRET = "SECRETABSTRACTWORDS"
LINKS = (
    ",".join(cl.PWC_COLUMNS) + "\n"
    "u1,Paper A,1706.03762v5,a,p,https://github.com/x/a,False,True,True,tf\n"
    "u2,Paper A again,arXiv:1706.03762,a,p,https://github.com/y/a,True,True,True,pt\n"
    "u3,Paper B,2101.00001,a,p,https://github.com/x/b,False,True,True,pt\n"
    "u4,Old paper,hep-th/9901001v2,a,p,https://github.com/x/o,True,True,True,pt\n"
    "u5,No id,,a,p,https://github.com/x/c,True,True,True,pt\n"
    "u6,Not in corpus,2201.99999,a,p,https://github.com/x/z,True,True,True,pt\n"
)


def _rec(i, arxiv, year, typ="preprint", topic="T1", date=None, src="doi"):
    return {"arxiv_id_source": src if arxiv else None, "id": f"W{i}", "arxiv_id": arxiv, "year": year, "date": date or f"{year}-01-01",
            "title": f"Title {i}", "abstract": SECRET, "cites": 1, "keywords": [], "topic_id": topic,
            "type": typ}


CORPUS = [
    _rec(1, "1706.03762", 2017, date="2017-06-01"),           # version-less match, two PwC rows
    _rec(2, "2101.00001", 2021, typ="article", date="2021-01-01", src="location"),  # merged record, unofficial
    _rec(3, "hep-th/9901001", 1999, typ="article", date="1999-03-05", src="both"),  # old-style id, official
    _rec(4, None, 2020, typ="article"),                          # no arXiv id
    _rec(5, "2105.00002", 2021, date="2021-05-01"),             # arXiv id, no PwC row
]


@pytest.fixture
def files(tmp_path):
    links = tmp_path / "links.csv"
    links.write_text(LINKS, encoding="utf-8")
    corpus = tmp_path / "corpus.jsonl"
    corpus.write_text("".join(json.dumps(r) + "\n" for r in CORPUS), encoding="utf-8")
    return corpus, links, tmp_path / "out"


def test_index_links_normalises_and_collapses():
    rows = [dict(zip(cl.PWC_COLUMNS, line.split(","))) for line in LINKS.strip().split("\n")[1:]]
    idx = cj.index_links(rows)
    assert set(idx) == {"1706.03762", "2101.00001", "hep-th/9901001", "2201.99999"}
    assert idx["1706.03762"]["rows"] == 2 and idx["1706.03762"]["official"] is True
    assert idx["1706.03762"]["code_url"] == "https://github.com/y/a"  # official row preferred
    assert idx["2101.00001"]["official"] is False


def test_join_flags_and_methods(files):
    corpus, links, out = files
    rep = cj.run(corpus, links, "rev1", out, min_linked=1)
    with open(out / "papers.csv", newline="", encoding="utf-8") as f:
        rows = {r["id"]: r for r in csv.DictReader(f)}
    assert rows["W1"]["has_linked_code"] == "True" and rows["W1"]["has_official_code"] == "True"
    assert rows["W1"]["match_key"] == "1706.03762" and rows["W1"]["join_method"] == "doi"
    assert rows["W1"]["date_source"] == "arxiv_id_month"
    assert rows["W2"]["has_linked_code"] == "True" and rows["W2"]["has_official_code"] == "False"
    assert rows["W2"]["join_method"] == cj.JOIN_MERGED
    assert rows["W3"]["has_linked_code"] == "True" and rows["W3"]["date_source"] == "publication_date"
    assert rows["W4"]["join_method"] == cj.UNMATCHABLE and rows["W4"]["match_key"] == ""
    assert rows["W4"]["has_linked_code"] == "False"
    assert rows["W5"]["has_linked_code"] == "False" and rows["W5"]["match_key"] == "2105.00002"
    assert rep["corpus_works"] == 5 and rep["works_with_arxiv_id"] == 4
    assert rep["works_without_arxiv_id"] == 1
    assert rep["pwc_distinct_arxiv_ids"] == 4
    assert rep["pwc_ids_in_corpus"] == 3 and rep["pwc_ids_not_in_corpus"] == 1
    assert rep["linked_papers"] == 3 and rep["official_papers"] == 2
    assert rep["linked_papers_by_year"] == {"1999": 1, "2017": 1, "2021": 1}
    assert rep["works_with_arxiv_id_by_year"] == {"1999": 1, "2017": 1, "2021": 2}
    assert "expected" in rep["why_absent"]
    cov = json.loads((out / "coverage.json").read_text(encoding="utf-8"))
    assert {"rows", "cutoff_year", "year_counts"} <= set(cov)
    t1_2021 = [r for r in cov["rows"] if r["concept"] == "T1" and r["year"] == 2021][0]
    assert t1_2021["papers"] == 2 and t1_2021["linked"] == 1


def test_join_method_from_arxiv_id_source_not_type():
    # a preprint-typed work whose id came only from a location is a merged record;
    # an article-typed work with an arXiv DOI is an own record
    assert cj.join_method_of(_rec(9, "2101.00001", 2021, typ="preprint", src="location"), "2101.00001") == "location"
    assert cj.join_method_of(_rec(9, "2101.00001", 2021, typ="article", src="doi"), "2101.00001") == "doi"
    assert cj.join_method_of(_rec(9, "2101.00001", 2021, src="both"), "2101.00001") == cj.JOIN_OWN
    assert cj.join_method_of(_rec(9, None, 2021), None) == cj.UNMATCHABLE
    old = {"id": "W", "arxiv_id": "2101.00001", "type": "preprint"}  # corpus without the field
    assert cj.join_method_of(old, "2101.00001") == cj.UNKNOWN_SOURCE


def test_frame_has_abs_url_and_no_author_columns(files):
    corpus, links, out = files
    cj.run(corpus, links, "rev1", out, min_linked=1)
    with open(out / "handcheck_frame.csv", newline="", encoding="utf-8") as f:
        frame = list(csv.DictReader(f))
    assert not any("first_author" in c for c in frame[0])
    assert all(r["arxiv_abs_url"] == "https://arxiv.org/abs/" + r["pwc_arxiv_id"] for r in frame)


def test_no_abstract_text_in_any_output(files):
    corpus, links, out = files
    cj.run(corpus, links, "rev1", out, min_linked=1)
    for path in out.iterdir():
        assert SECRET not in path.read_text(encoding="utf-8"), path.name


def _big_matched(n):
    return {
        f"{1500 + i % 100:04d}.{i:05d}": {
            "pwc_title": f"P{i}", "pwc_year": 2015 + i % 11,
            "pwc_arxiv_id": f"{1500 + i % 100:04d}.{i:05d}", "pwc_code_url": f"https://g/{i}",
            "oa_work_id": f"W{i}", "oa_title": f"T{i}", "oa_doi": "", "oa_pub_date": "2020-01-01",
            "join_method": cj.JOIN_OWN if i % 2 else cj.JOIN_MERGED, "code_link_present": True,
            "arxiv_abs_url": f"https://arxiv.org/abs/{i}", "pwc_official": bool(i % 3),
        }
        for i in range(n)
    }


def test_frame_seed_reproducible_and_stratified():
    matched = _big_matched(600)
    a = cj.hand_check_frame(matched, n=100, seed=7)
    b = cj.hand_check_frame(matched, n=100, seed=7)
    c = cj.hand_check_frame(matched, n=100, seed=8)
    assert a == b and a != c
    assert len(a) == 100
    assert all(set(cl.TEMPLATE_COLUMNS) <= set(r) for r in a)
    assert {r["join_method"] for r in a} == {cj.JOIN_OWN, cj.JOIN_MERGED}  # restored, not composite
    assert {r["pwc_official"] for r in a} == {True, False}
    assert len({r["stratum"].split("|")[0] for r in a}) == 4  # all year bands represented
    assert all(r["oa_title"] for r in a)


def test_cli_files_and_frame_csv(files):
    corpus, links, out = files
    cj.run(corpus, links, "rev1", out, min_linked=1, n=100)
    with open(out / "handcheck_frame.csv", newline="", encoding="utf-8") as f:
        frame = list(csv.DictReader(f))
    assert len(frame) == 3  # only the three matched pairs exist
    assert list(frame[0]) == cj.FRAME_COLUMNS


def test_no_network(files, monkeypatch):
    def boom(*a, **k):
        raise AssertionError("network used")

    monkeypatch.setattr(socket, "socket", boom)
    corpus, links, out = files
    cj.run(corpus, links, "rev1", out, min_linked=1)
