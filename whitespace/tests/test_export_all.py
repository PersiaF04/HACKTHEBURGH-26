"""Tests for the export runner and validator (issue #175), offline, on the synthetic dry-run corpus
from ``run_real`` (made-up words; nothing here says anything about real literature)."""
import json
import shutil
from pathlib import Path

import pytest

from whitespace.pipeline import backtest
from whitespace.pipeline import export_all as E
from whitespace.pipeline import run_real as R

KW = dict(edge_threshold=0.0, max_edges=50, gap_pool=200, gap_limit=20, detail_limit=5)


@pytest.fixture(scope="module")
def dry(tmp_path_factory):
    root = tmp_path_factory.mktemp("dry")
    assert R.main(["--dry-run", "--out", str(root / "run")]) == 0
    return root / "run"


@pytest.fixture(scope="module")
def exported(dry, tmp_path_factory):
    out = tmp_path_factory.mktemp("export")
    result = E.export_run(dry, out, **KW)
    return out, result


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def test_dry_run_writes_every_file_as_a_synthetic_placeholder(exported):
    out, result = exported
    assert result["synthetic"] is True and result["problems"] == []
    assert E.validate_export(out) == []
    routes = read(out / "routes.json")
    assert routes["synthetic"] is True and routes["data_label"] == "synthetic"
    assert routes["corpus_last_year"] == 2020 and routes["map_years"] == list(range(2015, 2021))
    names = {r["file"] for r in routes["routes"]}
    assert {"meta.json", "backtest.json", "gaps.json", "gap-details.json", "concepts.json", "search.json",
            "open-problems.json"} <= names
    assert {f"map-{y}.json" for y in range(2015, 2021)} <= names
    assert {f"coverage-{y}.json" for y in range(2015, 2021)} <= names
    for r in routes["routes"]:
        assert r["status"] == "placeholder"
        payload = read(out / r["file"])
        assert payload["placeholder"] is True and payload["synthetic"] is True
        assert payload["data_label"] == "synthetic"
    manifest = read(out / "manifest.json")
    assert manifest["synthetic"] is True and manifest["export"]["path_check"]["ran"] is True
    # default production model is trained through 2020, so it is not the backtest model
    assert manifest["export"]["production_model"] == "through-2020"
    assert manifest["export"]["production_model_equals_backtest_model"] is False


def test_dry_run_files_carry_no_numbers_but_years(exported):
    out, _ = exported
    errs = []
    for path in out.glob("*.json"):
        if path.name not in ("manifest.json", "routes.json"):
            E._walk(read(path), path.name, errs, synthetic=True)
    assert errs == []
    assert read(out / "backtest.json")["hits"] == [] and read(out / "gaps.json")["items"] == []


def test_cli_runs_the_validator_and_exits_zero(dry, tmp_path, capsys):
    assert E.main([str(dry), "--out", str(tmp_path / "o")]) == 0
    assert "validation OK" in capsys.readouterr().out


def test_test_labels_are_not_read_by_the_export(dry, tmp_path, monkeypatch):
    def boom(*a, **k):
        raise AssertionError("evaluate_origin reads test labels; the export must not call it")

    monkeypatch.setattr(backtest, "evaluate_origin", boom)
    assert E.export_run(dry, tmp_path / "o", **KW)["problems"] == []


