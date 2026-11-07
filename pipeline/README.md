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
