"""Export the backtest runner's ``metrics`` dict as the frontend's ``BacktestResponse`` (issue #161).

The contract is the frontend's own (``whitespace/web/src/api.ts`` and ``mock/backtest.json``
on PR #159). Pure functions plus two small writers; no network.

Honesty rules
* Numbers come only from a supplied ``metrics`` dict; nothing is estimated or filled in.
  Where the runner has no number (``pr_auc``, the ``cosine`` baseline) the field is ``null``.
* A run is presentable as a real result only when ``manifest.data_label == "real"`` and it has
  no synthetic ``generator``. Anything else (synthetic, unspecified, empty) returns the
  placeholder shape: every number ``null``, ``placeholder: true``, ``synthetic`` set, no hits.
  Synthetic numbers are never copied into a demo-facing file.
* NaN and infinity become ``null``. No abstract text is ever written.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import math
import platform
import subprocess
from importlib import metadata
from pathlib import Path

import numpy as np

from .backtest import is_real_run
from .common import HORIZON_YEARS, LINK_THRESHOLD, Work
from .graphs import PairSet

N_HITS, N_MISSES = 20, 10
STRATA = ("all", "0", "1", "2")
# Frontend ``BaselineName`` values. The runner also scores common_neighbours and jaccard; they
# are left out because the frontend type does not list them. ``cosine`` waits on embeddings.
BASELINES = ("current_weight", "degree_product", "preferential_attachment", "adamic_adar", "cosine")
RANKING_KEYS = ("roc_auc", "pr_auc", "average_precision", "precision_at_100")
EMPTY_CODE_LINK = {
    "precision": None, "lower": None, "upper": None, "interval_method": None,
    "sample_size": None, "correct_matches": None, "sample_composition": None, "protocol": None,
}
_FORBIDDEN_KEYS = {"abstract", "abstract_excerpt", "abstract_inverted_index"}
ANNUAL_NOTE = (
    "Only annual counts are available for these pairs: the year is not given and no event time "
    "is implied. A pair counts as a hit if it reached the link threshold within the label window."
)
YEAR_NOTE = (
    "Year is the calendar year of the work that took the pair to the link threshold, from work "
    "dates (arXiv-id month where available)."
)


# ---------------------------------------------------------------- cleaning


def clean(value):
    """JSON-safe copy: numpy to Python, NaN and infinity to ``None``, abstract keys dropped."""
    if isinstance(value, dict):
        return {str(k): clean(v) for k, v in value.items() if str(k) not in _FORBIDDEN_KEYS}
    if isinstance(value, (list, tuple)):
        return [clean(v) for v in value]
    if isinstance(value, np.ndarray):
        return clean(value.tolist())
    if isinstance(value, np.generic):
        return clean(value.item())
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    return value


def run_label(metrics: dict | None) -> tuple[str, bool]:
    """``(data_label, synthetic)`` for a run: a generator or the label ``synthetic`` means synthetic;
    anything not exactly ``real`` or ``synthetic`` (including missing) is ``unlabelled``."""
    man = (metrics or {}).get("manifest") or {}
    if man.get("generator") or man.get("data_label") == "synthetic":
        return "synthetic", True
    return ("real" if man.get("data_label") == "real" else "unlabelled"), False


def _is_real(metrics: dict | None) -> bool:
    """Real only when ``backtest.is_real_run(manifest)`` says so and test results exist."""
    return bool(metrics and metrics.get("test")) and is_real_run(metrics.get("manifest") or {})


# ---------------------------------------------------------------- metrics conversion


def _number(block: dict | None, key: str):
    if not block or "undefined" in block:
        return None
    v = block.get(key)
    return clean(v) if isinstance(v, (int, float, np.generic)) else None


def _ranking(block: dict | None, baselines: dict[str, dict | None]) -> dict:
    """One ``RankingMetrics`` object from a model metric block and per-baseline blocks."""
    def four(b):
        return {
            "roc_auc": _number(b, "roc_auc"),
            "pr_auc": None,  # the runner reports average precision; no separate PR-AUC exists
            "average_precision": _number(b, "average_precision"),
            "precision_at_100": _number(b, "precision_at_100"),
        }
    return {
        "base_rate": _number(block, "base_rate"),
        **four(block),
        "baselines": {name: four(b) for name, b in baselines.items() if b is not None},
    }


def calibration_bins(cal: dict | None) -> dict:
    """Runner calibration dict to ``{bins: [{predicted, observed, count}], note}``. Empty bins are dropped."""
    if not cal or "undefined" in cal:
        reason = (cal or {}).get("undefined", "not available")
        return {"bins": [], "note": f"Calibration undefined: {reason}"}
    bins = []
    for n, p, o in zip(cal["bin_count"], cal["mean_predicted"], cal["observed_rate"]):
        p, o = clean(float(p)), clean(float(o))
        if int(n) > 0 and p is not None and o is not None:
            bins.append({"predicted": p, "observed": o, "count": int(n)})
    parts = ["Platt-calibrated probabilities on the test origin; empty bins omitted"]
    for key, label in (("brier", "Brier"), ("brier_skill", "Brier skill"), ("ece", "ECE")):
        v = clean(cal.get(key))
        if v is not None:
            parts.append(f"{label} {v:.4f}")
    return {"bins": bins, "note": "; ".join(parts)}


def placeholder_response(note: str, synthetic: bool = False, meta: dict | None = None,
                         data_label: str = "unlabelled") -> dict:
    """The frontend's empty fixture shape, ``placeholder: true``, every number ``null``."""
    return clean({
        "placeholder": True, "synthetic": synthetic, "data_label": data_label,
        "base_rate": None, "roc_auc": None, "pr_auc": None, "average_precision": None,
        "precision_at_100": None, "baselines": {}, "by_starting_weight": {},
        "calibration": {"bins": [], "note": note}, "hits": [], "misses": [],
        "hits_note": None, "code_link_evaluation": dict(EMPTY_CODE_LINK),
        "meta": dict(meta or {}),
    })


