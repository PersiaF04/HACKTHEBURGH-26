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
import logging
import time

from . import backfill as bf
from . import fetch, http, sources

log = logging.getLogger("turnup.live")
INTERVAL_SECONDS = 300


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


def build_live(now: dt.datetime, farm_ids: set[str], physical=fetch.elexon_physical,
               boalf=fetch_boalf) -> dict:
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
        for ds in seg:
            for r in physical(ds, day, sp):
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
    return {"meta": {"source": ["Elexon PN", "Elexon MELS", "Elexon BOALF (live)"],
                     "generated_utc": bf.iso_z(now), "retrospective": False, "live": True,
                     "method": "curtailed_mwh = (PN - latest accepted BOALF level) / 2 when below PN; "
                               "paid_gbp is null until Elexon publishes indicative cashflows next morning"},
            "date": day, "periods": periods}


def refresh(farm_ids: set[str], now: dt.datetime | None = None) -> bool:
    now = now or dt.datetime.now(dt.timezone.utc)
    try:
        obj = build_live(now, farm_ids)
    except Exception as exc:  # noqa: BLE001 - keep the last good file
        log.warning("live refresh failed, keeping last good live.json: %s", exc)
        return False
    bf.write_json("replay/live.json", obj, compact=True)
    return True


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Refresh data/public/replay/live.json")
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    farm_ids = set(bf.scottish_wind_ids(bf.wind_bmu_reference(), bf.ng_to_elexon()))
    if args.once:
        return 0 if refresh(farm_ids) else 1
    while True:
        refresh(farm_ids)
        time.sleep(INTERVAL_SECONDS)


if __name__ == "__main__":
    raise SystemExit(main())
