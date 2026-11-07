import datetime as dt
import gzip
import json
from pathlib import Path

from turnup.archiver import BoalfJob, NesoSnapshotJob, State, run_once

NOW = dt.datetime(2026, 11, 7, 20, 0, tzinfo=dt.timezone.utc)


def row(n, level=0):
    return {"acceptanceNumber": n, "bmUnit": "T_SGRWO-1", "timeFrom": "2026-11-07T19:50:00Z",
            "timeTo": "2026-11-07T20:20:00Z", "levelFrom": level, "levelTo": level, "soFlag": True}


def test_boalf_appends_new_rows_with_fetched_at_and_dedupes(tmp_path):
    state = State(tmp_path / "state.json")
    batches = [[row(1), row(2)], [row(2), row(3)]]
    job = BoalfJob(tmp_path, state, fetch=lambda params: batches.pop(0))
    assert job.run(NOW) == 2
    assert job.run(NOW + dt.timedelta(minutes=5)) == 1
    lines = [json.loads(x) for x in (tmp_path / "boalf" / "2026-11-07.jsonl").read_text().splitlines()]
    assert [r["acceptanceNumber"] for r in lines] == [1, 2, 3]
    assert lines[0]["fetched_at"] == "2026-11-07T20:00:00Z"
    assert lines[2]["fetched_at"] == "2026-11-07T20:05:00Z"


def test_boalf_dedupe_survives_restart(tmp_path):
    state = State(tmp_path / "state.json")
    BoalfJob(tmp_path, state, fetch=lambda p: [row(1)]).run(NOW)
    again = BoalfJob(tmp_path, state, fetch=lambda p: [row(1), row(4)])
    assert again.run(NOW) == 1


def test_boalf_dedupe_across_midnight(tmp_path):
    state = State(tmp_path / "state.json")
    BoalfJob(tmp_path, state, fetch=lambda p: [row(1)]).run(NOW)
    after_midnight = dt.datetime(2026, 11, 8, 0, 5, tzinfo=dt.timezone.utc)
    job = BoalfJob(tmp_path, state, fetch=lambda p: [row(1), row(5)])
    assert job.run(after_midnight) == 1
    assert (tmp_path / "boalf" / "2026-11-08.jsonl").read_text().count("\n") == 1


def _pkg(last_modified):
    return {"resources": [{"id": "abc", "name": "Thing", "url": "https://x/thing.csv",
                           "last_modified": last_modified}]}


def test_neso_snapshot_saved_only_when_changed(tmp_path):
    state = State(tmp_path / "state.json")
    versions = ["v1", "v1", "v2"]
    bodies = {"v1": b"a,b\n1,2\n", "v2": b"a,b\n1,3\n"}
    current = {}

    def show(_pkg_id):
        current["v"] = versions.pop(0)
        return _pkg(current["v"])

    job = NesoSnapshotJob(tmp_path, state, "thing", "pkg", "abc", package_show=show,
                          download=lambda url: bodies[current["v"]])
    assert job.run(NOW) == 1
    assert job.run(NOW + dt.timedelta(minutes=30)) == 0
    assert job.run(NOW + dt.timedelta(minutes=60)) == 1
    saved = sorted((tmp_path / "neso" / "thing").glob("*.csv.gz"))
    assert len(saved) == 2
    assert gzip.decompress(saved[-1].read_bytes()) == b"a,b\n1,3\n"
    meta = json.loads(saved[0].with_name(saved[0].name.replace(".csv.gz", ".meta.json")).read_text())
    assert meta["fetched_at"] == "2026-11-07T20:00:00Z" and meta["source_last_modified"] == "v1"


def test_neso_resource_resolved_by_name(tmp_path):
    state = State(tmp_path / "state.json")
    pkg = {"resources": [{"id": "old", "name": "DFS Service Requirement (Archive 2025/2026)", "url": "u1", "last_modified": "a"},
                         {"id": "new", "name": "DFS Service Requirement", "url": "u2", "last_modified": "b"}]}
    got = {}
    job = NesoSnapshotJob(tmp_path, state, "dfs_requirement", "demand-flexibility", None,
                          resource_name="DFS Service Requirement", package_show=lambda p: pkg,
                          download=lambda url: got.setdefault("url", url) and b"x")
    job.run(NOW)
    assert got["url"] == "u2"


def test_failing_job_is_logged_not_raised(tmp_path):
    state = State(tmp_path / "state.json")

    class Boom:
        name = "boom"

        def run(self, now):
            raise RuntimeError("network down")

    ok = BoalfJob(tmp_path, state, fetch=lambda p: [row(9)])
    results = run_once([(Boom(), 60), (ok, 60)], state, now=NOW)
    assert results["boom"].startswith("error")
    assert results["boalf"] == "ok (1 new)"
    assert json.loads((tmp_path / "state.json").read_text())["errors"]["boom"]["error"] == "network down"


def test_boalf_failed_append_is_retried_not_lost(tmp_path, monkeypatch):
    state = State(tmp_path / "state.json")
    job = BoalfJob(tmp_path, state, fetch=lambda p: [row(1), row(2)])
    real_open = Path.open

    def failing_open(self, mode="r", *a, **k):
        if mode == "a":
            raise OSError("disk full")
        return real_open(self, mode, *a, **k)

    monkeypatch.setattr(Path, "open", failing_open)
    try:
        job.run(NOW)
    except OSError:
        pass
    monkeypatch.setattr(Path, "open", real_open)
    assert job.run(NOW) == 2  # nothing was marked seen by the failed attempt
    lines = (tmp_path / "boalf" / f"{NOW:%Y-%m-%d}.jsonl").read_text(encoding="utf-8").splitlines()
    assert [json.loads(x)["acceptanceNumber"] for x in lines] == [1, 2]


def test_boalf_recovers_incomplete_final_line(tmp_path):
    state = State(tmp_path / "state.json")
    BoalfJob(tmp_path, state, fetch=lambda p: [row(1)]).run(NOW)
    path = tmp_path / "boalf" / f"{NOW:%Y-%m-%d}.jsonl"
    with path.open("a", encoding="utf-8") as fh:
        fh.write('{"acceptanceNumber": 2, "bmUnit"')  # interrupted write
    job = BoalfJob(tmp_path, state, fetch=lambda p: [row(1), row(2)])
    assert job.run(NOW) == 1
    rows = [json.loads(x) for x in path.read_text(encoding="utf-8").splitlines()]
    assert [r["acceptanceNumber"] for r in rows] == [1, 2]


def test_boalf_partial_append_then_failure_does_not_duplicate(tmp_path, monkeypatch):
    import os

    state = State(tmp_path / "state.json")
    job = BoalfJob(tmp_path, state, fetch=lambda p: [row(1), row(2)])
    path = tmp_path / "boalf" / f"{NOW:%Y-%m-%d}.jsonl"
    real_fsync = os.fsync

    def failing_fsync(fd):
        # Simulate one complete line plus a partial one on disk, then a failed fsync.
        with path.open("w", encoding="utf-8") as fh:
            fh.write(json.dumps({**row(1), "fetched_at": "x"}) + "\n" + '{"acceptanceNumber": 2')
        raise OSError("fsync failed")

    monkeypatch.setattr(os, "fsync", failing_fsync)
    try:
        job.run(NOW)
    except OSError:
        pass
    monkeypatch.setattr(os, "fsync", real_fsync)
    assert job.run(NOW) == 1  # row 1 is already on disk; only row 2 is appended
    rows = [json.loads(x) for x in path.read_text(encoding="utf-8").splitlines()]
    assert [r["acceptanceNumber"] for r in rows] == [1, 2]