def test_real_shaped_path_validates(dry, tmp_path):
    """The production path itself (what a real run would write), built on the synthetic caches and written as
    if real, without going through the synthetic gate, to exercise the validator on populated files."""
    run = E.load_run(dry)
    years = list(range(2015, 2021))
    trained, same = E.train_production(run, "through-2020")
    assert not same
    built = E.build_real_files(run, trained, years, **{k: v for k, v in KW.items()})
    files = dict(built)
    files["backtest.json"] = E.build_backtest(run, False, None)  # placeholder: the run is synthetic
    files.update(E.build_coverage(None, {}, years, False))
    for name, why in E.STATIC_PLACEHOLDERS.items():
        files[name] = E.placeholder(name, why, False)
    for p in files.values():
        p["data_label"] = "real"
    # a populated file set must pass the contract checks
    for name, payload in files.items():
        if name != "backtest.json":
            errs = []
            E.check_contract(name, E.clean(payload), errs)
            assert errs == [], (name, errs)
    gaps = files["gaps.json"]
    assert gaps["kind"] == "production_forecast" and gaps["held_out_test"] is False
    assert "not the held-out test" in gaps["label"] and gaps["trained_on"]["held_out_tested"] is False
    assert gaps["snapshot_year"] == 2020 and gaps["items"]
    assert files["concepts.json"]["entries"] and files["gap-details.json"]["entries"]
    meta = files["meta.json"]
    assert meta["year_range"] == {"min": 2015, "max": 2020} and "absent, not zero" in meta["corpus"]["note"]
    # each year's map uses only that year's works: no concept count can exceed the works up to that year
    assert files["map-2015.json"]["layout_year"] == 2015
    out = tmp_path / "real"
    out.mkdir()
    for name, payload in files.items():
        E.write_payload(out, name, payload, synthetic=False)
    routes = E.build_routes(files, years, False, 2020)
    routes["data_label"] = "real"
    (out / "routes.json").write_text(json.dumps(routes), encoding="utf-8")
    (out / "manifest.json").write_text(json.dumps({"synthetic": False}), encoding="utf-8")
    problems = E.validate_export(out)
    assert [p for p in problems if "backtest.json" not in p] == []


def test_map_years_never_show_later_knowledge(dry):
    run = E.load_run(dry)
    trained, _ = E.train_frozen(run)
    built = E.build_real_files(run, trained, [2015, 2016], **KW)
    m15 = built["map-2015.json"]
    assert m15["year"] == 2015 and m15["concepts"]
    from whitespace.pipeline.export_map_gaps import visible_works
    n15 = len(visible_works(R.load_works(dry, 2015), 2015))
    assert max(c["paper_count"] for c in m15["concepts"]) <= n15
    assert max(c["papers_cumulative"] for c in built["map-2016.json"]["concepts"]) > max(
        c["papers_cumulative"] for c in m15["concepts"])


def test_writer_refuses_non_placeholders_for_a_synthetic_run(tmp_path):
    real_shaped = {"placeholder": False, "synthetic": False, "items": []}
    with pytest.raises(E.ExportError):
        E.write_payload(tmp_path, "gaps.json", real_shaped, synthetic=True)
    with pytest.raises(E.ExportError):
        E.write_payload(tmp_path, "gaps.json", {"placeholder": True, "synthetic": False}, synthetic=True)
    with pytest.raises(E.ExportError):
        E.write_payload(tmp_path, "gaps.json", {"placeholder": False, "synthetic": True}, synthetic=False)


def test_only_is_real_run_decides(dry):
    run = E.load_run(dry)
    assert E.synthetic_reasons(run)  # label synthetic
    for label in ("unlabelled", "real OpenAlex corpus", None):
        r = E.Run(run.dir, run.manifest, {**run.metrics, "manifest": {"data_label": label}}, {}, run.config)
        assert E.synthetic_reasons(r)
    real = {**run.metrics, "manifest": {"data_label": "real"}}
    assert E.synthetic_reasons(E.Run(run.dir, {**run.manifest, "dry_run": False, "data_label": "real", "generator": None}, real, {}, run.config)) == []
    assert E.synthetic_reasons(E.Run(run.dir, {**run.manifest, "dry_run": True, "data_label": "real", "generator": None}, real, {}, run.config))
    gen = {**run.metrics, "manifest": {"data_label": "real", "generator": {"n_works": 1}}}
    assert E.synthetic_reasons(E.Run(run.dir, {**run.manifest, "dry_run": False, "data_label": "real", "generator": None}, gen, {}, run.config))


# ------------------------------------------------------------------ validator failures


@pytest.fixture()
def copy_of_export(exported, tmp_path):
    out = tmp_path / "copy"
    shutil.copytree(exported[0], out)
    return out


def edit(path, fn):
    data = read(path)
    fn(data)
    path.write_text(json.dumps(data), encoding="utf-8")


def test_validator_missing_route_file(copy_of_export):
    (copy_of_export / "map-2016.json").unlink()
    assert any("map-2016.json" in p and "does not exist" in p for p in E.validate_export(copy_of_export))


def test_validator_nan(copy_of_export):
    path = copy_of_export / "meta.json"
    path.write_text(path.read_text().replace('"counts": {}', '"counts": {"works": NaN}'), encoding="utf-8")
    assert any("meta.json" in p and "invalid JSON" in p for p in E.validate_export(copy_of_export))


