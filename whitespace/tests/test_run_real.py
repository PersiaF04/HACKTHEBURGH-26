"""Tests for the real-data run script (issue #164), on tiny synthetic jsonl corpora in the ingest's
format (made-up words; no real data and no network)."""
import json
import logging

import pytest

from whitespace.pipeline import run_real as R
from whitespace.pipeline.backtest import HEADLINE, OneShotError, is_real_run
from whitespace.pipeline.run_real import RunConfig, RunError

CFG = RunConfig(fit_origins=(2010, 2011), calibration_origins=(2014,), test_origins=(2017,),
                n_min=5, max_concepts=40, ceiling_fraction=1.0, n_boot=10)
SECRET = "qzxsentinelabstract"


@pytest.fixture()
def corpus(tmp_path):
    path = tmp_path / "corpus.jsonl"
    R.write_synthetic_corpus(path)
    return path


def rewrite_after(src, dst, year):
    """Copy ``src`` rewriting the text of every work dated after ``year`` with different words."""
    with open(src, encoding="utf-8") as f, open(dst, "w", encoding="utf-8") as g:
        for line in f:
            rec = json.loads(line)
            if rec["year"] > year:
                rec["title"] = rec["abstract"] = "zorpel. quinx. vaxul. " * 3
            g.write(json.dumps(rec, sort_keys=True) + "\n")


def vocab(out, origin):
    return json.loads((R.origin_dir(out, origin) / "vocabulary.json").read_text())


def test_dry_run_end_to_end(tmp_path, caplog):
    out = tmp_path / "out"
    with caplog.at_level(logging.INFO):
        assert R.main(["--dry-run", "--out", str(out)]) == 0
    manifest = json.loads((out / "run_manifest.json").read_text())
    assert manifest["status"] == "complete" and manifest["dry_run"] is True
    assert set(manifest["vocabulary_sizes"]) == {"2010", "2011", "2014", "2017"}
    for key in ("config_hash", "seed", "code_commit", "libraries", "stages", "peak_memory_mb"):
        assert key in manifest
    assert manifest["corpus"]["sha256"] and "2020" in manifest["corpus"]["per_year"]
    metrics = json.loads((out / "metrics.json").read_text())
    assert metrics["manifest"]["data_label"] == "synthetic" and not is_real_run(metrics["manifest"])
    assert manifest["data_label"] == "synthetic" and manifest["generator"] and not is_real_run(manifest)
    assert "synthetic" in manifest["corpus_description"]
    assert set(metrics["manifest"]["n_works"]) == {"2010", "2011", "2014", "2017"}
    assert "2017" in metrics["test"]
    assert any("stage backtest" in r.message for r in caplog.records)


def test_corpus_passed_as_real_is_labelled_real(tmp_path, corpus):
    # Only exercises the label path: the file is the synthetic corpus, run as a non-dry-run
    # ("real") corpus. It says nothing about real data.
    out = tmp_path / "out"
    manifest = R.run(corpus, out, CFG)
    assert manifest["data_label"] == "real" and manifest["generator"] is None and is_real_run(manifest)
    on_disk = json.loads((out / "run_manifest.json").read_text())
    assert is_real_run(on_disk) and "corpus_description" in on_disk
    metrics = json.loads((out / "metrics.json").read_text())
    assert metrics["manifest"]["data_label"] == "real" and is_real_run(metrics["manifest"])
    assert metrics["headline"] == HEADLINE  # pre-registered headline untouched


def test_one_shot_guard_survives_rerun_and_cache_is_reused(tmp_path, corpus):
    out = tmp_path / "out"
    first = R.run(corpus, out, CFG)
    assert {r["cache"] for r in first["origins"].values()} == {"built"}
    with pytest.raises(OneShotError):
        R.run(corpus, out, CFG)  # same configuration: the test origin was already scored
    again = R.run(corpus, out, CFG, override_one_shot=True)
    assert {r["cache"] for r in again["origins"].values()} == {"hit"}  # nothing recounted
    assert again["one_shot_override_used"] is True


