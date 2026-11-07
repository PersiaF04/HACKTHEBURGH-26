"""Snapshot archiver (#28, R-7/R-8 groundwork).

Stores what the public sources said *at the time we fetched them*, so later forecasts and
backtests can be built point-in-time (fixing the vintage leak, PRD risk K-3).

- Elexon BOALF: polled every few minutes; each new acceptance row is appended with
  ``fetched_at`` to ``data/snapshots/boalf/<UTC date>.jsonl``.
- NESO resources (day-ahead constraint flows and limits, DFS requirement and utilisation,
  per-BMU wind forecast): ``last_modified`` is checked periodically and the whole file is
  saved gzip-compressed when it changes, with a sidecar ``.meta.json`` holding ``fetched_at``.

Every job is isolated: a failure is logged and retried on the next tick, never fatal.
Run: ``python -m turnup.archiver`` from ``pipeline/`` (``--once`` for a single pass).
"""

from __future__ import annotations

import argparse
import datetime as dt
import gzip
import hashlib
import json
import logging
import os
import signal
import time
from pathlib import Path
from typing import Callable

from . import http, sources

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ROOT = REPO_ROOT / "data" / "snapshots"
log = logging.getLogger("turnup.archiver")


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def iso(ts: dt.datetime) -> str:
    return ts.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class State:
    """Tiny JSON state file, written atomically."""

    def __init__(self, path: Path):
        self.path = path
        try:
            self.data = json.loads(path.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            self.data = {}

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.data, indent=1, sort_keys=True), encoding="utf-8")
        os.replace(tmp, self.path)


def boalf_key(row: dict) -> str:
    return "|".join(str(row.get(k)) for k in ("acceptanceNumber", "bmUnit", "timeFrom", "timeTo", "levelFrom", "levelTo"))


class BoalfJob:
    """Append new BOALF acceptances with fetched_at. Overlapping windows are de-duplicated."""

    name = "boalf"

    def __init__(self, root: Path, state: State, fetch: Callable[[dict], list] | None = None,
                 lookback_minutes: int = 40):
        self.root = root / "boalf"
        self.state = state
        self.lookback = dt.timedelta(minutes=lookback_minutes)
        self.fetch = fetch or self._fetch
        self._seen: dict[str, set[str]] = {}

    @staticmethod
    def _fetch(params: dict) -> list:
        payload = http.get_json(f"{sources.ELEXON}/datasets/BOALF", params, timeout=60)
        return payload.get("data", payload) if isinstance(payload, dict) else payload

    def _seen_for(self, day: str) -> set[str]:
        if day not in self._seen:
            # Include the previous day's file so the lookback window does not re-append
            # rows just after midnight.
            prev = (dt.date.fromisoformat(day) - dt.timedelta(days=1)).isoformat()
            keys: set[str] = set()
            for d in (prev, day):
                path = self.root / f"{d}.jsonl"
                if not path.exists():
                    continue
                with path.open(encoding="utf-8") as fh:
                    for line in fh:
                        try:
                            keys.add(boalf_key(json.loads(line)))
                        except json.JSONDecodeError:
                            continue
            self._seen = {day: keys}
        return self._seen[day]

    @staticmethod
    def _repair_tail(path: Path) -> None:
        """Drop an incomplete final record left by an interrupted append."""
        if not path.exists() or path.stat().st_size == 0:
            return
        with path.open("rb+") as fh:
            fh.seek(-1, os.SEEK_END)
            if fh.read(1) == b"\n":
                return
            fh.seek(0)
            data = fh.read()
            cut = data.rfind(b"\n") + 1  # 0 when the file holds only a partial line
            fh.truncate(cut)
            log.warning("boalf: truncated incomplete final record in %s", path.name)

    def run(self, now: dt.datetime) -> int:
        rows = self.fetch({"from": iso(now - self.lookback), "to": iso(now)})
        fetched_at = iso(now)
        day = now.strftime("%Y-%m-%d")
        seen = self._seen_for(day)
        new, keys = [], []
        batch: set[str] = set()
        for row in rows:
            key = boalf_key(row)
            if key in seen or key in batch:
                continue
            batch.add(key)
            keys.append(key)
            new.append({**row, "fetched_at": fetched_at})
        if new:
            self.root.mkdir(parents=True, exist_ok=True)
            path = self.root / f"{day}.jsonl"
            self._repair_tail(path)
            payload = "".join(json.dumps(row, separators=(",", ":")) + "\n" for row in new)
            try:
                with path.open("a", encoding="utf-8") as fh:
                    fh.write(payload)
                    fh.flush()
                    os.fsync(fh.fileno())
            except Exception:
                # Some complete lines may have reached disk: forget the cache so the next poll
                # reloads seen keys from the file (after repairing any partial tail).
                self._seen = {}
                raise
            # Only now are the rows persisted; a failed append leaves them unseen for the retry.
            seen.update(keys)
        self.state.data.setdefault("boalf", {})["last_run"] = fetched_at
        self.state.data["boalf"]["last_new_rows"] = len(new)
        return len(new)


