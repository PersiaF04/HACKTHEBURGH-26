"""Write every file the frontend needs from one ``run_real`` run directory (issue #175).

    python -m whitespace.pipeline.export_all <run_dir> --out <export_dir> [--join-dir <code join dir>]

Layout of ``<export_dir>`` (one flat directory, served as static files):

====================  ======================================================  ==========================
file                  frontend route                                           source
====================  ======================================================  ==========================
``routes.json``       (the route map itself: route, file, key, real/placeholder)
``manifest.json``     (provenance: run, corpus hash, config, file hashes)
``meta.json``         ``/api/meta``                                            run metrics, corpus span
``backtest.json``     ``/api/backtest``                                        HELD-OUT test (metrics + guarded hits and misses)
``map-<Y>.json``      ``/api/map?year=Y`` for Y = first_year .. corpus end     snapshot Y only
``gaps.json``         ``/api/gaps``                                            PRODUCTION forecast at the last corpus year
``gap-details.json``  ``/api/gap/{a}/{b}`` (entry ``"a|b"``)                   same forecast, top gaps only
``concepts.json``     ``/api/concept/{id}`` (entry ``id``)                     last corpus year snapshot
``coverage-<Y>.json`` ``/api/coverage?year=Y``                                 code join output, else placeholder
``search.json``       ``/api/search?q=..``                                     always placeholder (not built)
``open-problems.json`` ``/api/open-problems``                                  always placeholder (not built)
====================  ======================================================  ==========================

Query parameters other than ``year`` (``min_p``, ``sort``, ``limit``, ``concepts``, ``q``, ``k``, ...) are
not applied: the file is the whole answer and ``routes.json`` says so.

Honesty rules (enforced by the writer and re-checked by ``validate_export``):

* A run counts as real only when ``run_manifest.json`` says it is not a dry run, is complete, and the
  metrics label is the real corpus. Anything else is synthetic: every file is written as a placeholder
  with ``synthetic: true`` and no numbers (the full path still runs; only counts are kept in
  ``manifest.json`` under ``path_check``). The writer raises rather than write a non-placeholder file
  for a synthetic run.
* ``backtest.json`` is the held-out test only. ``gaps.json`` is a PRODUCTION forecast scored at the last
  corpus year. With ``--production-model through-2020`` (default) the model is re-trained after the test was
  scored: fit on the run's fit and calibration origins, Platt-calibrated at the test origin 2020. That model
  was never itself held-out tested; with ``frozen`` it is the backtest model (no test origin used).
  Its outcomes are unknown, nothing in it was evaluated, and the file says so.
* Each ``map-<Y>.json`` is built from the origin-Y cache (vocabulary from works dated up to 31 Dec Y)
  and works dated up to 31 Dec Y, so the slider never shows later knowledge. Positions come from a
  layout of that same year. Years after the corpus end are absent, not zero.
* Test labels are never read here. Hits and misses come from ``backtest_examples.json``, which the
  runner wrote from its guarded artifacts.
* Papers are exported as id, year and link only. No abstract text is read or written.
"""
from __future__ import annotations

import argparse
import copy
import csv
import datetime as dt
import json
import math
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from heapq import nsmallest
from pathlib import Path

from . import backtest
from . import run_real as R
from .backtest import is_real_run
from .code_layer import arxiv_id_kind, archive_coverage_states
from .common import LINK_THRESHOLD, Work, assert_purged, normalise_arxiv_id
from .export_backtest import build_manifest, to_backtest_response, write_json
from .export_coverage import code_link_evaluation, to_coverage_response
from .export_map_gaps import (
    GAP_NOTE, GENERIC_PHRASES, build_gap_detail, build_gaps, build_map, clean, compute_layout, headline_from_backtest,
    paper_ref, concept_series, trained_predictor, visible_works,
)
from . import open_problems as OP
from .graphs import build_snapshot, vocabulary

CONTRACT_DIR = Path(__file__).parent / "frontend_contract"  # tiny copies of web/mock/*.json (PR #159)
FIRST_YEAR = 2015
EDGE_THRESHOLD, MAX_EDGES = 0.0, 300  # a display choice: the top predicted pairs, not a validated cut-off
GAP_POOL, GAP_LIMIT, DETAIL_LIMIT, MAX_NEIGHBOURS = 2000, 50, 20, 25
FORBIDDEN_KEYS = {"abstract", "abstract_excerpt", "abstract_inverted_index"}
MAX_TITLE = 300  # titles are cut to this when written, well under MAX_STRING, so validation cannot fail on one
MAX_STRING = 800  # longer strings are treated as possible pasted text
SYNTHETIC_NUMBER_KEYS = {"year", "years", "min", "max", "layout_year", "snapshot_year"}
COVERAGE_TOP = 200  # phrase concepts per coverage file (most papers up to the last corpus year)
PAPERS_PER_CELL = 10
UNMATCHABLE = "unmatchable_by_construction"
OPEN_PROBLEM_ITEM_SHAPE = {
    "concept_ids": "list of phrase concept ids the item concerns ([] on every item; mining does not exist, "
                   "so the file has no items and stays a placeholder)",
    "fields": ["sentence", "type", "confidence", "paper", "concept_ids"],
}
STATIC_PLACEHOLDERS = {
    "search.json": "Search is not built.",
    "open-problems.json": "Open-problem mining is not built.",
}
LAYOUT_NOTE_YEAR = (
    "Positions are a 2D projection (truncated SVD of the positive-PMI co-occurrence matrix) of this "
    "year's snapshot only, so points can move between years. Distance is not research similarity."
)
EDGE_NOTE_SUFFIX = " Shown as a ranking cut (top predicted pairs), not as a validated probability threshold."


class ExportError(RuntimeError):
    """The export cannot proceed or would break an honesty rule; the message says why."""


# ------------------------------------------------------------------ loading


def contract(name: str) -> dict:
    """One of the frontend fixture files copied into ``frontend_contract/``."""
    return json.loads((CONTRACT_DIR / name).read_text(encoding="utf-8"))


@dataclass
class Run:
    dir: Path
    manifest: dict
    metrics: dict
    examples: dict
    config: R.RunConfig

    @property
    def last_year(self) -> int:
        years = [int(y) for y in self.manifest.get("corpus", {}).get("per_year", {})]
        if not years:
            raise ExportError("run_manifest.json has no corpus year counts")
        return max(years)


