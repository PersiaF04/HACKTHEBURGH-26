"""Offline tests for the code layer (issue #142). Tiny CSV fixture, canned OpenAlex responses."""
import datetime as dt
import hashlib

import pytest

from whitespace.pipeline import code_layer as cl

CSV = (
    ",".join(cl.PWC_COLUMNS) + "\n"
    "u1,Paper A,1706.03762v5,a,p,https://github.com/x/a,True,True,True,tf\n"
    "u2,Paper A again,arXiv:1706.03762,a,p,https://github.com/y/a,False,True,True,pt\n"
    "u3,Paper B,2101.00001,a,p,https://github.com/x/b,True,True,True,pt\n"
    "u4,Paper C,,a,p,https://github.com/x/c,True,True,True,pt\n"
)


def test_loader_manifest(tmp_path):
    path = tmp_path / "links.csv"
    path.write_bytes(CSV.encode())
    rows, manifest = cl.load_links(str(path), "abc123")
    assert len(rows) == 4
    assert manifest["rows"] == 4 and manifest["distinct_arxiv_ids"] == 2
    assert manifest["rows_without_arxiv_id"] == 1
    assert manifest["dataset_revision"] == "abc123"
    assert manifest["file_sha256"] == hashlib.sha256(CSV.encode()).hexdigest()
    assert manifest["licence"] == "cc-by-sa-4.0" and manifest["attribution"]
    assert cl.linked_ids(rows) == {"1706.03762", "2101.00001"}


def test_id_extraction_edge_cases():
    assert cl.arxiv_id_from_url("https://arxiv.org/abs/1706.03762v7") == "1706.03762"
    assert cl.arxiv_id_from_url("http://arxiv.org/pdf/1706.03762v1.pdf") == "1706.03762"
    assert cl.arxiv_id_from_url("https://example.org/abs/1706.03762") is None
    assert cl.arxiv_id_from_url(None) is None
    assert cl.arxiv_id_from_doi("https://doi.org/10.48550/arXiv.2101.00001") == "2101.00001"
    assert cl.arxiv_id_from_doi("https://doi.org/10.1109/CVPR.2016.91") is None


def test_filter_urls_batch_at_50():
    ids = [f"2101.{n:05d}" for n in range(120)] + ["ARXIV:2101.00000v2"]  # one duplicate
    urls = cl.openalex_filter_urls(ids, mailto="a@b.org")
    assert len(urls) == 3
    counts = [u.split("filter=doi:")[1].split("&")[0].count("10.48550/arxiv.") for u in urls]
    assert counts == [50, 50, 20]
    assert "filter=doi:https://doi.org/10.48550/arxiv.2101.00000|" in urls[0]
    assert "mailto=a%40b.org" in urls[0]
    with pytest.raises(ValueError):
        cl.openalex_filter_urls(ids, batch_size=51)


def _work(wid, doi, cites, landing=None, title="T"):
    locs = [{"landing_page_url": landing}] if landing else [{"landing_page_url": "https://journal.org/x"}]
    return {"id": wid, "doi": doi, "title": title, "publication_date": "2017-06-12",
            "cited_by_count": cites, "locations": locs}


def test_merged_record_maps_through_locations_not_own_doi():
    merged = _work("W1", "https://doi.org/10.1109/CVPR.2016.91", 5, "https://arxiv.org/abs/1506.02640v3")
    assert cl.work_arxiv_id(merged) == ("1506.02640", cl.JOIN_MERGED)
    direct = _work("W2", "https://doi.org/10.48550/arXiv.2101.00001", 1)
    assert cl.work_arxiv_id(direct) == ("2101.00001", cl.JOIN_DOI)
    journal_only = _work("W3", "https://doi.org/10.1109/CVPR.2016.91", 1)
    assert cl.work_arxiv_id(journal_only) is None


def test_resolve_collapses_duplicates_prefers_most_cited():
    preprint = _work("W10", "https://doi.org/10.48550/arXiv.1706.03762", 3)
    journal = _work("W11", "https://doi.org/10.5555/x", 900, "https://arxiv.org/abs/1706.03762")
    other = _work("W12", "https://doi.org/10.48550/arXiv.9999.99999", 1)  # not requested
    calls = []

    def fetch(url):
        calls.append(url)
        return {"results": [preprint, journal, other]}

    out = cl.resolve_arxiv_ids(["1706.03762", "2101.00001"], fetch)
    assert out["requests"] == 1 == len(calls)
    assert out["resolved"]["1706.03762"]["oa_work_id"] == "W11"
    assert out["resolved"]["1706.03762"]["join_method"] == cl.JOIN_MERGED
    assert out["unresolved"] == ["2101.00001"]