def test_validator_wrong_key(copy_of_export):
    edit(copy_of_export / "gaps.json", lambda d: d.pop("items"))
    assert any("gaps.json" in p and "items" in p for p in E.validate_export(copy_of_export))


def test_validator_abstract_key_and_long_text(copy_of_export):
    edit(copy_of_export / "search.json", lambda d: d["papers"].append({"id": "x", "abstract": "y"}))
    edit(copy_of_export / "open-problems.json", lambda d: d.update(note="w " * 500))
    problems = E.validate_export(copy_of_export)
    assert any("forbidden key 'abstract'" in p for p in problems)
    assert any("possible pasted text" in p for p in problems)


def test_validator_fails_a_non_real_export_with_a_non_placeholder_file(copy_of_export):
    edit(copy_of_export / "meta.json", lambda d: d.update(placeholder=False, year_range={"min": 2015, "max": 2020},
                                                          counts={"works": 5}))
    problems = E.validate_export(copy_of_export)
    assert any("meta.json" in p and "synthetic placeholder" in p for p in problems)
    assert any("meta.json" in p and "carries the number" in p for p in problems)


def test_validator_flags_a_real_label_on_a_synthetic_export_and_missing_routes(copy_of_export):
    edit(copy_of_export / "routes.json", lambda d: d.update(data_label="real"))
    assert any("disagrees" in p for p in E.validate_export(copy_of_export))
    (copy_of_export / "routes.json").unlink()
    assert E.validate_export(copy_of_export) and "routes.json" in E.validate_export(copy_of_export)[0]


def test_first_year_after_corpus_end_is_an_error(dry, tmp_path):
    with pytest.raises(E.ExportError):
        E.export_run(dry, tmp_path / "o", first_year=2030)


def test_incomplete_run_is_refused(dry, tmp_path):
    run = tmp_path / "run"
    run.mkdir()
    (run / "run_manifest.json").write_text(json.dumps({"status": "failed"}), encoding="utf-8")
    with pytest.raises(E.ExportError):
        E.load_run(run)


def test_committed_sample_export_is_valid_synthetic_and_placeholder():
    from pathlib import Path
    sample = Path(__file__).parent / "fixtures" / "export_sample"
    assert E.validate_export(sample) == []
    routes = read(sample / "routes.json")
    assert routes["synthetic"] is True and routes["map_years"]
    for path in sample.glob("*.json"):
        if path.name not in ("routes.json", "manifest.json"):
            data = read(path)
            assert data["placeholder"] is True and data["synthetic"] is True, path.name


# ------------------------------------------------------------------ year range, titles, phrase coverage


def test_meta_year_range_is_written_also_in_synthetic_exports(exported):
    out, _ = exported
    meta = read(out / "meta.json")
    assert meta["placeholder"] is True and meta["year_range"] == {"min": 2015, "max": 2020}
    assert meta["titles_available"] is False and "id is shown" in meta["titles_note"]


def test_validator_rejects_null_or_wrong_year_range(copy_of_export):
    edit(copy_of_export / "meta.json", lambda d: d.update(year_range=None))
    assert any("year_range" in p for p in E.validate_export(copy_of_export))
    edit(copy_of_export / "meta.json", lambda d: d.update(year_range={"min": 2015, "max": 2019}))
    assert any("year_range differs" in p for p in E.validate_export(copy_of_export))


