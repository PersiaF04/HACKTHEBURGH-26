"""Real-data run script: ingest ``corpus.jsonl`` -> per-origin vocabularies -> purged backtest (issue #164).

Flow (``run``):

1. Scan ``corpus.jsonl`` once, streaming: sha256, records per year. Fail early, with a clear
   message, if a year the split needs (first fit origin .. last test origin + horizon) has no works.
2. For every origin ``T`` build a cache under ``<out>/cache/origin_<T>/``: the vocabulary is chosen by
   ``concepts.select_vocabulary`` from works dated <= 31 Dec ``T`` only (streaming counts), then
   every work dated <= 31 Dec ``T + horizon`` gets its ``concepts`` from vocabulary ``T``. Works are
   stored without text (id, date, concepts). A rerun with the same corpus hash and settings reuses
   the cache and recounts nothing.
3. ``backtest.run_backtest`` with ``works_for_origin(T)`` reading that cache, so each origin has
   its own concept universe. The one-shot ledger lives in ``<out>/one_shot.json``.
4. Write ``metrics.json`` (raw runner output) and ``run_manifest.json``.

``corpus.jsonl`` is the format written by ``ingest.build_corpus``: one JSON object per line with at
least ``id``, ``date`` (ISO) and ``title``/``abstract``. The corpus is never loaded whole; text is
never printed, logged or written to any output (only ids, dates, counts and concept phrases).

``--dry-run`` writes a tiny synthetic corpus in that format (made-up words, not data) and runs the
whole pipeline on it with small settings; its metrics say nothing about real literature.
``--caches-only`` stops after step 2 (speed and sanity checks without scoring anything).
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import logging
import platform
import subprocess
import sys
import time
from collections import Counter
from collections.abc import Iterator
from dataclasses import asdict, dataclass, field
from pathlib import Path

import numpy as np

from . import backtest
from .common import HORIZON_YEARS, LINK_THRESHOLD, MIN_PAPERS, Work, assert_purged
from .concepts import CEILING_FRACTION, MAX_CONCEPTS, extract_phrases, select_vocabulary
from .export_backtest import select_hits_misses

log = logging.getLogger("whitespace.run_real")

CACHE_VERSION = 1
DEFAULT_OUT = Path.home() / "whitespace-run"


class RunError(RuntimeError):
    """The run cannot proceed; the message says why (never contains paper text)."""


@dataclass(frozen=True)
class RunConfig:
    fit_origins: tuple[int, ...] = (2010, 2011, 2012, 2013, 2014)
    calibration_origins: tuple[int, ...] = (2017,)
    test_origins: tuple[int, ...] = (2020,)
    n_min: int = MIN_PAPERS
    max_concepts: int = MAX_CONCEPTS
    ceiling_fraction: float = CEILING_FRACTION
    horizon: int = HORIZON_YEARS
    link_threshold: int = LINK_THRESHOLD
    seed: int = 0
    n_boot: int = 200

    def origins(self) -> list[int]:
        return sorted({*self.fit_origins, *self.calibration_origins, *self.test_origins})

    def backtest_config(self) -> backtest.BacktestConfig:
        return backtest.BacktestConfig(
            self.fit_origins, self.calibration_origins, self.test_origins,
            seed=self.seed, n_min=self.n_min, horizon=self.horizon, n_boot=self.n_boot,
        )

    def hash(self) -> str:
        return hashlib.sha256(json.dumps(asdict(self), sort_keys=True).encode()).hexdigest()


# ---------------------------------------------------------------- resources


def peak_memory_mb() -> float | None:
    """Peak resident memory of this process in MB (None when the platform gives no way to read it)."""
    try:
        if sys.platform == "win32":
            import ctypes
            from ctypes import wintypes

            class Counters(ctypes.Structure):
                _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD)] + [
                    (n, ctypes.c_size_t) for n in (
                        "PeakWorkingSetSize", "WorkingSetSize", "QuotaPeakPagedPoolUsage",
                        "QuotaPagedPoolUsage", "QuotaPeakNonPagedPoolUsage", "QuotaNonPagedPoolUsage",
                        "PagefileUsage", "PeakPagefileUsage")]

            c = Counters()
            c.cb = ctypes.sizeof(c)
            proc = ctypes.windll.kernel32.GetCurrentProcess()
            ok = ctypes.windll.psapi.GetProcessMemoryInfo(
                ctypes.c_void_p(proc), ctypes.byref(c), c.cb)
            return round(c.PeakWorkingSetSize / 2**20, 1) if ok else None
        import resource

        peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        return round(peak / (2**20 if sys.platform == "darwin" else 2**10), 1)
    except Exception:  # noqa: BLE001 - diagnostics only
        return None


@dataclass
class Stages:
    """Wall time and peak memory after each stage."""

    rows: list[dict] = field(default_factory=list)

    def run(self, name: str, fn, *args, **kwargs):
        t0 = time.perf_counter()
        out = fn(*args, **kwargs)
        row = {"stage": name, "seconds": round(time.perf_counter() - t0, 2), "peak_memory_mb": peak_memory_mb()}
        self.rows.append(row)
        log.info("stage %-28s %8.1f s   peak memory %s MB", name, row["seconds"], row["peak_memory_mb"])
        return out


# ---------------------------------------------------------------- corpus (streamed)


def _lines(path: Path) -> Iterator[tuple[int, bytes]]:
    with open(path, "rb") as f:
        for n, line in enumerate(f, 1):
            if line.strip():
                yield n, line


def _record(n: int, line: bytes) -> dict:
    try:
        rec = json.loads(line)
        rec["id"], rec["date"]  # noqa: B018 - required keys
        return rec
    except (ValueError, KeyError, TypeError):
        raise RunError(f"corpus line {n} is not a JSON object with 'id' and 'date'") from None


def doc_source(path: Path):
    """Re-iterable source of ``(date, "title abstract")`` for ``select_vocabulary`` (streams the file)."""

    def source() -> Iterator[tuple[dt.date, str]]:
        for n, line in _lines(path):
            rec = _record(n, line)
            yield dt.date.fromisoformat(rec["date"]), f"{rec.get('title') or ''} {rec.get('abstract') or ''}"

    return source


def scan_corpus(path: Path) -> dict:
    """One streaming pass: sha256 of the file, bytes, records per year."""
    if not path.exists():
        raise RunError(f"corpus file not found: {path}")
    sha = hashlib.sha256()
    per_year: Counter[int] = Counter()
    n = 0
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            sha.update(chunk)
    for ln, line in _lines(path):
        try:
            per_year[dt.date.fromisoformat(_record(ln, line)["date"]).year] += 1
        except ValueError:
            raise RunError(f"corpus line {ln} has an unreadable date") from None
        n += 1
    return {"path": str(path), "sha256": sha.hexdigest(), "bytes": path.stat().st_size,
            "records": n, "per_year": {str(y): per_year[y] for y in sorted(per_year)}}


def check_years(corpus: dict, config: RunConfig, origins: list[int] | None = None) -> None:
    """Fail early when a year the split needs has no works (first origin .. last origin + horizon)."""
    full = origins is None
    origins = origins or config.origins()
    need = range(min(origins), max(origins) + (config.horizon if full else 0) + 1)
    missing = [y for y in need if corpus["per_year"].get(str(y), 0) == 0]
    if missing:
        raise RunError(
            f"corpus has no works in year(s) {missing}, which the split needs "
            f"({need.start}..{need.stop - 1}); finish the download and rebuild the corpus"
        )


# ---------------------------------------------------------------- per-origin cache


def origin_dir(out: Path, origin: int) -> Path:
    return out / "cache" / f"origin_{origin}"


def cache_key(corpus_sha: str, config: RunConfig, origin: int) -> str:
    payload = [CACHE_VERSION, corpus_sha, origin, config.n_min, config.max_concepts,
               config.ceiling_fraction, config.horizon]
    return hashlib.sha256(json.dumps(payload).encode()).hexdigest()


def _cache_ok(d: Path, key: str) -> dict | None:
    meta = d / "meta.json"
    if meta.exists():
        m = json.loads(meta.read_text(encoding="utf-8"))
        if m.get("key") == key and (d / "works.jsonl").exists():
            return m
    return None


def build_caches(corpus: Path, info: dict, config: RunConfig, out: Path, origins: list[int]) -> dict[int, dict]:
    """Vocabulary and concept-assigned works per origin, cached on disk. Returns a report per origin."""
    source = doc_source(corpus)
    per_year = {int(y): n for y, n in info["per_year"].items()}
    reports: dict[int, dict] = {}
    todo: dict[int, frozenset[str]] = {}
    for origin in origins:
        d = origin_dir(out, origin)
        key = cache_key(info["sha256"], config, origin)
        hit = _cache_ok(d, key)
        if hit:
            log.info("origin %d: cache hit (vocabulary %d)", origin, hit["vocabulary_size"])
            reports[origin] = {**hit["report"], "cache": "hit"}
            continue
        n_at = sum(n for y, n in per_year.items() if y <= origin)
        report = {"origin": origin, "works_at_origin": n_at, "cache": "built"}
        reports[origin] = report
        if n_at < config.n_min:
            report["status"] = "too_few_works"
            continue
        t0 = time.perf_counter()
        vocab = select_vocabulary(source, origin, config.max_concepts,
                                  min_papers=config.n_min, ceiling_fraction=config.ceiling_fraction)
        report["vocabulary_size"] = len(vocab)
        report["vocabulary_seconds"] = round(time.perf_counter() - t0, 1)
        if len(vocab) < 2:
            report["status"] = "empty_vocabulary"
            continue
        report["status"] = "ok"
        d.mkdir(parents=True, exist_ok=True)
        (d / "vocabulary.json").write_text(json.dumps(sorted(vocab)), encoding="utf-8")
        log.info("origin %d: %d works at origin, vocabulary %d (%.1f s)", origin, n_at, len(vocab),
                 report["vocabulary_seconds"])
        todo[origin] = vocab
    bad = {o: r["status"] for o, r in reports.items() if r.get("status") in ("too_few_works", "empty_vocabulary")}
    if bad:
        raise RunError("origins without enough data: " + ", ".join(f"{o} ({s})" for o, s in bad.items()))
    if todo:
        _assign_all(corpus, config, out, todo, reports, info["sha256"])
    return reports


def _assign_all(corpus: Path, config: RunConfig, out: Path, todo: dict[int, frozenset[str]],
                reports: dict[int, dict], corpus_sha: str) -> None:
    """One pass over the corpus: phrases are extracted once per work and matched to every origin's vocabulary."""
    ends = {o: dt.date(o + config.horizon, 12, 31) for o in todo}
    files = {o: open(origin_dir(out, o) / "works.jsonl.tmp", "w", encoding="utf-8") for o in todo}
    counts = Counter()
    empty = Counter()
    ids: dict[int, set[str]] = {o: set() for o in todo}
    n = {o: 0 for o in todo}
    t0 = time.perf_counter()
    try:
        for ln, line in _lines(corpus):
            rec = _record(ln, line)
            date = dt.date.fromisoformat(rec["date"])
            wanted = [o for o in todo if date <= ends[o]]
            if not wanted:
                continue
            phrases = extract_phrases(f"{rec.get('title') or ''} {rec.get('abstract') or ''}")
            for o in wanted:
                found = sorted(phrases & todo[o])
                files[o].write(json.dumps([rec["id"], rec["date"], found]) + "\n")
                n[o] += 1
                if not found:
                    empty[o] += 1
    finally:
        for f in files.values():
            f.close()
    secs = round(time.perf_counter() - t0, 1)
    for o in todo:
        d = origin_dir(out, o)
        (d / "works.jsonl.tmp").replace(d / "works.jsonl")
        r = reports[o]
        r.update(works_to_horizon=n[o], works_without_concepts=empty[o], assign_seconds=secs)
        meta = {"key": cache_key(corpus_sha, config, o), "vocabulary_size": r["vocabulary_size"], "report": r}
        (d / "meta.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
        log.info("origin %d: %d works to %d, %d without any concept", o, n[o], o + config.horizon, empty[o])


def load_works(out: Path, origin: int) -> list[Work]:
    """The origin's cached works (dated <= 31 Dec T+horizon), concepts from vocabulary T."""
    works = []
    with open(origin_dir(out, origin) / "works.jsonl", encoding="utf-8") as f:
        for line in f:
            wid, date, concepts = json.loads(line)
            works.append(Work(wid, dt.date.fromisoformat(date), tuple(concepts)))
    return works


# ---------------------------------------------------------------- synthetic corpus (--dry-run)

_SYL = ["ba", "ko", "ri", "tu", "me", "sa", "no", "li", "pe", "dun", "vor", "gal", "zem", "hin", "qua"]


def write_synthetic_corpus(path: Path, first_year: int = 2010, last_year: int = 2020, seed: int = 0,
                           n_words: int = 40, per_year: int = 300) -> None:
    """Tiny corpus in the ingest's line format. Made-up words, one per sentence so each is a concept.
    Topic papers draw from one topic's words; a share of them grows over time. NOT data."""
    rng = np.random.default_rng(seed)
    words = sorted({"".join(rng.choice(_SYL, 3)) + "x" for _ in range(n_words * 3)})[:n_words]
    topics = np.array_split(np.arange(n_words), 5)
    with open(path, "w", encoding="utf-8") as f:
        for year in range(first_year, last_year + 1):
            t = year - first_year
            for k in range(int(per_year * 1.1**t)):
                if rng.random() < min(0.8, 0.3 + 0.05 * t):
                    pool = topics[int(rng.integers(0, 2)) if rng.random() < 0.6 else int(rng.integers(0, 5))]
                else:
                    pool = np.arange(n_words)
                picked = rng.choice(pool, 3, replace=False)
                text = ". ".join(words[i] for i in picked) + "."
                date = dt.date(year, int(rng.integers(1, 13)), 1).isoformat()
                rec = {"id": f"W{year}_{k:05d}", "arxiv_id": None, "year": year, "date": date,
                       "title": text, "abstract": text, "cites": 0, "keywords": [], "topic_id": None,
                       "type": "preprint"}
                f.write(json.dumps(rec, sort_keys=True) + "\n")


DRY_RUN_CONFIG = RunConfig(fit_origins=(2010, 2011), calibration_origins=(2014,), test_origins=(2017,),
                           n_min=5, max_concepts=40, ceiling_fraction=1.0, n_boot=20)


# ---------------------------------------------------------------- run


def _git_commit() -> str:
    try:
        root = Path(__file__).resolve().parents[2]
        head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=root, capture_output=True, text=True, check=True).stdout.strip()
        dirty = bool(subprocess.run(["git", "status", "--porcelain", "--", "whitespace"], cwd=root,
                                    capture_output=True, text=True, check=True).stdout.strip())
        return head + ("+dirty" if dirty else "")
    except Exception:  # noqa: BLE001
        return "unknown"