def _read(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ExportError(f"cannot read {path}: {exc}") from None


def load_run(run_dir: str | Path) -> Run:
    """Read ``run_manifest.json``, ``metrics.json`` and (if present) ``backtest_examples.json``."""
    d = Path(run_dir)
    manifest = _read(d / "run_manifest.json")
    if manifest.get("status") != "complete":
        raise ExportError(f"run is not complete (status {manifest.get('status')!r}); nothing to export")
    metrics = _read(d / "metrics.json")
    examples = _read(d / "backtest_examples.json") if (d / "backtest_examples.json").exists() else {}
    cfg = dict(manifest["config"])
    for key in ("fit_origins", "calibration_origins", "test_origins"):
        cfg[key] = tuple(cfg[key])
    return Run(d, manifest, metrics, examples, R.RunConfig(**cfg))


def data_label(run: Run, synthetic: bool = False) -> str:
    """The metrics data label; a synthetic export is always labelled ``synthetic`` (a dry run whose metrics
    claim ``real`` must not carry that label into the files)."""
    if synthetic:
        return "synthetic"
    return (run.metrics.get("manifest") or {}).get("data_label") or "unlabelled"


def synthetic_reasons(run: Run) -> list[str]:
    """Why a run must stay a placeholder (empty list: it is a real run).

    The only test of "real" is ``backtest.is_real_run`` (label ``real`` and no generator), applied to the
    metrics manifest and to ``run_manifest.json``; both must pass. A run the run script marked ``dry_run`` is also never real.
    """
    reasons = []
    if not is_real_run(run.metrics.get("manifest") or {}):
        reasons.append(f"data_label is {data_label(run)!r}, not 'real' (or a generator is recorded)")
    if not is_real_run(run.manifest):
        reasons.append("run_manifest.json is not a real run (label or generator)")
    if run.manifest.get("dry_run"):
        reasons.append("run_manifest.json says dry_run")
    return reasons


def runner_metrics(run: Run, synthetic: bool) -> dict:
    """``metrics`` for ``export_backtest``; its real/placeholder test is the same ``is_real_run``."""
    if synthetic and is_real_run(run.metrics.get("manifest") or {}):  # dry_run flag on an otherwise real label
        return {**run.metrics, "manifest": {**run.metrics["manifest"], "data_label": "synthetic"}}
    return run.metrics


# ------------------------------------------------------------------ caches and model


def ensure_caches(run: Run, years: list[int], corpus: Path | None) -> None:
    """Every year needs the origin-Y cache (vocabulary from works up to Y). Missing ones are built."""
    sha = run.manifest["corpus"]["sha256"]
    missing = [y for y in years if not R._cache_ok(R.origin_dir(run.dir, y), R.cache_key(sha, run.config, y))]
    if not missing:
        return
    path = corpus or Path(run.manifest["corpus"]["path"])
    if not path.exists():
        raise ExportError(f"origin caches missing for {missing} and the corpus is not at {path}; pass --corpus")
    info = R.scan_corpus(path)
    if info["sha256"] != sha:
        raise ExportError("corpus file differs from the one the run used (sha256 mismatch); refusing to mix them")
    try:
        R.build_caches(path, info, run.config, run.dir, missing)
    except R.RunError as exc:
        raise ExportError(f"cannot build origin caches: {exc}") from None


PRODUCTION_MODELS = ("frozen", "through-2020")


def production_config(run: Run, mode: str) -> backtest.BacktestConfig:
    """Training config of the production model. ``frozen`` is the backtest's; ``through-2020`` adds the
    backtest's calibration origins to the fit origins (2010-14 and 2017) and calibrates at the first test
    origin (2020). The purge rule holds: 2017 + 3 <= 2020."""
    cfg = run.config
    if mode == "frozen":
        return cfg.backtest_config()
    if mode != "through-2020":
        raise ExportError(f"unknown production model {mode!r}; use one of {PRODUCTION_MODELS}")
    fit = tuple(sorted({*cfg.fit_origins, *cfg.calibration_origins}))
    cal = (min(cfg.test_origins),)
    if run.last_year < cal[0] + cfg.horizon:
        raise ExportError(f"corpus ends in {run.last_year}, before the calibration origin {cal[0]} + "
                          f"{cfg.horizon} years: its outcomes are not in the corpus")
    try:  # the calibration outcome window (cal + horizon) plays the role of the next stage
        assert_purged(fit, cal, (cal[0] + cfg.horizon,), cfg.horizon)
    except ValueError as exc:
        raise ExportError(f"through-2020 model breaks the purge rule: {exc}") from None
    return backtest.BacktestConfig(fit, cal, cfg.test_origins, seed=cfg.seed, n_min=cfg.n_min,
                                   horizon=cfg.horizon, n_boot=cfg.n_boot)


def train_production(run: Run, mode: str = "through-2020") -> tuple[backtest.Trained, bool]:
    """Train the model behind ``gaps.json``. Second value: its coefficients equal the backtest model's
    recorded ones (always False in practice for ``through-2020``, which has more fit data).

    ``train`` never reads a test-origin score. In ``through-2020`` it does read the 2020 outcome labels to
    calibrate, which is why that model is labelled as trained after the test and not held-out tested."""
    trained = backtest.train(lambda t: R.load_works(run.dir, t), production_config(run, mode))
    recorded = (run.metrics.get("training") or {}).get("coefficients") or {}
    same = bool(recorded) and set(recorded) == set(trained.info["coefficients"]) and all(
        math.isclose(recorded[k], v, rel_tol=1e-6, abs_tol=1e-9) for k, v in trained.info["coefficients"].items())
    return trained, same


def train_frozen(run: Run) -> tuple[backtest.Trained, bool]:
    """The backtest model re-trained (fit and calibration origins only); see ``train_production``."""
    return train_production(run, "frozen")


# ------------------------------------------------------------------ placeholders


def placeholder(name: str, note: str, synthetic: bool, year: int | None = None) -> dict:
    """The frontend's own empty fixture for ``name``, flagged placeholder, with ``synthetic`` and a note."""
    stem = name.removesuffix(".json")
    if stem.startswith("map-"):
        base = contract("map.json")
        base["year"] = year
    elif stem.startswith("coverage-"):
        base = contract("coverage.json")
        base["year"] = year
    elif stem in ("gap-details", "concepts"):
        base = {"entries": {}}
    else:
        base = contract({"gaps": "gaps.json", "meta": "meta.json", "backtest": "backtest.json",
                         "search": "search.json", "open-problems": "open-problems.json"}[stem])
    extra = {"item_shape": OPEN_PROBLEM_ITEM_SHAPE} if stem == "open-problems" else {}
    return {**base, **extra, "placeholder": True, "synthetic": synthetic, "note": note}


def _layout_files(years: list[int]) -> list[str]:
    return (["meta.json", "backtest.json", "gaps.json", "gap-details.json", "concepts.json",
             "search.json", "open-problems.json"]
            + [f"map-{y}.json" for y in years] + [f"coverage-{y}.json" for y in years])


# ------------------------------------------------------------------ real builders


def build_concepts(visible: list[Work], year: int, names, snap, top_papers: int = 5) -> dict:
    """``ConceptResponse`` per concept at ``year`` in one pass (ids and links only; neighbours capped)."""
    wanted = set(names)
    series = concept_series(visible, year)
    papers: dict[str, list[Work]] = defaultdict(list)
    for w in visible:
        for c in set(w.concepts) & wanted:
            papers[c].append(w)
    nbrs: dict[str, list[tuple[int, str]]] = defaultdict(list)
    for (a, b), weight in snap.weights.items():
        if weight >= LINK_THRESHOLD and a in wanted and b in wanted:
            nbrs[a].append((-weight, b))
            nbrs[b].append((-weight, a))
    entries = {}
    for name in names:
        latest = nsmallest(top_papers, papers.get(name, []), key=lambda w: (-w.date.toordinal(), w.id))
        top = nsmallest(MAX_NEIGHBOURS, nbrs.get(name, []))
        entries[name] = {
            "placeholder": False, "synthetic": False,
            "counts_by_year": [{"year": y, "count": c} for y, c in sorted(series.get(name, {}).items())],
            "forecast": None, "top_papers": [paper_ref(w) for w in latest], "open_problems": [],
            "neighbours": [{"id": n, "label": n} for _, n in top],
            "neighbours_note": f"the {MAX_NEIGHBOURS} most strongly linked concepts at most",
        }
    return entries


def production_trained_on(run: Run, mode: str) -> dict:
    """Origins the production model was fit and calibrated on, and how its probabilities were calibrated."""
    pc = production_config(run, mode)
    return {
        "model": mode, "fit_origins": list(pc.fit_origins), "calibration_origins": list(pc.calibration_origins),
        "test_origins_used": [] if mode == "frozen" else list(pc.calibration_origins),
        "calibration_method": "Platt scaling (logistic fit of the decision value) on the full pair universe of "
                              "the calibration origin",
        "held_out_tested": mode == "frozen",
    }


def production_label(run: Run, year: int, mode: str = "through-2020") -> str:
    pc = production_config(run, mode)
    if mode == "frozen":
        model = (f"The model frozen for the backtest (fit on origins {list(pc.fit_origins)}, calibrated at "
                 f"{list(pc.calibration_origins)}; no test origin used)")
    else:
        model = (f"A model trained after the held-out test was scored: fit on origins {list(pc.fit_origins)} "
                 f"and Platt-calibrated at {list(pc.calibration_origins)}, which is the test origin, so its "
                 f"outcomes were used for training. This model was never itself held-out tested, and its "
                 f"probabilities are not shown to be better calibrated than the backtest model's. It")
    return (
        f"Production forecast, not the held-out test. {model} ranks pairs that have not yet co-occurred "
        f"{LINK_THRESHOLD}+ times at the {year} snapshot, the last year in this export. Their outcomes "
        f"({year + 1} to {year + pc.horizon}) are not observed, so nothing in this file was evaluated. "
        f"The held-out result is in backtest.json and describes the backtest model, not this one."
    )


def build_real_files(run: Run, trained: backtest.Trained, years: list[int], *, edge_threshold: float,
                     max_edges: int, gap_pool: int, gap_limit: int, detail_limit: int,
                     production_model: str = "through-2020",
                     stoplist: frozenset[str] | None = GENERIC_PHRASES) -> dict[str, dict]:
    """map-<Y>, gaps, gap-details, concepts and meta from the caches. Real-shaped; the caller decides
    whether they may be written (never for a synthetic run)."""
    n_min, final = run.config.n_min, years[-1]
    predict = trained_predictor(trained, n_min)
    files: dict[str, dict] = {}
    for year in years:
        visible = visible_works(R.load_works(run.dir, year), year)
        snap = build_snapshot(visible, year)
        names = vocabulary(snap, n_min)
        xy = compute_layout(snap, names)
        layout = {n: (float(xy[k, 0]), float(xy[k, 1])) for k, n in enumerate(names)}
        m = build_map(visible, year, layout, year, predict, n_min=n_min, edge_threshold=edge_threshold,
                      max_edges=max_edges)
        m.update(synthetic=False, layout_note=LAYOUT_NOTE_YEAR, edge_note=m["edge_note"] + EDGE_NOTE_SUFFIX)
        files[f"map-{year}.json"] = m
        if year == final:
            gaps, ctx = build_gaps(visible, final, predict, n_min=n_min, pool=gap_pool, limit=gap_limit,
                                  stoplist=stoplist)
            gaps.update(
                synthetic=False, kind="production_forecast", held_out_test=False, snapshot_year=final,
                label=production_label(run, final, production_model), backtest_file="backtest.json",
                trained_on=production_trained_on(run, production_model),
                gap_note=GAP_NOTE)
            files["gaps.json"] = gaps
            files["gap-details.json"] = {
                "placeholder": False, "synthetic": False, "kind": "production_forecast_gap_details",
                "label": gaps["label"],
                "entries": {f"{it['a']}|{it['b']}": build_gap_detail(it, ctx, final) for it in gaps["items"][:detail_limit]},
            }
            files["concepts.json"] = {
                "placeholder": False, "synthetic": False, "kind": "concepts_at_last_corpus_year", "year": final,
                "entries": build_concepts(visible, final, names, snap),
            }
            final_counts = {"works": len(visible), "concepts": len(names), "ranked_gaps": len(gaps["items"])}
    final_counts["map_years"] = len(years)
    final_counts["predicted_edges_final_year"] = len(files[f"map-{final}.json"]["edges"])
    files["meta.json"] = build_meta(run, years, final_counts, production_model)
    if "stoplist" in files["gaps.json"]:
        files["meta.json"]["production_forecast"]["stoplist"] = files["gaps.json"]["stoplist"]
    return files


def records_after(run: Run, final: int) -> int:
    """Corpus records dated after ``final`` (excluded when the export is capped with ``--last-year``)."""
    return sum(int(n) for y, n in run.manifest["corpus"]["per_year"].items() if int(y) > final)


def build_meta(run: Run, years: list[int], counts: dict, production_model: str = "through-2020") -> dict:
    final = years[-1]
    after = records_after(run, final)
    note = (f"The corpus ends in {final}. Snapshot years after {final} are absent, not zero: no map, "
            f"gap or coverage file exists for them.")
    if after:
        note = (f"The export ends in {final}. The corpus also holds {after} records dated {final + 1} to "
                f"{run.last_year}; they are excluded from every file here (no map, gap or coverage file exists "
                f"for those years, and they are absent, not zero).")
    return {
        "placeholder": False, "synthetic": False,
        "year_range": {"min": years[0], "max": final},
        "counts": counts,
        "headline_metrics": headline_from_backtest(runner_metrics(run, False)),
        "headline_source": "held-out backtest (backtest.json), which scores the backtest model; the production "
                           "forecast (gaps.json) has no result and its model may differ (see production_forecast)",
        "corpus": {
            "last_year": final,
            "note": note,
            "records_after_last_year_excluded": after,
        },
        "production_forecast": {"file": "gaps.json", "snapshot_year": final,
                                "label": production_label(run, final, production_model),
                                "model": production_trained_on(run, production_model)},
        "layout": {"method": "truncated SVD of positive-PMI co-occurrence matrix, per year", "note": LAYOUT_NOTE_YEAR},
        "concepts_note": "Concepts are 1 to 3 word phrases from titles and abstracts (a vocabulary chosen "
                         "from works up to each year), not OpenAlex topic ids. Coverage uses topic ids.",
        "backtest_available": bool(run.metrics.get("test")),
    }


# ------------------------------------------------------------------ backtest and coverage files


def build_backtest(run: Run, synthetic: bool, hand_check_rows: list[dict] | None) -> dict:
    metrics = runner_metrics(run, synthetic)
    tests = metrics.get("test") or {}
    key = str(max(int(o) for o in tests)) if tests else None
    ex = run.examples.get(key, {}) if key else {}
    cle = None
    if hand_check_rows is not None and not synthetic:
        cle = {k: v for k, v in code_link_evaluation(hand_check_rows).items() if k != "placeholder"}
    out = to_backtest_response(metrics, ex.get("hits"), ex.get("misses"), cle,
                               meta={"hits_note": ex.get("hits_note"), "examples_available": bool(ex)})
    note = "Held-out test (scored once on the frozen model). The production forecast is gaps.json, a separate file."
    if not ex and not out["placeholder"]:
        note += " No backtest_examples.json in the run directory, so hits and misses are empty."
    out.update(kind="held_out_backtest", note=note, synthetic=synthetic, data_label=data_label(run, synthetic))
    return out


def read_join(join_dir: Path | None) -> tuple[dict | None, dict, list[dict] | None]:
    """``coverage.json`` (a ``code_layer.coverage_table`` dump: archive year counts, cutoff, state inputs),
    archive info from ``report.json`` and the filled-in ``handcheck_frame.csv`` if present. Output of
    ``code_join_local`` (issue #173); its per-work ``papers.csv`` is read by ``build_coverage``."""
    if join_dir is None:
        return None, {}, None
    table = _read(join_dir / "coverage.json")
    missing = [k for k in ("year_counts", "min_linked", "archive_date") if k not in table]
    if missing:
        raise ExportError(f"{join_dir / 'coverage.json'} lacks {missing}: not a coverage table")
    report = _read(join_dir / "report.json") if (join_dir / "report.json").exists() else {}
    pm = report.get("pwc_manifest") or {}
    info = {"dataset_revision": pm.get("dataset_revision"), "snapshot_date": pm.get("archive_date"),
            "row_count": pm.get("rows"), "file_vintage_verified": False}
    info = {k: v for k, v in info.items() if v is not None}
    frame = join_dir / "handcheck_frame.csv"
    rows = None
    if frame.exists():
        with open(frame, newline="", encoding="utf-8") as fh:
            rows = list(csv.DictReader(fh))
    return table, info, rows


def iter_cached_works(run_dir: Path, origin: int):
    """Stream ``(id, date, concepts)`` from an origin cache without keeping the works."""
    with open(R.origin_dir(run_dir, origin) / "works.jsonl", encoding="utf-8") as f:
        for line in f:
            wid, date, concepts = json.loads(line)
            yield wid, dt.date.fromisoformat(date), concepts


def read_join_flags(path: Path) -> tuple[set[str], set[str]]:
    """Ids with a linked archive entry, and ids with no usable arXiv id, from ``papers.csv`` (streamed)."""
    if not path.exists():
        raise ExportError(f"{path} not found: the join directory must hold papers.csv from code_join_local")
    linked, unmatchable = set(), set()
    with open(path, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            if str(row.get("has_linked_code")).strip().lower() in ("true", "1", "1.0", "yes"):
                linked.add(row["id"])
            if row.get("join_method") == UNMATCHABLE:
                unmatchable.add(row["id"])
    return linked, unmatchable


def default_url(work_id: str) -> str:
    if work_id.startswith("http"):
        return work_id
    return f"https://openalex.org/{work_id}" if work_id.startswith("W") and work_id[1:].isdigit() else ""


def phrase_coverage_rows(run: Run, final: int, join_dir: Path, table: dict, top: int):
    """Coverage rows per (phrase concept, year) from the final-year cache joined with ``papers.csv``.

    Concepts are the final snapshot's vocabulary (the same phrases as the map). Returns the table in
    ``coverage_table`` shape (top ``top`` concepts by papers) and the unlinked-paper examples per cell.
    Streams the cache and keeps only counters and at most a few ids per cell.
    """
    linked, unmatchable = read_join_flags(join_dir / "papers.csv")
    papers, hit, noid = Counter(), Counter(), Counter()
    unlinked: dict[tuple[str, int], list[str]] = defaultdict(list)
    for wid, date, concepts in iter_cached_works(run.dir, final):
        if date.year > final:
            continue
        is_linked, no_id = wid in linked, wid in unmatchable
        for c in set(concepts):
            key = (c, date.year)
            papers[key] += 1
            hit[key] += is_linked
            noid[key] += no_id
            if not is_linked:
                bucket = unlinked[key]
                bucket.append(wid)
                if len(bucket) >= 4 * PAPERS_PER_CELL:
                    bucket[:] = sorted(set(bucket))[:PAPERS_PER_CELL]
    totals = Counter()
    for (c, _y), n in papers.items():
        totals[c] += n
    keep = {c for c, _ in sorted(totals.items(), key=lambda t: (-t[1], t[0]))[:top]}
    year_counts = {int(k): v for k, v in table["year_counts"].items()}
    archive_date = dt.date.fromisoformat(table["archive_date"])
    cells = sorted(k for k in papers if k[0] in keep)
    cov = archive_coverage_states(year_counts, table["min_linked"], archive_date, years={y for _, y in cells})
    rows, examples = [], {}
    for key in cells:
        c, y = key
        state = cov["states"][y]
        rows.append({
            "concept": c, "year": y, "linked": hit[key], "papers": papers[key],
            "code_rate": hit[key] / papers[key] if state == "ok" else None, "coverage_state": state,
            "papers_without_arxiv_id": noid[key], "unmatchable_by_construction": noid[key] > 0,
        })
        if state == "ok":
            examples[key] = [{"id": w, "title": w, "year": y, "url": default_url(w)}
                             for w in sorted(set(unlinked.get(key, [])))[:PAPERS_PER_CELL]]
    out = {"rows": rows, "cutoff_year": cov["cutoff_year"], "min_linked": table["min_linked"],
           "archive_date": table["archive_date"]}
    return out, examples


def build_coverage(table: dict | None, info: dict, years: list[int], synthetic: bool, *, run: Run | None = None,
                   join_dir: Path | None = None, top: int = COVERAGE_TOP) -> dict[str, dict]:
    """``coverage-<Y>.json`` per year: phrase concepts (the map's concepts) joined with the local code join,
    or placeholders when the run is synthetic or no join output was given."""
    files = {}
    real = not (synthetic or table is None or run is None or join_dir is None)
    if real:
        built, examples = phrase_coverage_rows(run, years[-1], join_dir, table, top)
    for year in years:
        name = f"coverage-{year}.json"
        if not real:
            why = ("synthetic run: coverage withheld" if synthetic else
                   "no joined papers table supplied (--join-dir); coverage is a placeholder")
            files[name] = placeholder(name, why, synthetic, year)
            continue
        part = {**built, "rows": [r for r in built["rows"] if r["year"] <= year]}  # no later years
        resp = to_coverage_response(year, part, info)
        for concept in resp["concepts"]:
            for cell in concept["cells"]:
                if cell["state"] == "available":
                    cell["papers_without_linked_code"] = examples.get((concept["id"], cell["year"]), [])
        resp.update(
            synthetic=False, concept_kind="phrase",
            concept_note=f"the {top} phrase concepts with most papers up to {years[-1]} (the map's concepts; the same "
                         f"concepts in every year's file, chosen by final-year totals, so an early year can show "
                         f"concepts that were still small then), joined to the code join per paper; up to {PAPERS_PER_CELL} unlinked papers per "
                         f"available cell, listed by id order",
            note=None if not resp["placeholder"] else "the joined table has no rows up to this year")
        files[name] = resp
    return files


# ------------------------------------------------------------------ paper titles


def paper_dicts(node):
    """Every ``{id, title, year, url}`` paper object inside ``node``."""
    if isinstance(node, dict):
        if {"id", "title", "year", "url"} <= set(node):
            yield node
        for v in node.values():
            yield from paper_dicts(v)
    elif isinstance(node, list):
        for v in node:
            yield from paper_dicts(v)


def load_titles(corpus: Path, ids: set[str]) -> dict[str, dict]:
    """``{id: {title, year, url}}`` for the wanted ids only, streaming ``corpus.jsonl`` once.

    The title is the record's title; the abstract is parsed with the line but never kept or written.
    The url is the arXiv abstract link when the record has an arXiv id, else the OpenAlex id link.
    """
    out: dict[str, dict] = {}
    if not ids:
        return out
    with open(corpus, encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            rec = json.loads(line)
            wid = rec.get("id")
            if wid not in ids:
                continue
            arxiv = normalise_arxiv_id(rec.get("arxiv_id"))
            url = (f"https://arxiv.org/abs/{arxiv}" if arxiv and arxiv_id_kind(arxiv) != "none"
                   else default_url(wid))
            out[wid] = {"title": (rec.get("title") or wid)[:MAX_TITLE], "year": rec.get("year"), "url": url}
            if len(out) == len(ids):
                break
    return out


def apply_titles(files: dict[str, dict], lookup: dict[str, dict]) -> int:
    """Put real titles and links on every paper object whose id is in ``lookup``. Returns how many."""
    n = 0
    for payload in files.values():
        for paper in paper_dicts(payload):
            hit = lookup.get(paper["id"])
            if hit:
                paper["title"], paper["url"] = hit["title"], hit["url"] or paper["url"]
                n += 1
    return n


# ------------------------------------------------------------------ routes


def build_routes(files: dict[str, dict], years: list[int], synthetic: bool, final: int) -> dict:
    def status(name: str) -> str:
        return "placeholder" if files[name].get("placeholder") else "real"

    def row(route: str, name: str, kind: str, **extra) -> dict:
        return {"route": route, "file": name, "kind": kind, "status": status(name), **extra}

    routes = [row("/api/meta", "meta.json", "static"),
              row("/api/backtest", "backtest.json", "static")]
    routes += [row(f"/api/map?year={y}", f"map-{y}.json", "by_year", year=y) for y in years]
    routes += [row("/api/gaps", "gaps.json", "static",
                   note="query parameters (concepts, min_p, sort, limit) are not applied; filter client-side"),
               row("/api/gap/{a}/{b}", "gap-details.json", "keyed", key="{a}|{b}",
                   note="a and b are the URL-decoded concept ids; only the top gaps have an entry, others are null"),
               row("/api/concept/{id}", "concepts.json", "keyed", key="{id}",
                   note="the URL-decoded concept id; a missing entry means no such concept"),
               row("/api/search?q={q}&k={k}", "search.json", "static", note="query ignored; placeholder"),
               row("/api/open-problems", "open-problems.json", "static", note="query ignored; placeholder")]
    routes += [row(f"/api/coverage?year={y}", f"coverage-{y}.json", "by_year", year=y) for y in years]
    return {
        "layout_version": 1, "synthetic": synthetic, "corpus_last_year": final, "map_years": years,
        "note": "Static route map for the files in this directory. Strip the query string except 'year'; "
                "'kind' says how to find the payload; 'status' is placeholder when the file has no data.",
        "routes": routes,
    }


# ------------------------------------------------------------------ writing


def write_payload(out: Path, name: str, payload: dict, synthetic: bool) -> Path:
    """Write one JSON file. A synthetic run may only write placeholders flagged synthetic."""
    payload = clean(payload)
    if synthetic and (payload.get("placeholder") is not True or payload.get("synthetic") is not True):
        raise ExportError(f"refusing to write {name}: the run is synthetic, so the file must be a synthetic placeholder")
    if payload.get("synthetic") is True and payload.get("placeholder") is not True:
        raise ExportError(f"refusing to write {name}: marked synthetic but not a placeholder")
    path = out / name
    small = name in ("meta.json", "routes.json", "manifest.json", "backtest.json", "gaps.json")
    text = json.dumps(payload, indent=1 if small else None, separators=None if small else (",", ":"),
                      sort_keys=True, allow_nan=False)
    path.write_text(text + "\n", encoding="utf-8")
    return path


def add_titles(files: dict[str, dict], run: Run, corpus: Path) -> bool:
    """Title and link lookup for the papers that appear in the outputs only (one pass over the corpus)."""
    try:
        sha = R.scan_corpus(corpus)["sha256"]
    except R.RunError as exc:
        raise ExportError(f"cannot read the corpus to check it: {exc}") from None
    if sha != run.manifest["corpus"]["sha256"]:
        raise ExportError("corpus file differs from the one the run used (sha256 mismatch); "
                          "refusing to take titles from it")
    ids = {p["id"] for payload in files.values() for p in paper_dicts(payload)}
    lookup = load_titles(corpus, ids)
    apply_titles(files, lookup)
    return bool(lookup) or not ids


def attach_open_problems(files: dict[str, dict], cache_dir: Path, final: int) -> dict:
    """Fill open-problems.json, gap-details and concepts from the extractor cache (reduced version, issue #270)."""
    hits, counts = OP.load_cache(cache_dir)
    pairs = [(g["a"], g["b"]) for g in files["gaps.json"]["items"]]
    built = OP.build_export(hits, counts, pairs, list(files["concepts.json"]["entries"]), default_url, final,
                           exclude=frozenset(GENERIC_PHRASES))
    for key, items in built["gap_details"].items():
        if key in files["gap-details.json"]["entries"]:
            files["gap-details.json"]["entries"][key]["open_problems"] = items
    for cid, items in built["concepts"].items():
        if cid in files["concepts.json"]["entries"]:
            files["concepts.json"]["entries"][cid]["open_problems"] = items
    files["open-problems.json"] = built["file"]
    rc = built["gap_rates"]  # DISPLAY ONLY: gap_score, factors.gap_factor and formula_used are left exactly as they were

    def set_rates(rec: dict) -> None:
        ra, rb = rc.get(rec["a"]), rc.get(rec["b"])
        rec["gap_rate_a"], rec["gap_rate_b"] = ra, rb
        rec["gap_rate"] = round(ra + rb, 6) if ra is not None and rb is not None else None

    for it in files["gaps.json"]["items"]:
        set_rates(it)
    for e in files["gap-details.json"]["entries"].values():
        if isinstance(e.get("summary"), dict):
            set_rates(e["summary"])
    for cid, e in files["concepts.json"]["entries"].items():
        e["gap_rate"] = rc.get(cid)
    gaps = files["gaps.json"]
    gaps["omitted_components"] = [x for x in gaps.get("omitted_components", []) if not x.startswith("gap_rate")] + [
        "gap_rate (shown for display only; not part of gap_score)"]
    gaps["gap_rate_note"] = ("gap_rate_a/b: share of the concept's papers up to the snapshot year with an author-stated open "
                             "problem (regex extraction, quality as in meta.open_problems); gap_rate = a + b. Display only: "
                             "gap_score, the factors and the backtest do not use it.")
    return {"cache_hits": len(hits), "gap_rates": sum(1 for v in rc.values() if v is not None),
            "gaps_with_rates": sum(1 for g in gaps["items"] if g["gap_rate"] is not None), "items": len(built["file"]["items"]), "quality": "unmeasured",
            "gaps_with_sentences": sum(1 for v in built["gap_details"].values() if v),
            "concepts_with_sentences": len(built["concepts"]), "attribution": OP.ATTRIBUTION,
            "display_only": "rates are not used in any gap score or backtest"}


def _is_export_name(name: str) -> bool:
    return (name in ("routes.json", "manifest.json", "meta.json", "backtest.json", "gaps.json", "gap-details.json",
                     "concepts.json", *STATIC_PLACEHOLDERS)
            or (name.endswith(".json") and name.split("-")[0] in ("map", "coverage") and name[:-5].split("-")[-1].isdigit()))


def check_out_dir(out: Path) -> None:
    """The output directory must be new, empty, or hold a previous export (a ``routes.json``)."""
    if out.exists() and not out.is_dir():
        raise ExportError(f"{out} is not a directory")
    if out.is_dir() and any(out.iterdir()) and not (out / "routes.json").is_file():
        raise ExportError(f"{out} is not empty and holds no routes.json (not a previous export); "
                          f"refusing to write into it")


def clear_previous_export(out: Path) -> None:
    """Make ``out`` and remove the files of a previous export (known export names only; nothing else is touched),
    so no orphan ``map-<Y>.json`` or ``coverage-<Y>.json`` from an earlier run is left behind."""
    out.mkdir(parents=True, exist_ok=True)
    for path in out.iterdir():
        if path.is_file() and _is_export_name(path.name):
            path.unlink()


def export_run(run_dir, out_dir, *, corpus=None, join_dir=None, first_year: int = FIRST_YEAR,
               edge_threshold: float = EDGE_THRESHOLD, max_edges: int = MAX_EDGES, gap_pool: int = GAP_POOL,
               gap_limit: int = GAP_LIMIT, detail_limit: int = DETAIL_LIMIT, coverage_top: int = COVERAGE_TOP,
               production_model: str = "through-2020", last_year: int | None = None,
               stoplist: frozenset[str] | None = GENERIC_PHRASES, open_problems_dir=None) -> dict:
    """Export every frontend file and validate the result. Returns ``{synthetic, files, problems, ...}``.
    ``last_year`` caps the exported snapshot years (default: the corpus end)."""
    run = load_run(run_dir)
    reasons = synthetic_reasons(run)
    synthetic = bool(reasons)
    final = run.last_year if last_year is None else min(last_year, run.last_year)
    if first_year > final:
        raise ExportError(f"first year {first_year} is after the last exported year {final}")
    if final < max(run.config.test_origins):
        raise ExportError(f"corpus ends in {final}, before the last test origin")
    if last_year is not None and production_model == "through-2020":
        need = min(run.config.test_origins) + run.config.horizon
        if final < need:
            raise ExportError(f"--last-year {last_year} is before the through-2020 calibration origin + horizon "
                              f"({need}): its outcomes would not be in the export")
    years = list(range(first_year, final + 1))
    out = Path(out_dir)
    check_out_dir(out)
    table, info, hand_rows = read_join(Path(join_dir) if join_dir else None)

    ensure_caches(run, years, Path(corpus) if corpus else None)
    trained, same_model = train_production(run, production_model)
    built = build_real_files(run, trained, years, production_model=production_model, edge_threshold=edge_threshold, max_edges=max_edges,
                             gap_pool=gap_pool, gap_limit=gap_limit, detail_limit=detail_limit,
                             stoplist=stoplist)
    path_check = None
    if synthetic:
        # the whole path ran; keep only that fact, not its numbers
        path_check = {"ran": True, "files_built": sorted(built), "ranked_gaps": len(built["gaps.json"]["items"]),
                      "gap_details": len(built["gap-details.json"]["entries"]),
                      "concepts": len(built["concepts.json"]["entries"]),
                      "note": "counts of a synthetic dry run; structure check only, not data"}
        why = "synthetic run: " + "; ".join(reasons)
        built = {n: placeholder(n, why, True, int(n[4:-5]) if n.startswith("map-") else None) for n in built}
    files = dict(built)
    files["backtest.json"] = build_backtest(run, synthetic, hand_rows)
    files.update(build_coverage(table, info, years, synthetic, run=run,
                                join_dir=Path(join_dir) if join_dir else None, top=coverage_top))
    for name, why in STATIC_PLACEHOLDERS.items():
        files[name] = placeholder(name, why, synthetic)
    open_problems_info = None
    if open_problems_dir and not synthetic:
        open_problems_info = attach_open_problems(files, Path(open_problems_dir), final)
    titles_available = False
    if corpus and not synthetic:
        titles_available = add_titles(files, run, Path(corpus))
    files["meta.json"]["titles_available"] = titles_available
    if not titles_available:
        files["meta.json"]["titles_note"] = "paper titles are not available: the id is shown as the title"
    files["meta.json"]["year_range"] = {"min": years[0], "max": final}
    for payload in files.values():
        payload["data_label"] = data_label(run, synthetic)
    routes = build_routes(files, years, synthetic, final)
    routes["data_label"] = data_label(run, synthetic)

    clear_previous_export(out)
    paths = [write_payload(out, name, payload, synthetic) for name, payload in sorted(files.items())]
    routes_path = out / "routes.json"
    routes_path.write_text(json.dumps(clean(routes), indent=1, sort_keys=True, allow_nan=False) + "\n", encoding="utf-8")
    paths.append(routes_path)
    manifest = build_manifest(runner_metrics(run, synthetic), files=paths,
                              corpus_counts=run.manifest["corpus"]["per_year"], commit=run.manifest.get("code_commit"))
    manifest["export"] = {
        "synthetic": synthetic, "synthetic_reasons": reasons, "corpus_last_year": final, "map_years": years,
        "run_dir_config_hash": run.manifest.get("config_hash"), "corpus_sha256": run.manifest["corpus"]["sha256"],
        "production_model_equals_backtest_model": same_model,
        "production_model": production_model,
        "production_trained_on": production_trained_on(run, production_model),
        "coverage_source": "code join output (papers.csv, coverage.json)" if table is not None else None,
        "titles_available": titles_available,
        "path_check": path_check,
        "open_problems": open_problems_info,
    }
    write_json(out / "manifest.json", manifest)
    problems = validate_export(out)
    return {"synthetic": synthetic, "reasons": reasons, "out": str(out), "files": sorted(p.name for p in paths) + ["manifest.json"],
            "years": years, "same_model": same_model, "problems": problems}


# ------------------------------------------------------------------ validator

_NUM, _NUM_OR_NULL, _STR, _LIST, _DICT = "num", "num?", "str", "list", "dict"
GAP_SUMMARY = {"a": _STR, "b": _STR, "a_label": _STR, "b_label": _STR, "p_link": _NUM, "p_lo": _NUM_OR_NULL,
               "p_hi": _NUM_OR_NULL, "momentum": _NUM_OR_NULL, "novelty": _NUM_OR_NULL,
               "gap_rate": _NUM_OR_NULL, "gap_score": _NUM_OR_NULL}
PAPER = {"id": _STR, "title": _STR, "year": _NUM, "url": _STR}
CONCEPT_SUMMARY = {"id": _STR, "label": _STR}
CONCEPT_POINT = {"id": _STR, "label": _STR, "x": _NUM, "y": _NUM, "growth": _NUM_OR_NULL}
EDGE = {"source": _STR, "target": _STR, "p_link": _NUM}
HIT = {"a": _STR, "b": _STR, "score": _NUM_OR_NULL, "year": _NUM_OR_NULL}
BIN = {"predicted": _NUM, "observed": _NUM, "count": _NUM}
COVERAGE_CONCEPT = {"id": _STR, "label": _STR, "cells": _LIST}
COVERAGE_CELL = {"year": _NUM, "code_rate": _NUM_OR_NULL}
YEAR_COUNT = {"year": _NUM, "count": _NUM}


def _isnum(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _record(rec, spec: dict, where: str, errs: list[str]) -> None:
    if not isinstance(rec, dict):
        errs.append(f"{where}: expected an object")
        return
    for key, kind in spec.items():
        if key not in rec:
            errs.append(f"{where}: missing key {key!r}")
            continue
        v = rec[key]
        ok = (kind == "any" or (kind == _NUM and _isnum(v)) or (kind == _NUM_OR_NULL and (v is None or _isnum(v)))
              or (kind == _STR and isinstance(v, str)) or (kind == _LIST and isinstance(v, list))
              or (kind == _DICT and isinstance(v, dict)))
        if not ok:
            errs.append(f"{where}.{key}: wrong type {type(v).__name__}")


def _keys(payload, required, where: str, errs: list[str]) -> bool:
    if not isinstance(payload, dict):
        errs.append(f"{where}: expected an object")
        return False
    missing = sorted(set(required) - set(payload))
    if missing:
        errs.append(f"{where}: missing keys {missing}")
    return not missing


def _items(payload: dict, key: str, spec: dict, where: str, errs: list[str], limit: int = 50) -> None:
    items = payload.get(key)
    if not isinstance(items, list):
        errs.append(f"{where}.{key}: expected a list")
        return
    for k, item in enumerate(items[:limit]):  # a bounded sample of large lists keeps validation quick
        _record(item, spec, f"{where}.{key}[{k}]", errs)


def _no_interval(item, where: str, errs: list[str]) -> None:
    """Real production gaps have no uncertainty interval: p_lo and p_hi must be null."""
    if isinstance(item, dict):
        for k in ("p_lo", "p_hi"):
            if item.get(k) is not None:
                errs.append(f"{where}.{k}: must be null (the production forecast has no interval)")


OPEN_PROBLEM_TYPES = ("open_problem", "future_work", "limitation")


def _check_open_problem_items(items, where: str, errs: list[str], limit: int = OP.MAX_ITEMS) -> None:
    """The one place a quoted sentence is allowed: short, whole, typed, attributed to a linked paper."""
    if not isinstance(items, list):
        errs.append(f"{where}: items must be a list")
        return
    if len(items) > limit:
        errs.append(f"{where}: {len(items)} sentences, more than the cap of {limit}")
    for k, it in enumerate(items):
        w = f"{where}[{k}]"
        _record(it, {"sentence": _STR, "type": _STR, "confidence": _NUM_OR_NULL, "paper": _DICT, "concept_ids": _LIST}, w, errs)
        if not isinstance(it, dict):
            continue
        if isinstance(it.get("sentence"), str) and not OP.MIN_SENTENCE <= len(it["sentence"]) <= OP.MAX_SENTENCE:
            errs.append(f"{w}.sentence: {len(it['sentence'])} characters, outside {OP.MIN_SENTENCE}-{OP.MAX_SENTENCE}")
        if it.get("type") not in OPEN_PROBLEM_TYPES:
            errs.append(f"{w}.type: {it.get('type')!r} is not one of {OPEN_PROBLEM_TYPES}")
        if isinstance(it.get("paper"), dict):
            _record(it["paper"], PAPER, f"{w}.paper", errs)
            if not it["paper"].get("url"):
                errs.append(f"{w}.paper: a quoted sentence must link to its paper")


def _check_gap_detail(d: dict, where: str, errs: list[str], real: bool = False) -> None:
    if _keys(d, contract("gap-detail.json"), where, errs):
        if d["summary"] is not None:
            _record(d["summary"], GAP_SUMMARY, f"{where}.summary", errs)
            if real:
                _no_interval(d["summary"], f"{where}.summary", errs)
        for k in ("closest_a", "closest_b"):
            _items(d, k, PAPER, where, errs)
        _items(d, "shared_neighbours", CONCEPT_SUMMARY, where, errs)
        _check_open_problem_items(d["open_problems"], f"{where}.open_problems", errs, limit=OP.PER_GAP)


def _check_concept(d: dict, where: str, errs: list[str]) -> None:
    if _keys(d, contract("concept.json"), where, errs):
        _items(d, "counts_by_year", YEAR_COUNT, where, errs)
        _items(d, "top_papers", PAPER, where, errs)
        _items(d, "neighbours", CONCEPT_SUMMARY, where, errs)
        _check_open_problem_items(d["open_problems"], f"{where}.open_problems", errs, limit=OP.PER_CONCEPT)


def check_contract(name: str, payload, errs: list[str]) -> None:
    """Key sets and value types of the frontend fixtures and ``api.ts`` types for the file ``name``."""
    if name == "meta.json":
        if _keys(payload, contract("meta.json"), name, errs):
            yr = payload["year_range"]
            if yr is None:
                errs.append(f"{name}.year_range: must be {{min, max}} (the slider needs it), not null")
            else:
                _record(yr, {"min": _NUM, "max": _NUM}, f"{name}.year_range", errs)
            if not isinstance(payload["counts"], dict) or not all(v is None or _isnum(v) for v in payload["counts"].values()):
                errs.append(f"{name}.counts: values must be numbers or null")
            if not isinstance(payload["headline_metrics"], dict):
                errs.append(f"{name}.headline_metrics: expected an object")
    elif name == "backtest.json":
        base = contract("backtest.json")
        if _keys(payload, base, name, errs):
            _record(payload["code_link_evaluation"], {k: "any" for k in base["code_link_evaluation"]}, f"{name}.code_link_evaluation", errs)
            _record(payload["calibration"], {"bins": _LIST}, f"{name}.calibration", errs)
            _items(payload["calibration"], "bins", BIN, f"{name}.calibration", errs)
            _items(payload, "hits", HIT, name, errs)
            _items(payload, "misses", HIT, name, errs)
            for k in ("base_rate", "roc_auc", "pr_auc", "average_precision", "precision_at_100"):
                if not (payload[k] is None or _isnum(payload[k])):
                    errs.append(f"{name}.{k}: expected a number or null")
            for k in ("baselines", "by_starting_weight"):
                if not isinstance(payload[k], dict):
                    errs.append(f"{name}.{k}: expected an object")
    elif name.startswith("map-"):
        if _keys(payload, contract("map.json"), name, errs):
            _items(payload, "concepts", CONCEPT_POINT, name, errs)
            _items(payload, "edges", EDGE, name, errs)
            if payload["year"] != int(name[4:-5]):
                errs.append(f"{name}: year {payload['year']!r} does not match the file name")
    elif name == "gaps.json":
        if _keys(payload, contract("gaps.json"), name, errs):
            _items(payload, "items", GAP_SUMMARY, name, errs)
            if not payload["placeholder"]:
                for k, item in enumerate(payload["items"] if isinstance(payload["items"], list) else []):
                    _no_interval(item, f"{name}.items[{k}]", errs)
                for must in ("kind", "label", "held_out_test"):
                    if must not in payload:
                        errs.append(f"{name}: missing {must!r} (the production forecast must be labelled)")
                if payload.get("kind") != "production_forecast" or payload.get("held_out_test") is not False:
                    errs.append(f"{name}: must be labelled a production forecast, not the held-out test")
    elif name == "gap-details.json":
        if _keys(payload, ("entries",), name, errs):
            for key, entry in list(payload["entries"].items())[:200]:
                _check_gap_detail(entry, f"{name}[{key!r}]", errs, real=not payload.get("placeholder"))
                if isinstance(entry, dict) and isinstance(entry.get("summary"), dict):
                    s = entry["summary"]
                    if key != f"{s.get('a')}|{s.get('b')}":
                        errs.append(f"{name}[{key!r}]: key does not match its summary pair")
            for key, entry in list(payload["entries"].items())[200:]:  # the quoted sentences are checked on every entry
                if isinstance(entry, dict):
                    _check_open_problem_items(entry.get("open_problems", []), f"{name}[{key!r}].open_problems", errs,
                                              limit=OP.PER_GAP)
    elif name == "concepts.json":
        if _keys(payload, ("entries",), name, errs):
            for key, entry in list(payload["entries"].items())[:200]:
                _check_concept(entry, f"{name}[{key!r}]", errs)
            for key, entry in list(payload["entries"].items())[200:]:  # the quoted sentences are checked on every entry
                if isinstance(entry, dict):
                    _check_open_problem_items(entry.get("open_problems", []), f"{name}[{key!r}].open_problems", errs,
                                              limit=OP.PER_CONCEPT)
    elif name.startswith("coverage-"):
        base = contract("coverage.json")
        if _keys(payload, base, name, errs):
            _keys(payload["archive"], base["archive"], f"{name}.archive", errs)
            _items(payload, "concepts", COVERAGE_CONCEPT, name, errs)
            for k, c in enumerate(payload["concepts"][:20]):
                if isinstance(c, dict):
                    _items(c, "cells", COVERAGE_CELL, f"{name}.concepts[{k}]", errs)
            for k, c in enumerate(payload["concepts"][:20]):
                for cell in (c.get("cells") or [])[:20] if isinstance(c, dict) else []:
                    if "papers_without_linked_code" in cell:
                        lst = cell["papers_without_linked_code"]
                        if not isinstance(lst, list) or len(lst) > PAPERS_PER_CELL or cell.get("state") != "available":
                            errs.append(f"{name}.concepts[{k}]: papers_without_linked_code must be a list of at most "
                                        f"{PAPERS_PER_CELL} and only on available cells")
                        else:
                            _items(cell, "papers_without_linked_code", PAPER, f"{name}.concepts[{k}]", errs)
            if payload["year"] != int(name[9:-5]):
                errs.append(f"{name}: year {payload['year']!r} does not match the file name")
    elif name == "search.json":
        _keys(payload, contract("search.json"), name, errs)
    elif name == "open-problems.json":
        if _keys(payload, contract("open-problems.json"), name, errs):
            _check_open_problem_items(payload["items"], name, errs)
            if payload["items"] and (payload.get("placeholder") is not False or not payload.get("attribution")
                                     or payload.get("quality") not in ("unmeasured", "ai_labelled", "human_labelled")):
                errs.append(f"{name}: quoted sentences need placeholder false, an attribution and a quality label")
    else:
        errs.append(f"{name}: not a file of the frontend contract")


def _walk(node, where: str, errs: list[str], key: str | None = None, synthetic: bool = False) -> None:
    """NaN/inf, abstract-text keys, over-long strings, and (synthetic) any number that is not a year."""
    if isinstance(node, dict):
        for k, v in node.items():
            if k in FORBIDDEN_KEYS:
                errs.append(f"{where}: forbidden key {k!r} (abstract text)")
            _walk(v, f"{where}.{k}", errs, k, synthetic)
    elif isinstance(node, list):
        for k, v in enumerate(node):
            _walk(v, f"{where}[{k}]", errs, key, synthetic)
    elif isinstance(node, bool) or node is None:
        return
    elif isinstance(node, (int, float)):
        if isinstance(node, float) and not math.isfinite(node):
            errs.append(f"{where}: non-finite number")
        elif synthetic and key not in SYNTHETIC_NUMBER_KEYS:
            errs.append(f"{where}: a synthetic file carries the number {node!r}")
    elif isinstance(node, str) and len(node) > MAX_STRING:
        errs.append(f"{where}: string of {len(node)} characters (possible pasted text)")


def _load_strict(path: Path):
    def reject(const):
        raise ValueError(f"non-finite constant {const}")

    return json.loads(path.read_text(encoding="utf-8"), parse_constant=reject)


REQUIRED_ROUTES = ("/api/meta", "/api/backtest", "/api/gaps", "/api/gap/{a}/{b}", "/api/concept/{id}",
                   "/api/open-problems")


def validate_export(directory: str | Path) -> list[str]:
    """Problems found in an export directory (empty list: valid).

    Checks ``routes.json`` resolves to existing files (and keys), strict JSON with no NaN, the key sets and
    value types of the frontend fixtures and types, no abstract text, placeholder/synthetic consistency
    (a synthetic export is all placeholders with no numbers but years), and the production-forecast label.
    """
    d = Path(directory)
    errs: list[str] = []
    try:
        routes_doc = _load_strict(d / "routes.json")
    except (OSError, ValueError) as exc:
        return [f"routes.json: cannot read ({exc})"]
    routes = routes_doc.get("routes") if isinstance(routes_doc, dict) else None
    if not isinstance(routes, list) or not routes:
        return ["routes.json: no routes listed"]
    synthetic = routes_doc.get("synthetic")
    if not isinstance(synthetic, bool):
        errs.append("routes.json: 'synthetic' must be true or false")
        synthetic = False
    if (routes_doc.get("data_label") == "real") == synthetic:
        errs.append(f"routes.json: data_label {routes_doc.get('data_label')!r} disagrees with synthetic={synthetic}")
    templates = {r.get("route", "").split("?")[0] for r in routes if isinstance(r, dict)}
    for need in REQUIRED_ROUTES + ("/api/search", "/api/map", "/api/coverage"):
        if need not in templates:
            errs.append(f"routes.json: no route for {need}")
    years = {"map": set(), "coverage": set()}
    seen: dict[str, object] = {}
    for r in routes:
        if not isinstance(r, dict) or not all(k in r for k in ("route", "file", "kind", "status")):
            errs.append(f"routes.json: malformed route entry {r!r}")
            continue
        name = r["file"]
        path = d / name
        if name not in seen:
            if not path.is_file():
                errs.append(f"{r['route']}: file {name} does not exist")
                seen[name] = None
                continue
            try:
                seen[name] = _load_strict(path)
            except (OSError, ValueError) as exc:
                errs.append(f"{name}: invalid JSON ({exc})")
                seen[name] = None
                continue
        payload = seen[name]
        if payload is None:
            continue
        if r["status"] not in ("real", "placeholder"):
            errs.append(f"{r['route']}: status must be 'real' or 'placeholder'")
        elif (r["status"] == "placeholder") != (payload.get("placeholder") is True):
            errs.append(f"{r['route']}: status {r['status']!r} disagrees with the file's placeholder flag")
        if r["kind"] == "keyed" and not isinstance(payload.get("entries"), dict):
            errs.append(f"{r['route']}: {name} has no 'entries' object")
        if r["kind"] == "by_year":
            kind = "map" if name.startswith("map-") else "coverage"
            years[kind].add(r.get("year"))
            if payload.get("year") != r.get("year"):
                errs.append(f"{r['route']}: {name} is for year {payload.get('year')!r}")
    if years["map"] != years["coverage"]:
        errs.append("routes.json: map years and coverage years differ")
    for name, payload in seen.items():
        if payload is None:
            continue
        if not isinstance(payload, dict):
            errs.append(f"{name}: expected an object")
            continue
        for flag in ("placeholder", "synthetic"):
            if not isinstance(payload.get(flag), bool):
                errs.append(f"{name}: missing boolean {flag!r}")
        if payload.get("data_label") != routes_doc.get("data_label"):
            errs.append(f"{name}: data_label {payload.get('data_label')!r} differs from routes.json")
        if synthetic and not (payload.get("placeholder") is True and payload.get("synthetic") is True):
            errs.append(f"{name}: the export is synthetic, so every file must be a synthetic placeholder")
        if payload.get("synthetic") is True and payload.get("placeholder") is False:
            errs.append(f"{name}: synthetic but not a placeholder")
        if not synthetic and payload.get("synthetic") is True and payload.get("placeholder") is not True:
            errs.append(f"{name}: synthetic content in a real export")
        check_contract(name, payload, errs)
        _walk(payload, name, errs, synthetic=synthetic)
    meta = seen.get("meta.json")
    mys = routes_doc.get("map_years")
    if isinstance(meta, dict) and isinstance(meta.get("year_range"), dict) and isinstance(mys, list) and mys:
        if meta["year_range"] != {"min": min(mys), "max": max(mys)}:
            errs.append("meta.json: year_range differs from routes.json map_years")
    manifest_path = d / "manifest.json"
    if manifest_path.exists():
        try:
            man = _load_strict(manifest_path)
            _walk(man, "manifest.json", errs)
            if man.get("synthetic") != synthetic:
                errs.append("manifest.json: synthetic flag differs from routes.json")
        except (OSError, ValueError) as exc:
            errs.append(f"manifest.json: invalid JSON ({exc})")
    else:
        errs.append("manifest.json: missing")
    return errs


# ------------------------------------------------------------------ CLI


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Write all frontend files from a run_real run directory (issue #175)")
    ap.add_argument("run_dir", type=Path, help="run_real output directory (run_manifest.json, metrics.json, cache/)")
    ap.add_argument("--out", type=Path, required=True, help="export directory (routes.json lists the files)")
    ap.add_argument("--join-dir", type=Path, help="code_join_local output directory (coverage.json, report.json, "
                                                  "handcheck_frame.csv); without it coverage files are placeholders")
    ap.add_argument("--corpus", type=Path, help="corpus.jsonl: paper titles and links for the papers in the outputs, and the source for "
                                                  "origin caches the run did not build (caches fall back to the run's path)")
    ap.add_argument("--coverage-top", type=int, default=COVERAGE_TOP, help="phrase concepts per coverage file")
    ap.add_argument("--production-model", choices=PRODUCTION_MODELS, default="through-2020",
                    help="model behind gaps.json: through-2020 (fit 2010-14 and 2017, calibrated at the 2020 test "
                         "origin, trained after the test was scored) or frozen (the backtest model, the fallback)")
    ap.add_argument("--first-year", type=int, default=FIRST_YEAR)
    ap.add_argument("--last-year", type=int, default=None,
                    help="stop the export at this year (maps, gaps snapshot, coverage); later corpus records are "
                         "excluded and counted in meta.json. Default: the corpus end")
    ap.add_argument("--edge-threshold", type=float, default=EDGE_THRESHOLD)
    ap.add_argument("--max-edges", type=int, default=MAX_EDGES)
    ap.add_argument("--gap-pool", type=int, default=GAP_POOL)
    ap.add_argument("--gap-limit", type=int, default=GAP_LIMIT)
    ap.add_argument("--detail-limit", type=int, default=DETAIL_LIMIT)
    ap.add_argument("--open-problems", type=Path, help="open_problems.py cache directory (hits.jsonl, counts.json); "
                    "fills open-problems.json and the open_problems of gap details and concepts")
    ap.add_argument("--no-stoplist", action="store_true",
                    help="do not hide generic filler phrases (GENERIC_PHRASES) from the production gap list")
    args = ap.parse_args(argv)
    try:
        result = export_run(args.run_dir, args.out, corpus=args.corpus, join_dir=args.join_dir,
                            first_year=args.first_year, last_year=args.last_year, edge_threshold=args.edge_threshold, max_edges=args.max_edges,
                            gap_pool=args.gap_pool, gap_limit=args.gap_limit, detail_limit=args.detail_limit,
                            coverage_top=args.coverage_top, production_model=args.production_model,
                            stoplist=None if args.no_stoplist else GENERIC_PHRASES,
                            open_problems_dir=args.open_problems)
    except (ExportError, R.RunError, ValueError, backtest.OneShotError) as exc:
        print(f"export failed: {exc}", file=sys.stderr)
        return 2
    print(f"{'SYNTHETIC (all placeholders)' if result['synthetic'] else 'real'} export to {result['out']}: "
          f"{len(result['files'])} files, map years {result['years'][0]}..{result['years'][-1]}")
    if args.production_model == "frozen" and not result["same_model"]:
        print("warning: the re-trained model's coefficients differ from the run's recorded ones", file=sys.stderr)
    if result["problems"]:
        print(f"validation FAILED ({len(result['problems'])} problems):", file=sys.stderr)
        for p in result["problems"]:
            print(f"  - {p}", file=sys.stderr)
        return 1
    print("validation OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
