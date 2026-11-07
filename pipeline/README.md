# Pipeline (lane A)

Python data pipeline for Turn Up Scotland. It needs only the standard library at runtime; tests use `pytest`. Python 3.11 or later.

Owner: Varshil's Claude (developer), Varshil's Codex (review). Issues: #27 (backfill and contract files) and #28 (snapshot archiver and live poller).

## Commands

Run every command from `pipeline/`.

| Task | Command |
| --- | --- |
| Tests | `python -m pytest -q` |
| Snapshot archiver (runs until stopped) | `python -m turnup.archiver` |
| Archiver, single pass | `python -m turnup.archiver --once` |
| Warm the Elexon cache for the backfill window (slow first time) | `python -m turnup.prefetch` |
| Regenerate every lane A contract file in `data/public/` | `python -m turnup.backfill` |
| Regenerate some files only | `python -m turnup.backfill --only farms,daily,dfs,replay` |
| Power-line geometry for the map (`data/public/grid.json`, OpenStreetMap) | `python -m turnup.grid` |
| Live poller: refresh `data/public/replay/live.json` every 5 minutes | `python -m turnup.live` |
| Check `data/public/` against `contracts/fixtures/` | `python -m turnup.validate` |

## Snapshot archiver (#28)

The archiver records what public sources said **at the time we fetched them**, so forecasts and backtests can be built point-in-time (PRD risk K-3). Output goes to `data/snapshots/`, which is gitignored.

| Source | How often | Stored as |
| --- | --- | --- |
| Elexon BOALF (bid-offer acceptances) | Every 5 minutes, 40-minute overlapping window, de-duplicated | `boalf/<UTC date>.jsonl`, one row per acceptance with `fetched_at` |
| NESO day-ahead constraint flows and limits | Checked every 30 minutes; saved when `last_modified` changes | `neso/constraint_flows/<stamp>.csv.gz` plus `.meta.json` |
| NESO DFS Service Requirement | As above | `neso/dfs_requirement/` |
| NESO DFS Utilisation Report | As above | `neso/dfs_utilisation/` |
| NESO Day Ahead Wind BMU Forecast (per farm, with `Region`) | As above | `neso/wind_bmu_forecast/` |

Each `.meta.json` holds `fetched_at`, the source's `last_modified`, the URL and a SHA-256 hash. `state.json` holds the last run and the last error for each job, and `archiver.log` is the log. A failing job is logged and retried on the next pass; it never stops the process.

## Backfill (#27)

`python -m turnup.backfill` rebuilds the contract files from public, keyless sources. Raw responses are cached gzipped in `data/cache/` (gitignored), so a second run is fast and works offline. The window is set in `turnup/backfill_config.py` (1 April 2026 to 6 November 2026). Every file has `meta.retrospective: true` because it is built from today's published data, not from archived snapshots.

| File | Built from | Notes |
| --- | --- | --- |
| `farms.json` | NESO Day Ahead Wind BMU Forecast (`Region`, `Capacity`); Elexon BM unit reference (NESO id to Elexon id); DESNZ REPD Q2 2026 (coordinates) | Coordinates come from REPD name matching, with hand-checked overrides in `REPD_OVERRIDES`. British grid easting and northing are converted to WGS84 in `turnup/geo.py`. Farms with no match have `lat` and `lon` set to `null`. |
| `curtailment_daily.json` | NESO Wind BOA Volumes 2026/27; Elexon indicative bid cashflows; NESO Constraint Breakdown 2026-2027 | NESO BOA volumes are average MW per half hour, so MWh = MW / 2. Scottish means NESO Region North or South Scotland. `validation` compares our volume with NESO thermal constraint volume. |
| `iceberg.json` | Elexon indicative cashflows (Scottish wind bids, GB CCGT offers); NESO Constraint Breakdown | A magnitude comparison, not a sum: CCGT offers also include energy balancing. |
| `dfs_requests.json` | NESO DFS Service Requirement and DFS Utilisation Report | Live, Upwards, System requests only. `procured_mw` sums Accepted, Live utilisation rows for the same event and half hour. |
| `replay/<date>.json` | Elexon PN, MELS, indicative bid volumes and cashflows | 14 October 2026 plus the two heaviest other curtailment days. `replay/index.json` lists the days on disk. One entry per Scottish wind BMU per period. Written compact to keep the file small. |

Replay `state` rules: `instructed` when the farm has an accepted bid in the period; `unavailable` when PN is more than max(1 MW, 5%) above MEL, or PN and MEL are both about 0 (a declared outage); `unknown` when PN is missing, or PN is about 0 while MEL is not (the farm planned no output before gate closure, which is not a paid action); otherwise `generating`. `level_mw` is PN minus twice the curtailed MWh, floored at 0.

## Live poller (#28)

`python -m turnup.live` rewrites `data/public/replay/live.json` every 5 minutes in the same shape as a replay day, for today's settlement periods up to now. Elexon publishes indicative cashflows and volumes only the next morning, so live curtailment is estimated from BOALF: `(PN - latest accepted level) / 2` when the accepted level is below PN, and `paid_gbp` is `null`. Checked on 14 October 2026, this estimate gave 149,424 MWh against 149,263 MWh from settled indicative volumes. If a refresh fails, the last good file is kept. `live.json` changes every 5 minutes, so it is gitignored.
