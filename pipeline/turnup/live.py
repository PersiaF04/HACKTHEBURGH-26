"""Live poller (#28, P1): refresh ``data/public/replay/live.json`` every 5 minutes.

Same shape as a replay day, covering today's settlement periods up to now. Indicative cashflows
and volumes are only published the next morning, so live curtailment is estimated from BOALF
(the accepted level below PN) and ``paid_gbp`` is ``null``. On any failure the last good file is
kept and the error is logged.

Run from ``pipeline/``: ``python -m turnup.live`` (``--once`` for a single refresh).
"""

from __future__ import annotations

import argparse
import collections
import datetime as dt
import json
import logging
import shutil
import subprocess
import time

from . import backfill as bf
from . import fetch, http, sources

log = logging.getLogger("turnup.live")
INTERVAL_SECONDS = 300
SCOTEX_MAX_AGE_SECONDS = 3600
# Periods that started within this window are re-downloaded every refresh (bypassing the permanent cache), so a
# response cached while still empty or incomplete cannot stay stale; older periods are settled and stay cached.
REFRESH_WINDOW = dt.timedelta(hours=2)
GIST_STATE = bf.REPO_ROOT / "data" / "cache" / "live_gist.json"  # gitignored; holds the gist id


def fetch_boalf(start: dt.datetime, end: dt.datetime) -> list[dict]:
    """All acceptances whose window overlaps [start, end), fetched in 2-hour chunks."""
    rows, t = [], start
    while t < end:
        t2 = min(t + dt.timedelta(hours=2), end)
        payload = http.get_json(f"{sources.ELEXON}/datasets/BOALF",
                                {"from": bf.iso_z(t), "to": bf.iso_z(t2)}, timeout=120)
        rows.extend(payload.get("data", []))
        t = t2
    seen, out = set(), []
    for r in rows:
        key = (r["bmUnit"], r["acceptanceNumber"], r["timeFrom"], r["timeTo"])
        if key not in seen:
            seen.add(key)
            out.append(r)
    return out


def latest_acceptance_level(rows: list[dict], start: dt.datetime, end: dt.datetime) -> float | None:
    """Average instructed level over the period, from the newest acceptance that covers it."""
    by_acc = collections.defaultdict(list)
    for r in rows:
        by_acc[r["acceptanceNumber"]].append(r)
    for acc in sorted(by_acc, reverse=True):
        level = bf._avg_level(by_acc[acc], start, end)
        if level is not None:
            return level
    return None


_scotex_cache: dict = {"at": None, "data": {}}


def live_scotex(now: dt.datetime) -> dict:
    """SCOTEX lookup, re-downloaded at most hourly; on failure the previous copy is kept."""
    at = _scotex_cache["at"]
    if at is None or (now - at).total_seconds() > SCOTEX_MAX_AGE_SECONDS:
        try:
            _scotex_cache["data"] = bf.scotex_lookup(refresh=at is not None)
            _scotex_cache["at"] = now
        except Exception as exc:  # noqa: BLE001 - optional field
            log.warning("SCOTEX refresh failed, keeping previous: %s", exc)
    return _scotex_cache["data"]