def test_titles_come_from_the_corpus_for_the_ids_in_the_outputs_and_no_abstract_is_written(tmp_path):
    corpus = tmp_path / "c.jsonl"
    secret = "qzxsentinelabstract"
    rows = [
        {"id": "https://openalex.org/W1", "title": "Title one", "abstract": secret, "year": 2019,
         "arxiv_id": "1901.00001v2", "date": "2019-01-01"},
        {"id": "https://openalex.org/W2", "title": "Title two", "abstract": secret, "year": 2018,
         "arxiv_id": None, "date": "2018-01-01"},
        {"id": "https://openalex.org/W3", "title": "Unused", "abstract": secret, "year": 2018, "arxiv_id": None},
    ]
    corpus.write_text("\n".join(json.dumps(r) for r in rows), encoding="utf-8")
    files = {"gap-details.json": {"entries": {"a|b": {"closest_a": [
        {"id": "https://openalex.org/W1", "title": "https://openalex.org/W1", "year": 2019, "url": ""},
        {"id": "https://openalex.org/W2", "title": "https://openalex.org/W2", "year": 2018, "url": ""},
        {"id": "https://openalex.org/W9", "title": "https://openalex.org/W9", "year": 2018, "url": ""}]}}}}
    ids = {p["id"] for payload in files.values() for p in E.paper_dicts(payload)}
    lookup = E.load_titles(corpus, ids)
    assert set(lookup) == {"https://openalex.org/W1", "https://openalex.org/W2"}  # only ids in the outputs
    assert E.apply_titles(files, lookup) == 2
    one, two, nine = files["gap-details.json"]["entries"]["a|b"]["closest_a"]
    assert one["title"] == "Title one" and one["url"] == "https://arxiv.org/abs/1901.00001"
    assert two["title"] == "Title two" and two["url"] == "https://openalex.org/W2"
    assert nine["title"] == "https://openalex.org/W9"  # not in the corpus: id stays the title
    assert secret not in json.dumps(files) and secret not in json.dumps(lookup)


def test_real_shaped_gap_details_get_titles_from_the_dry_corpus(dry):
    run = E.load_run(dry)
    trained, _ = E.train_frozen(run)
    built = E.build_real_files(run, trained, [2019, 2020], **KW)
    files = {"gap-details.json": built["gap-details.json"]}
    papers = list(E.paper_dicts(files))
    assert papers and all(p["title"] == p["id"] for p in papers)
    assert E.add_titles(files, run, Path(run.manifest["corpus"]["path"])) is True
    assert any(p["title"] != p["id"] for p in E.paper_dicts(files))


def make_join(tmp_path, dry, year_counts):
    run = E.load_run(dry)
    ids = [w[0] for w in E.iter_cached_works(dry, 2020)]
    join = tmp_path / "join"
    join.mkdir()
    lines = ["id,arxiv_id,match_key,join_method,has_linked_code,has_official_code,year,date,date_source,topic_id,type"]
    for k, wid in enumerate(ids):
        method = E.UNMATCHABLE if k % 3 == 0 else "corpus-arxiv-id-preprint-record"
        lines.append(f"{wid},,,{method},{'True' if k % 7 == 0 else 'False'},False,2020,2020-01-01,publication_date,,preprint")
    (join / "papers.csv").write_text("\n".join(lines), encoding="utf-8")
    table = {"year_counts": year_counts, "min_linked": 100, "archive_date": "2025-07-28", "rows": []}
    (join / "coverage.json").write_text(json.dumps(table), encoding="utf-8")
    return run, join, table


def test_coverage_is_per_phrase_concept_with_unlinked_paper_examples(dry, tmp_path):
    years = list(range(2015, 2021))
    run, join, table = make_join(tmp_path, dry, {str(y): (50 if y < 2017 else 500) for y in years})
    files = E.build_coverage(table, {}, years, False, run=run, join_dir=join, top=5)
    cov = files["coverage-2020.json"]
    assert cov["placeholder"] is False and cov["concept_kind"] == "phrase" and len(cov["concepts"]) == 5
    errs = []
    E.check_contract("coverage-2020.json", E.clean(cov), errs)
    assert errs == []
    cells = [c for con in cov["concepts"] for c in con["cells"]]
    states = {c["year"]: c["state"] for c in cells}
    assert states[2015] == "thin" and states[2016] == "thin" and states[2018] == "available"
    for c in cells:
        if c["state"] == "available":
            lst = c["papers_without_linked_code"]
            assert 0 < len(lst) <= 10 and [p["id"] for p in lst] == sorted(p["id"] for p in lst)
            assert all(set(p) == {"id", "title", "year", "url"} and p["year"] == c["year"] for p in lst)
            assert 0 <= c["code_rate"] <= 1
        else:
            assert "papers_without_linked_code" not in c and c["code_rate"] is None
        assert c["paper_count"] >= c["linked_paper_count"] and "unmatchable_by_construction" in c
    assert any(c["unmatchable_by_construction"] for c in cells)
    # no later years in an earlier file, and the concepts are the map's phrases
    assert max(c["year"] for con in files["coverage-2017.json"]["concepts"] for c in con["cells"]) <= 2017
    vocab = set(json.loads((R.origin_dir(dry, 2020) / "vocabulary.json").read_text()))
    assert {c["id"] for c in cov["concepts"]} <= vocab
    # deterministic
    again = E.build_coverage(table, {}, years, False, run=run, join_dir=join, top=5)
    assert again == files