def test_coverage_states_and_year_maths():
    rows = [{"paper_arxiv_id": f"{yy}01.{n:05d}"} for yy, k in ((14, 3), (18, 5), (25, 4)) for n in range(k)]
    counts = cl.archive_year_counts(rows)
    assert counts == {2014: 3, 2018: 5, 2025: 4}
    cov = cl.archive_coverage_states(counts, min_linked=4, years=[2014, 2018, 2025, 2026])
    assert cov["cutoff_year"] == 2018
    assert cov["states"] == {2014: "grey", 2018: "ok", 2025: "ok", 2026: "grey"}
    assert cl.archive_coverage_states(counts, min_linked=99)["cutoff_year"] is None


def test_coverage_table():
    linked = {"1801.00000", "1801.00001"}
    papers = [
        {"concepts": ("x", "y"), "arxiv_id": "1801.00000v1"},
        {"concepts": ("x",), "arxiv_id": "1801.00009"},
        {"concepts": ("x",), "arxiv_id": None, "fallback_date": dt.date(2018, 5, 1)},
        {"concepts": ("x",), "arxiv_id": None},
        {"concepts": ("x",), "arxiv_id": "1401.00001"},
    ]
    out = cl.coverage_table(papers, linked, {2014: 3, 2018: 5}, min_linked=4)
    table = {(r["concept"], r["year"]): r for r in out["rows"]}
    r = table[("x", 2018)]
    assert (r["linked"], r["papers"], r["non_arxiv_papers"]) == (1, 3, 1)
    assert r["code_rate"] == pytest.approx(1 / 3) and r["unmatchable_by_construction"]
    assert r["coverage_state"] == "ok"
    assert table[("y", 2018)]["code_rate"] == 1.0
    assert table[("x", 2014)]["coverage_state"] == "grey"
    assert out["undated"] == 1 and out["cutoff_year"] == 2018


@pytest.mark.parametrize(
    "k,n,lo,hi",
    [(95, 100, 0.8882, 0.9785), (100, 100, 0.963, 1.0), (0, 100, 0.0, 0.037),
     (50, 100, 0.4038, 0.5962), (18, 20, 0.699, 0.9721)],
)
def test_wilson(k, n, lo, hi):
    got = cl.wilson_interval(k, n)
    assert got[0] == pytest.approx(lo, abs=6e-4) and got[1] == pytest.approx(hi, abs=6e-4)


def _pairs():
    out = []
    for i in range(400):
        year = 2012 + i % 14
        out.append({"pwc_arxiv_id": f"{str(year)[2:]}01.{i:05d}", "pwc_year": year, "oa_work_id": f"W{i}",
                    "join_method": cl.JOIN_METHODS[i % 3], "code_link_present": i % 2 == 0})
    return out


def test_frame_reproducible_and_stratified():
    a = cl.build_frame(_pairs(), n=100, seed=7)
    b = cl.build_frame(list(reversed(_pairs())), n=100, seed=7)
    assert a == b and len(a) == 100
    assert a != cl.build_frame(_pairs(), n=100, seed=8)
    assert [r["row_id"] for r in a] == list(range(1, 101))
    assert set(a[0]) == set(cl.TEMPLATE_COLUMNS)
    assert {r["stratum"].split("|")[0] for r in a} == set(cl.YEAR_BANDS)
    assert len({r["pwc_arxiv_id"] for r in a}) == 100
    assert len(cl.build_frame(_pairs()[:10], n=100)) == 10


def test_draw_sample_reproducible():
    rows = [{"paper_arxiv_id": f"{yy}01.{n:05d}"} for yy in (15, 19, 22, 24) for n in range(30)]
    a, b = cl.draw_sample(rows, seed=1, per_band=10), cl.draw_sample(rows, seed=1, per_band=10)
    assert a == b and len(a) == 40
