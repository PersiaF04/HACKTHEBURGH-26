"""Tests for the export runner and validator (issue #175), offline, on the synthetic dry-run corpus
from ``run_real`` (made-up words; nothing here says anything about real literature)."""
import json
import shutil

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
    assert manifest["export"]["production_model_equals_backtest_model"] is True


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
    trained, same = E.train_frozen(run)
    assert same
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
    assert "not the held-out test" in gaps["label"] and gaps["trained_on"]["test_origins_used"] == []
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
    assert E.synthetic_reasons(E.Run(run.dir, {**run.manifest, "dry_run": False}, real, {}, run.config)) == []
    assert E.synthetic_reasons(E.Run(run.dir, {**run.manifest, "dry_run": True}, real, {}, run.config))
    gen = {**run.metrics, "manifest": {"data_label": "real", "generator": {"n_works": 1}}}
    assert E.synthetic_reasons(E.Run(run.dir, {**run.manifest, "dry_run": False}, gen, {}, run.config))


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