def test_coverage_stays_a_placeholder_without_join_output():
    files = E.build_coverage(None, {}, [2015, 2016], False)
    assert all(f["placeholder"] is True and f["synthetic"] is False for f in files.values())


def test_open_problems_placeholder_documents_concept_ids(exported):
    out, _ = exported
    op = read(out / "open-problems.json")
    assert op["placeholder"] is True and op["items"] == []
    assert "concept_ids" in op["item_shape"] and "concept_ids" in op["item_shape"]["fields"]


def test_production_config_purges_and_names_the_origins(dry):
    run = E.load_run(dry)
    pc = E.production_config(run, "through-2020")
    cfg = run.config
    assert pc.fit_origins == tuple(sorted({*cfg.fit_origins, *cfg.calibration_origins}))
    assert pc.calibration_origins == (min(cfg.test_origins),)
    assert max(pc.fit_origins) + pc.horizon <= min(pc.calibration_origins)
    assert E.production_config(run, "frozen") == run.config.backtest_config()
    with pytest.raises(E.ExportError):
        E.production_config(run, "nope")


def test_through_2020_model_is_labelled_and_differs_from_backtest(dry):
    run = E.load_run(dry)
    trained, same = E.train_production(run, "through-2020")
    assert same is False
    frozen, same_frozen = E.train_production(run, "frozen")
    assert same_frozen is True and frozen.info["coefficients"] != trained.info["coefficients"]
    label = E.production_label(run, 2020, "through-2020")
    assert "never itself held-out tested" in label and "not shown to be better calibrated" in label
    on = E.production_trained_on(run, "through-2020")
    assert on["calibration_origins"] == [min(run.config.test_origins)] and on["held_out_tested"] is False
    assert "Platt" in on["calibration_method"]
    assert E.production_trained_on(run, "frozen")["test_origins_used"] == []


def test_frozen_fallback_exports_backtest_model(dry, tmp_path):
    result = E.export_run(dry, tmp_path / "o", production_model="frozen", **KW)
    assert result["problems"] == [] and result["same_model"] is True
    manifest = read(tmp_path / "o" / "manifest.json")
    assert manifest["export"]["production_model_equals_backtest_model"] is True
    assert manifest["export"]["production_model"] == "frozen"


def test_cli_production_model_flag(dry, tmp_path, capsys):
    assert E.main([str(dry), "--out", str(tmp_path / "o"), "--production-model", "frozen"]) == 0
    with pytest.raises(SystemExit):
        E.main([str(dry), "--out", str(tmp_path / "p"), "--production-model", "bogus"])


def test_real_shaped_files_state_the_production_model(dry):
    run = E.load_run(dry)
    trained, _ = E.train_production(run, "through-2020")
    built = E.build_real_files(run, trained, [2019, 2020], **KW)
    assert built["gaps.json"]["trained_on"]["model"] == "through-2020"
    assert "trained after the held-out test" in built["gaps.json"]["label"]
    assert built["meta.json"]["production_forecast"]["model"]["calibration_origins"] == [min(run.config.test_origins)]


# ------------------------------------------------------------------ review fixes (#175)


def with_config(run, **changes):
    import dataclasses
    return E.Run(run.dir, run.manifest, run.metrics, run.examples, dataclasses.replace(run.config, **changes))


def test_production_config_purge_failure_is_an_export_error(dry):
    run = E.load_run(dry)
    bad = with_config(run, fit_origins=(2014,), calibration_origins=(2016,), test_origins=(2017,))
    with pytest.raises(E.ExportError, match="purge"):
        E.production_config(bad, "through-2020")  # fit gains 2016; 2016 + 3 > 2017


def test_production_config_refuses_a_corpus_too_short_for_the_calibration_outcomes(dry):
    run = E.load_run(dry)
    short = E.Run(run.dir, {**run.manifest, "corpus": {**run.manifest["corpus"], "per_year": {"2018": 1, "2019": 1}}},
                  run.metrics, run.examples, run.config)
    with pytest.raises(E.ExportError, match="corpus ends in 2019"):
        E.production_config(short, "through-2020")
    assert E.production_config(short, "frozen")  # the frozen model needs no extra outcomes


