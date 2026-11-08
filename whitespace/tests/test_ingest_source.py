"""arxiv_id_source on corpus records (offline, canned works)."""
import json

from whitespace.pipeline import ingest
from whitespace.tests.test_ingest import W1, paged_fetch, work

DOI = "https://doi.org/10.48550/arXiv.2001.00001"


def rec(**kw):
    return ingest.to_record(work(1, **kw))


def test_doi_only():
    r = rec(doi=DOI, typ="preprint")
    assert (r["arxiv_id"], r["arxiv_id_source"], r["arxiv_id_source_conflict"]) == ("2001.00001", "doi", False)


def test_location_only_even_for_preprint_type():
    r = rec(arxiv="2002.00002", typ="preprint")
    assert (r["arxiv_id"], r["arxiv_id_source"], r["arxiv_id_source_conflict"]) == ("2002.00002", "location", False)


def test_both_agree():
    r = rec(doi=DOI, arxiv="2001.00001")
    assert (r["arxiv_id"], r["arxiv_id_source"], r["arxiv_id_source_conflict"]) == ("2001.00001", "both", False)


def test_none():
    r = rec()
    assert (r["arxiv_id"], r["arxiv_id_source"], r["arxiv_id_source_conflict"]) == (None, None, False)


def test_conflict_keeps_doi():
    r = rec(doi=DOI, arxiv="2003.00003")
    assert (r["arxiv_id"], r["arxiv_id_source"], r["arxiv_id_source_conflict"]) == ("2001.00001", "doi", True)


def test_built_corpus_carries_field(tmp_path):
    ingest.download(paged_fetch({"2010-01-01": [[work(1, arxiv="1001.0001")]]}), [W1], tmp_path, 5)
    ingest.build_corpus(tmp_path, "2026-11-08")
    row = json.loads((tmp_path / "corpus.jsonl").read_text().splitlines()[0])
    assert row["arxiv_id_source"] == "location" and row["arxiv_id_source_conflict"] is False
