# Lane B: models, validation and decision

Python, standard library only (no install step). Writes contract JSON to `data/public/` (see `contracts/README.md`).

| Command (run from the repo root) | Produces | Issue |
| --- | --- | --- |
| `python models/build_forecast.py` | `data/public/forecast.json` | #29, #30a |
| `python models/build_forecast.py --refresh` | same, re-downloading every input first | |
| `python -m pytest models` | offline unit tests (no network) | |

Inputs are keyless public NESO data. They are cached in `data/cache/models/` (git-ignored), so reruns are fast and reproducible. Delete the folder or pass `--refresh` to refetch.

## What the forecast is

- **Target:** Scottish BM-instructed wind turn-down, MWh per half-hour. "Scottish" means NESO's *Day Ahead Wind BMU Forecast* `Region` is North or South Scotland, matched on the same `Generator_Name` as the Wind BOA file. NESO's BOA volumes are average MW, so MWh = MW / 2.
- **Zeros count.** The BOA file only has rows when something was instructed, so a missing half-hour is scored as 0 MWh. (An earlier hand analysis on #25 dropped these half-hours and was too optimistic.)
- **Features:** day-ahead `SSE_SP2` boundary utilisation (flow / limit) for the target half-hour, and Scottish curtailment in the same period two days earlier.
- **Model:** a lookup table of empirical quantiles by (utilisation bin, lagged-curtailment bin), with fallbacks to the utilisation bin and then to all training data. It outputs p10, p50, p90 and `p_heavy` (share of cases above 1,000 MWh). No tuning, no hidden state.
- **`p_turnup_request`:** probability that NESO publishes a live DFS `Upwards`/`System` requirement. Event rate by tercile of boundary utilisation, only inside 11:00 to 23:00 local (the only window with requests so far). About one month of data, so it is **provisional**.

## How it is validated

Rolling-origin, expanding window, weekly folds from 1 Sep 2026. Each fold trains only on earlier dates, and all baselines are scored on the same half-hours. A unit test poisons every future row and checks the earlier predictions do not change.

Baselines: persistence (same half-hour two days earlier), the training mean, a headroom rule (is boundary flow above its limit?) and, for the heavy-curtailment probability, the training prior. Metrics: MAE of the median forecast, Brier score and AUC for "heavy", p10 to p90 coverage, a reliability curve, and results by month.

**Wind-forecast sensitivity (`backtest.morning_update`).** Adding NESO's national incentive wind forecast cuts the median error from about 638 to 477 MWh per half-hour on the same rows (persistence: 1,142), but the archived forecast for recent days is stamped 08:45 UTC *on the target day*, so it is a same-morning update, not a day-ahead vintage. It is scored only from 09:00 local and kept out of the "tomorrow" model, whose features are all known the afternoon before.

## Honest limits

- **Retrospective.** NESO's day-ahead flows file has no per-row publication time, so every score is retrospective. The leakage note is written into `meta` in the JSON.
- One test season (autumn 2026), one boundary, one model family. Reliability is imperfect in places (see the curve in the JSON).
- DFS zones Z1 to Z3 are zone IDs; their mapping to regions is unconfirmed (PRD K-2).
- **Next-day only when it really is.** `forecast.json` has a top-level `mode`. `next_day` means the target is the earliest day after the issue date with a near-complete day-ahead flows snapshot. If NESO has not published one, the file is `same_day_replay`: the latest published day, partly or wholly elapsed, labelled as a retrospective illustration and not a forecast of tomorrow. Rerun with `--refresh` once the next snapshot appears (NESO had not published 8 Nov at 17:00 UTC on 7 Nov).

## Layout

```text
models/
  build_forecast.py        CLI for forecast.json
  turnup/                  timeutil, stats, fetch, inputs, forecast, turnup_prob
  tests/                   offline tests
```