def test_vocabulary_at_origin_ignores_later_works(tmp_path, corpus):
    """Poison test through the whole pipeline: rewrite every work after the origin."""
    poisoned = tmp_path / "poisoned.jsonl"
    rewrite_after(corpus, poisoned, 2010)
    a, b = tmp_path / "a", tmp_path / "b"
    R.run(corpus, a, CFG, caches_only=True, origins=[2010])
    R.run(poisoned, b, CFG, caches_only=True, origins=[2010])
    assert vocab(a, 2010) == vocab(b, 2010) and len(vocab(a, 2010)) > 1
    # works dated <= 2010 get identical concepts; later ones are assigned from vocabulary 2010 only
    wa, wb = R.load_works(a, 2010), R.load_works(b, 2010)
    assert [w for w in wa if w.date.year <= 2010] == [w for w in wb if w.date.year <= 2010]
    assert all(set(w.concepts) <= set(vocab(b, 2010)) for w in wb)
    assert max(w.date.year for w in wa) == 2013  # origin + horizon


def test_each_origin_has_its_own_vocabulary(tmp_path):
    """Words that only start appearing in 2012 enter vocabulary 2012 but not vocabulary 2010."""
    path = tmp_path / "c.jsonl"
    with open(path, "w", encoding="utf-8") as f:
        for year in range(2010, 2016):
            for k in range(40):
                words = ["oldword", "otherword"] + (["newword"] if year >= 2012 else [])
                text = ". ".join(words) + "."
                f.write(json.dumps({"id": f"{year}-{k}", "date": f"{year}-03-01", "year": year,
                                    "title": text, "abstract": text}) + "\n")
    cfg = RunConfig((2010,), (2013,), (2016,), n_min=5, max_concepts=10, ceiling_fraction=1.0)
    out = tmp_path / "o"
    R.run(path, out, cfg, caches_only=True, origins=[2010, 2013])
    assert "newword" not in vocab(out, 2010) and "newword" in vocab(out, 2013)
    assert all("newword" not in w.concepts for w in R.load_works(out, 2010))  # even for works to 2013


def test_too_few_works_is_reported_not_skipped(tmp_path, corpus):
    cfg = RunConfig((2010, 2011), (2014,), (2017,), n_min=400, max_concepts=40, ceiling_fraction=1.0)
    out = tmp_path / "out"
    with pytest.raises(RunError, match="2010 .*too_few_works"):
        R.run(corpus, out, cfg)
    manifest = json.loads((out / "run_manifest.json").read_text())
    assert manifest["status"] == "failed" and "too_few_works" in manifest["error"]


def test_missing_year_fails_early(tmp_path, corpus):
    cfg = RunConfig((2010, 2011), (2014,), (2019,), n_min=5, max_concepts=40, ceiling_fraction=1.0)
    with pytest.raises(RunError, match=r"no works in year\(s\) \[2021, 2022\]"):
        R.run(corpus, tmp_path / "out", cfg)  # corpus ends in 2020; origin 2019 needs through 2022
    assert not (tmp_path / "out" / "cache").exists()  # failed before any counting


def test_purge_failure_is_a_clear_error(tmp_path, corpus):
    cfg = RunConfig((2010, 2012), (2014,), (2017,), n_min=5)
    with pytest.raises(RunError, match="purge check failed"):
        R.run(corpus, tmp_path / "out", cfg)


def test_malformed_and_missing_corpus(tmp_path):
    with pytest.raises(RunError, match="not found"):
        R.run(tmp_path / "nope.jsonl", tmp_path / "o", CFG)
    bad = tmp_path / "bad.jsonl"
    bad.write_text('{"id": "x"}\n', encoding="utf-8")
    with pytest.raises(RunError, match="line 1"):
        R.run(bad, tmp_path / "o2", CFG)


def test_no_abstract_text_in_outputs_or_logs(tmp_path, caplog):
    path = tmp_path / "c.jsonl"
    R.write_synthetic_corpus(path)
    with open(path, "a", encoding="utf-8") as f:  # one work whose text must never surface
        f.write(json.dumps({"id": "secret", "date": "2010-05-01", "year": 2010,
                            "title": SECRET, "abstract": f"{SECRET} private text"}) + "\n")
    out = tmp_path / "out"
    with caplog.at_level(logging.DEBUG):
        R.run(path, out, CFG)
    for file in out.rglob("*"):
        if file.is_file() and file.name != "corpus.jsonl":
            assert SECRET not in file.read_text(encoding="utf-8"), file.name
    assert SECRET not in caplog.text