def to_backtest_response(
    metrics: dict | None,
    hits: list[dict] | None,
    misses: list[dict] | None,
    code_link_evaluation: dict | None = None,
    meta: dict | None = None,
    origin: int | None = None,
) -> dict:
    """Build a ``BacktestResponse`` dict from the runner's ``metrics`` dict.

    ``meta`` may carry ``hits_note`` (from ``select_hits_misses``) and any extra provenance;
    it is copied to the ``meta`` key (``hits_note`` also to the top level). ``origin`` picks
    the test origin (default: the latest). Synthetic, unlabelled or empty runs return the
    placeholder shape with ``synthetic`` set and no hits, misses or numbers.
    """
    meta = dict(meta or {})
    man = (metrics or {}).get("manifest") or {}
    label, synthetic = run_label(metrics)
    if not _is_real(metrics):
        why = ("SYNTHETIC run: numbers withheld" if synthetic else
               "unlabelled or empty run: no real result supplied, numbers withheld")
        return placeholder_response(why, synthetic, meta, label)

    tests = metrics["test"]
    key = str(origin if origin is not None else max(int(o) for o in tests))
    if key not in tests:
        raise ValueError(f"test origin {key} not in metrics (have {sorted(tests)})")
    t = tests[key]
    model = t.get("model", {})
    base = t.get("baselines", {})
    by_weight = {
        s: _ranking(model.get(s), {b: base.get(b, {}).get(s) for b in BASELINES if b in base})
        for s in STRATA if s in model
    }
    top = by_weight.get("all") or _ranking(None, {})
    code_link = dict(EMPTY_CODE_LINK)
    if code_link_evaluation is not None:
        unknown = set(code_link_evaluation) - set(EMPTY_CODE_LINK)
        if unknown:
            raise ValueError(f"unknown code_link_evaluation keys: {sorted(unknown)}")
        code_link.update(code_link_evaluation)
    out = {
        "placeholder": False, "synthetic": False, "data_label": "real",
        "base_rate": top["base_rate"], "roc_auc": top["roc_auc"], "pr_auc": top["pr_auc"],
        "average_precision": top["average_precision"], "precision_at_100": top["precision_at_100"],
        "baselines": top["baselines"],
        "by_starting_weight": by_weight,
        "calibration": calibration_bins(t.get("calibration")),
        "hits": list(hits or []), "misses": list(misses or []),
        "hits_note": meta.get("hits_note"),
        "code_link_evaluation": code_link,
        "meta": {"test_origin": int(key), "config_hash": man.get("config_hash"),
                 "data_label": "real", **meta},
    }
    return clean(out)


# ---------------------------------------------------------------- hits and misses


def crossing_years(
    works: list[Work], pairs: list[tuple[str, str]], threshold: int = LINK_THRESHOLD
) -> dict[tuple[str, str], int]:
    """Year each pair reached ``threshold`` co-occurring distinct works (date order), for the given pairs only."""
    want = {tuple(sorted(p)) for p in pairs}
    dates: dict[tuple[str, str], list[dt.date]] = {p: [] for p in want}
    seen: set[str] = set()
    for w in works:
        if w.id in seen:
            continue
        seen.add(w.id)
        cs = set(w.concepts)
        for a, b in want:
            if a in cs and b in cs:
                dates[(a, b)].append(w.date)
    return {p: sorted(d)[threshold - 1].year for p, d in dates.items() if len(d) >= threshold}