def _write_manifest(out: Path, manifest: dict) -> None:
    (out / "run_manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")


def _examples(out: Path, config: RunConfig, artifacts: dict) -> dict:
    """Top hits and misses per test origin from the runner's guarded artifacts (ids, scores, years)."""
    result = {}
    for key, art in artifacts.items():
        hits, misses, note = select_hits_misses(
            art["calibrated_score"], art["labels"], art["pairs"],
            works=load_works(out, int(key)), horizon=config.horizon, origin=int(key))
        result[key] = {"hits": hits, "misses": misses, "hits_note": note}
    return result


def run(corpus: Path, out: Path, config: RunConfig, *, caches_only: bool = False, dry_run: bool = False,
        override_one_shot: bool = False, origins: list[int] | None = None) -> dict:
    """Run the pipeline; returns the manifest (and writes it). ``metrics.json`` is written unless ``caches_only``."""
    out.mkdir(parents=True, exist_ok=True)
    if config.link_threshold != LINK_THRESHOLD:
        raise RunError(f"link threshold is fixed at {LINK_THRESHOLD} in common.py (got {config.link_threshold})")
    try:
        assert_purged(config.fit_origins, config.calibration_origins, config.test_origins, config.horizon)
    except ValueError as exc:
        raise RunError(f"purge check failed: {exc}") from None
    stages = Stages()
    # exporters call backtest.is_real_run(manifest): "real" only for a real corpus, never for --dry-run
    generator = {"name": "run_real.write_synthetic_corpus", "seed": 0} if dry_run else None
    manifest: dict = {
        "data_label": "synthetic" if dry_run else "real", "generator": generator,
        "corpus_description": "dry-run synthetic corpus of made-up words (not data)" if dry_run
        else "OpenAlex corpus built by ingest (title and abstract, arXiv-id month dates)",
        "status": "started", "dry_run": dry_run, "caches_only": caches_only, "config": asdict(config),
        "config_hash": config.hash(), "seed": config.seed, "code_commit": _git_commit(),
        "libraries": {"python": platform.python_version(), "numpy": np.__version__},
    }
    try:
        info = stages.run("scan corpus", scan_corpus, corpus)
        manifest["corpus"] = info
        use = origins or config.origins()
        check_years(info, config, None if origins is None else use)
        reports = stages.run("origin caches", build_caches, corpus, info, config, out, use)
        manifest["origins"] = {str(o): r for o, r in reports.items()}
        manifest["vocabulary_sizes"] = {str(o): r["vocabulary_size"] for o, r in reports.items()}
        if caches_only:
            manifest["status"] = "caches_only"
            return manifest
        bt = config.backtest_config()
        guard = backtest.OneShotGuard(out / "one_shot.json")
        metrics = stages.run(
            "backtest", backtest.run_backtest, lambda t: load_works(out, t), bt, guard=guard,
            override_one_shot=override_one_shot,
            data_label=manifest["data_label"], generator=generator, return_test_artifacts=True)
        # the guarded artifacts are used here, once, to pick the example hits and misses (ids only);
        # they are not JSON and are not kept, so nothing downstream re-reads a test label
        artifacts = metrics.pop("artifacts", {})
        (out / "backtest_examples.json").write_text(
            json.dumps(_examples(out, config, artifacts), indent=1), encoding="utf-8")
        (out / "metrics.json").write_text(json.dumps(metrics, indent=1, default=float), encoding="utf-8")
        manifest["status"] = "complete"
        manifest["one_shot_override_used"] = metrics["one_shot_override_used"]
        return manifest
    except (RunError, backtest.OneShotError, ValueError) as exc:
        manifest["status"] = "failed"
        manifest["error"] = str(exc)
        raise
    finally:
        manifest["stages"] = stages.rows
        manifest["peak_memory_mb"] = peak_memory_mb()
        _write_manifest(out, manifest)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Whitespace real-data backtest run (issue #164)")
    d = RunConfig()
    ap.add_argument("--corpus", type=Path, help="corpus.jsonl written by `ingest build`")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help="output directory (default outside the repo)")
    ap.add_argument("--fit-origins", type=int, nargs="+", default=list(d.fit_origins))
    ap.add_argument("--calibration-origins", type=int, nargs="+", default=list(d.calibration_origins))
    ap.add_argument("--test-origins", type=int, nargs="+", default=list(d.test_origins))
    ap.add_argument("--n-min", type=int, default=d.n_min)
    ap.add_argument("--max-concepts", type=int, default=d.max_concepts)
    ap.add_argument("--ceiling-fraction", type=float, default=d.ceiling_fraction)
    ap.add_argument("--horizon", type=int, default=d.horizon)
    ap.add_argument("--link-threshold", type=int, default=d.link_threshold)
    ap.add_argument("--seed", type=int, default=d.seed)
    ap.add_argument("--dry-run", action="store_true", help="write a tiny synthetic corpus to --out and run on it")
    ap.add_argument("--caches-only", action="store_true", help="build vocabularies and per-origin works, no scoring")
    ap.add_argument("--origins", type=int, nargs="+", help="with --caches-only: build only these origins")
    ap.add_argument("--override-one-shot", action="store_true", help="re-score the test origin (logged and recorded)")
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    if args.dry_run:
        config = DRY_RUN_CONFIG
        args.out.mkdir(parents=True, exist_ok=True)
        corpus = args.out / "dry_run_corpus.jsonl"
        write_synthetic_corpus(corpus)
    else:
        if not args.corpus:
            ap.error("--corpus is required unless --dry-run")
        corpus = args.corpus
        config = RunConfig(tuple(args.fit_origins), tuple(args.calibration_origins), tuple(args.test_origins),
                           args.n_min, args.max_concepts, args.ceiling_fraction, args.horizon,
                           args.link_threshold, args.seed)
    if args.origins and not args.caches_only:
        ap.error("--origins only makes sense with --caches-only")
    try:
        manifest = run(corpus, args.out, config, caches_only=args.caches_only, dry_run=args.dry_run,
                       override_one_shot=args.override_one_shot, origins=args.origins)
    except (RunError, backtest.OneShotError, ValueError) as exc:
        print(f"run failed: {exc}", file=sys.stderr)
        return 2
    print(json.dumps({"status": manifest["status"], "vocabulary_sizes": manifest.get("vocabulary_sizes"),
                      "peak_memory_mb": manifest["peak_memory_mb"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