def build_live(now: dt.datetime, farm_ids: set[str], physical=fetch.elexon_physical,
               boalf=fetch_boalf, scotex=None) -> dict:
    day = now.astimezone(bf.LONDON).date().isoformat()
    day_start = bf.sp_start_utc(day, 1)
    acc_by_unit = collections.defaultdict(list)
    for r in boalf(day_start, now):
        if r["bmUnit"] in farm_ids:
            acc_by_unit[r["bmUnit"]].append(r)
    periods = []
    for sp in range(1, bf.periods_in_day(day) + 1):
        start = bf.sp_start_utc(day, sp)
        if start > now:
            break
        end = start + dt.timedelta(minutes=30)
        seg = {"PN": collections.defaultdict(list), "MELS": collections.defaultdict(list)}
        fresh = start > now - REFRESH_WINDOW
        for ds in seg:
            for r in physical(ds, day, sp, refresh=fresh):
                if r["bmUnit"] in farm_ids:
                    seg[ds][r["bmUnit"]].append(r)
        farms = {}
        for fid in sorted(farm_ids):
            pn = bf._avg_level(seg["PN"].get(fid, []), start, end)
            mel = bf._avg_level(seg["MELS"].get(fid, []), start, end)
            instructed = latest_acceptance_level(acc_by_unit.get(fid, []), start, end)
            curtailed = 0.0
            if pn is not None and instructed is not None and instructed < pn:
                curtailed = (pn - instructed) / 2.0
            if pn is None and curtailed == 0:
                continue
            level = instructed if instructed is not None else pn
            farms[fid] = {"pn_mw": None if pn is None else round(pn, 1),
                          "level_mw": None if level is None else round(max(0.0, level), 1),
                          "curtailed_mwh": round(curtailed, 2),
                          "paid_gbp": None,
                          "state": bf.classify(pn, mel, curtailed)}
        periods.append({"sp": sp, "start_utc": bf.iso_z(start), "farms": farms})
    bf.add_scotex(periods, scotex if scotex is not None else live_scotex(now))
    return {"meta": {"source": ["Elexon PN", "Elexon MELS", "Elexon BOALF (live)",
                                "NESO day-ahead constraint flows and limits (SCOTEX)"],
                     "scotex_note": bf.SCOTEX_NOTE,
                     "generated_utc": bf.iso_z(now), "retrospective": False, "live": True,
                     "method": "curtailed_mwh = (PN - latest accepted BOALF level) / 2 when below PN; "
                               "paid_gbp is null until Elexon publishes indicative cashflows next morning"},
            "date": day, "periods": periods}


def refresh(farm_ids: set[str], now: dt.datetime | None = None, publish: bool = False) -> bool:
    now = now or dt.datetime.now(dt.timezone.utc)
    try:
        obj = build_live(now, farm_ids)
    except Exception as exc:  # noqa: BLE001 - keep the last good file
        log.warning("live refresh failed, keeping last good live.json: %s", exc)
        return False
    path = bf.write_json("replay/live.json", obj, compact=True)
    if publish:
        publish_gist(path)
    return True


def publish_gist(path) -> bool:
    """Upload live.json to an unlisted GitHub Gist with the gh CLI (creates it on first use).

    The gist id is kept in data/cache/live_gist.json. Failures are logged, never raised.
    """
    gh = shutil.which("gh")
    if not gh:
        log.warning("gh CLI not found; live.json not published")
        return False
    try:
        state = json.loads(GIST_STATE.read_text(encoding="utf-8")) if GIST_STATE.exists() else {}
        if not state.get("id"):
            out = subprocess.run([gh, "gist", "create", "--desc", "Turn Up Scotland live.json (auto-updated)",
                                  str(path)], capture_output=True, text=True, timeout=120, check=True)
            gist_id = out.stdout.strip().rstrip("/").rsplit("/", 1)[-1]
            owner = subprocess.run([gh, "api", "user", "-q", ".login"], capture_output=True, text=True,
                                   timeout=60, check=True).stdout.strip()
            state = {"id": gist_id, "raw_url": f"https://gist.githubusercontent.com/{owner}/{gist_id}/raw/live.json"}
            GIST_STATE.parent.mkdir(parents=True, exist_ok=True)
            GIST_STATE.write_text(json.dumps(state, indent=1), encoding="utf-8")
            log.info("created gist %s (%s)", gist_id, state["raw_url"])
            return True
        payload = GIST_STATE.with_name("live_gist_payload.json")
        payload.write_text(json.dumps({"files": {"live.json": {"content": path.read_text(encoding="utf-8")}}}),
                           encoding="utf-8")
        subprocess.run([gh, "api", "-X", "PATCH", f"gists/{state['id']}", "--input", str(payload), "--silent"],
                       capture_output=True, text=True, timeout=180, check=True)
        log.info("published live.json to gist %s", state["id"])
        return True
    except Exception as exc:  # noqa: BLE001 - publishing is best-effort
        detail = getattr(exc, "stderr", "") or exc
        log.warning("gist publish failed: %s", detail)
        return False


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Refresh data/public/replay/live.json")
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--publish", action="store_true",
                        help="also upload live.json to an unlisted GitHub Gist (gh CLI) after each refresh")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    farm_ids = set(bf.scottish_wind_ids(bf.wind_bmu_reference(), bf.ng_to_elexon()))
    if args.once:
        return 0 if refresh(farm_ids, publish=args.publish) else 1
    while True:
        refresh(farm_ids, publish=args.publish)
        time.sleep(INTERVAL_SECONDS)


if __name__ == "__main__":
    raise SystemExit(main())