def select_hits_misses(
    scores,
    y,
    pairs: PairSet,
    *,
    n_hits: int = N_HITS,
    n_misses: int = N_MISSES,
    works: list[Work] | None = None,
    horizon: int = HORIZON_YEARS,
    origin: int | None = None,
) -> tuple[list[dict], list[dict], str]:
    """Top hits and misses on one test origin, aligned with ``pairs``.

    ``scores`` are the numbers to show and rank by (higher is better; use the calibrated
    probability, which ranks the same as the model's log-odds). Hits are the best-ranked pairs
    that crossed the threshold (``y`` true); misses are the best-ranked pairs that did not.
    Ties keep pair order (stable). With ``works`` (and ``origin``) the year a hit crossed the
    threshold is added; otherwise ``year`` is ``None`` and the returned note says only annual
    counts exist, so no event time is implied. Misses never get a year.
    Returns ``(hits, misses, note)``.
    """
    scores, y = np.asarray(scores, float), np.asarray(y, bool)
    if not len(scores) == len(y) == len(pairs):
        raise ValueError("scores, labels and pairs must be the same length")
    order = np.argsort(-np.nan_to_num(scores, nan=-np.inf), kind="stable")
    hit_idx = order[y[order]][:n_hits]
    miss_idx = order[~y[order]][:n_misses]

    def key(k):
        return pairs.names[int(pairs.i[k])], pairs.names[int(pairs.j[k])]

    years: dict = {}
    if works is not None and origin is not None:
        wins = [w for w in works if w.date.year <= origin + horizon]
        years = crossing_years(wins, [key(k) for k in hit_idx])

    def row(k, with_year):
        a, b = key(k)
        s = float(scores[k])
        return {"a": a, "b": b, "score": s if math.isfinite(s) else None,
                "year": years.get((a, b)) if with_year else None,
                "starting_weight": int(pairs.weight[k])}

    hits = [row(k, True) for k in hit_idx]
    misses = [row(k, False) for k in miss_idx]
    note = YEAR_NOTE if years and all(h["year"] is not None for h in hits) else ANNUAL_NOTE
    return hits, misses, note


# ---------------------------------------------------------------- writers


def write_json(path: str | Path, data: dict) -> None:
    """Write ``data`` (already cleaned) as strict JSON; NaN cannot be written."""
    Path(path).write_text(json.dumps(clean(data), indent=2, allow_nan=False) + "\n", encoding="utf-8")


def write_backtest_json(path: str | Path, response: dict) -> None:
    """Write a response. Refuses a ``placeholder: false`` response that is marked synthetic."""
    if response.get("synthetic") and not response.get("placeholder", True):
        raise ValueError("refusing to write a synthetic run as a non-placeholder result")
    write_json(path, response)


def sha256_file(path: str | Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _commit() -> str | None:
    try:
        out = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, timeout=10)
        return out.stdout.strip() or None if out.returncode == 0 else None
    except (OSError, subprocess.SubprocessError):
        return None


def _versions(names=("numpy", "pytest")) -> dict:
    out = {"python": platform.python_version()}
    for n in names:
        try:
            out[n] = metadata.version(n)
        except metadata.PackageNotFoundError:
            out[n] = None
    return out


def build_manifest(
    metrics: dict | None,
    *,
    corpus_query: str | None = None,
    corpus_counts: dict | None = None,
    retrieved_at: str | None = None,
    topic_vintage: str | None = None,
    files: list[str | Path] | None = None,
    commit: str | None = None,
) -> dict:
    """Run manifest: corpus, split, seeds, config hash, code commit, versions, hashed files.

    Unknown values stay ``None``; nothing is guessed. ``synthetic`` mirrors the response label.
    """
    man = (metrics or {}).get("manifest") or {}
    return clean({
        "synthetic": run_label(metrics)[1],
        "real_run": _is_real(metrics),
        "data_label": run_label(metrics)[0],
        "corpus": {"query": corpus_query, "counts": corpus_counts, "retrieved_at": retrieved_at,
                   "topic_assignment_vintage": topic_vintage, "n_works": man.get("n_works")},
        "origins": {"fit": man.get("fit_origins"), "calibration": man.get("calibration_origins"),
                    "test": man.get("test_origins")},
        "seed": man.get("seed"), "config": man.get("config"), "config_hash": man.get("config_hash"),
        "link_threshold": man.get("link_threshold"),
        "code_commit": commit if commit is not None else _commit(),
        "library_versions": _versions(),
        "files": {Path(f).name: sha256_file(f) for f in (files or [])},
    })


def write_manifest(path: str | Path, metrics: dict | None, **kwargs) -> dict:
    """Build and write ``manifest.json``; returns the manifest."""
    manifest = build_manifest(metrics, **kwargs)
    write_json(path, manifest)
    return manifest