class NesoSnapshotJob:
    """Save a NESO resource whenever its last_modified changes."""

    def __init__(self, root: Path, state: State, name: str, package: str, resource_id: str | None,
                 resource_name: str | None = None,
                 package_show: Callable[[str], dict] | None = None,
                 download: Callable[[str], bytes] | None = None):
        self.name = name
        self.root = root / "neso" / name
        self.state = state
        self.package = package
        self.resource_id = resource_id
        self.resource_name = resource_name
        self.package_show = package_show or (lambda pkg: http.get_json(
            f"{sources.NESO_CKAN}/package_show", {"id": pkg}, timeout=60)["result"])
        self.download = download or (lambda url: http.get_bytes(url, timeout=300))

    def _resource(self) -> dict:
        resources = self.package_show(self.package)["resources"]
        for res in resources:
            if self.resource_id and res.get("id") == self.resource_id:
                return res
            if not self.resource_id and res.get("name", "").strip() == self.resource_name:
                return res
        raise LookupError(f"{self.name}: resource not found in {self.package}")

    def run(self, now: dt.datetime) -> int:
        res = self._resource()
        version = res.get("last_modified") or res.get("metadata_modified") or ""
        st = self.state.data.setdefault("neso", {}).setdefault(self.name, {})
        st["last_check"] = iso(now)
        if version and st.get("last_modified") == version:
            return 0
        body = self.download(res["url"])
        digest = hashlib.sha256(body).hexdigest()
        if st.get("sha256") == digest:
            st["last_modified"] = version
            return 0
        stamp = now.strftime("%Y%m%dT%H%M%SZ")
        self.root.mkdir(parents=True, exist_ok=True)
        out = self.root / f"{stamp}.csv.gz"
        with gzip.open(out, "wb") as fh:
            fh.write(body)
        meta = {"fetched_at": iso(now), "source_last_modified": version, "url": res["url"],
                "resource_id": res.get("id"), "resource_name": res.get("name"),
                "sha256": digest, "bytes": len(body)}
        (self.root / f"{stamp}.meta.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
        st.update({"last_modified": version, "sha256": digest, "last_saved": iso(now)})
        return 1


def build_jobs(root: Path, state: State) -> list[tuple[object, int]]:
    """Return (job, interval_seconds) pairs."""
    jobs: list[tuple[object, int]] = [(BoalfJob(root, state), 5 * 60)]
    for name, package, rid in sources.NESO_SNAPSHOT_RESOURCES:
        job = NesoSnapshotJob(root, state, name, package, rid, sources.NESO_RESOURCE_NAMES.get(name))
        jobs.append((job, 30 * 60))
    return jobs


def run_once(jobs, state: State, now: dt.datetime | None = None) -> dict[str, str]:
    """Run every job once. Failures are logged and reported, never raised."""
    results: dict[str, str] = {}
    for job, _ in jobs:
        now_job = now or utcnow()
        try:
            n = job.run(now_job)
            results[job.name] = f"ok ({n} new)"
            log.info("%s: ok, %s new", job.name, n)
        except Exception as exc:  # noqa: BLE001 - the archiver must never die
            results[job.name] = f"error: {exc}"
            state.data.setdefault("errors", {})[job.name] = {"at": iso(now_job), "error": str(exc)[:500]}
            log.warning("%s: failed: %s", job.name, exc)
    state.save()
    return results


def run_forever(jobs, state: State, tick_seconds: int = 30) -> None:
    stop = {"flag": False}

    def _stop(*_):
        stop["flag"] = True

    signal.signal(signal.SIGINT, _stop)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, _stop)
    next_due = {id(job): 0.0 for job, _ in jobs}
    while not stop["flag"]:
        mono = time.monotonic()
        due = [(job, iv) for job, iv in jobs if mono >= next_due[id(job)]]
        if due:
            run_once(due, state)
            for job, iv in due:
                next_due[id(job)] = time.monotonic() + iv
        time.sleep(tick_seconds)
    log.info("archiver stopped")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT, help="snapshot folder (gitignored)")
    parser.add_argument("--once", action="store_true", help="run every job once and exit")
    args = parser.parse_args(argv)
    args.root.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s",
        handlers=[logging.StreamHandler(), logging.FileHandler(args.root / "archiver.log", encoding="utf-8")],
    )
    state = State(args.root / "state.json")
    jobs = build_jobs(args.root, state)
    if args.once:
        results = run_once(jobs, state)
        return 0 if all(r.startswith("ok") for r in results.values()) else 1
    run_forever(jobs, state)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