def test_out_dir_must_be_new_empty_or_a_previous_export(dry, tmp_path):
    stray = tmp_path / "stray"
    stray.mkdir()
    (stray / "notes.txt").write_text("keep me", encoding="utf-8")
    with pytest.raises(E.ExportError, match="not empty"):
        E.export_run(dry, stray, **KW)
    assert (stray / "notes.txt").read_text(encoding="utf-8") == "keep me" and not (stray / "routes.json").exists()
    assert E.main([str(dry), "--out", str(stray)]) == 2
    empty = tmp_path / "empty"
    empty.mkdir()
    assert E.export_run(dry, empty, **KW)["problems"] == []


def test_reexport_removes_stale_orphans_but_not_foreign_files(dry, tmp_path):
    out = tmp_path / "o"
    E.export_run(dry, out, **KW)
    (out / "map-2010.json").write_text("{}", encoding="utf-8")
    (out / "coverage-2031.json").write_text("{}", encoding="utf-8")
    (out / "mine.txt").write_text("x", encoding="utf-8")
    result = E.export_run(dry, out, **KW)
    assert result["problems"] == []
    assert not (out / "map-2010.json").exists() and not (out / "coverage-2031.json").exists()
    assert (out / "mine.txt").exists() and (out / "map-2015.json").exists()


def test_validator_requires_null_intervals_on_real_gaps_and_details(dry):
    run = E.load_run(dry)
    trained, _ = E.train_production(run, "through-2020")
    built = E.build_real_files(run, trained, [2019, 2020], **KW)
    gaps = E.clean(built["gaps.json"])
    errs = []
    E.check_contract("gaps.json", gaps, errs)
    assert errs == []
    gaps["items"][0]["p_lo"], gaps["items"][0]["p_hi"] = 0.1, 0.9
    E.check_contract("gaps.json", gaps, errs)
    assert any("p_lo" in e and "must be null" in e for e in errs) and any("p_hi" in e for e in errs)
    details = E.clean(built["gap-details.json"])
    errs = []
    E.check_contract("gap-details.json", details, errs)
    assert errs == []
    next(iter(details["entries"].values()))["summary"]["p_hi"] = 0.5
    E.check_contract("gap-details.json", details, errs)
    assert any("p_hi" in e and "must be null" in e for e in errs)


def test_dry_run_with_a_real_metrics_label_is_a_labelled_synthetic_export(dry, tmp_path):
    run_dir = tmp_path / "run"
    shutil.copytree(dry, run_dir)
    path = run_dir / "metrics.json"
    metrics = read(path)
    metrics["manifest"]["data_label"] = "real"
    path.write_text(json.dumps(metrics), encoding="utf-8")
    assert E.main([str(run_dir), "--out", str(tmp_path / "o")]) == 0
    out = tmp_path / "o"
    assert read(out / "routes.json")["data_label"] == "synthetic" and read(out / "routes.json")["synthetic"] is True
    assert {read(p)["data_label"] for p in out.glob("*.json") if p.name != "manifest.json"} == {"synthetic"}
    assert E.validate_export(out) == []


def digest(path):
    import hashlib
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_through_2020_export_leaves_backtest_and_run_metrics_untouched(dry, tmp_path):
    guarded = [p for p in (dry / "metrics.json", dry / "run_manifest.json", dry / "backtest_examples.json",
                           dry / "backtest.json") if p.exists()]
    assert dry / "metrics.json" in guarded
    before = {p: digest(p) for p in guarded}
    E.export_run(dry, tmp_path / "frozen", production_model="frozen", **KW)
    E.export_run(dry, tmp_path / "t20", production_model="through-2020", **KW)
    assert {p: digest(p) for p in guarded} == before
    assert (tmp_path / "frozen" / "backtest.json").read_bytes() == (tmp_path / "t20" / "backtest.json").read_bytes()


def test_headline_source_says_the_numbers_are_the_backtest_models(dry):
    run = E.load_run(dry)
    trained, _ = E.train_production(run, "through-2020")
    meta = E.build_real_files(run, trained, [2019, 2020], **KW)["meta.json"]
    src = meta["headline_source"]
    assert src.startswith("held-out backtest (backtest.json)") and "scores the backtest model" in src
    assert "production forecast (gaps.json) has no result" in src and "its model may differ" in src
