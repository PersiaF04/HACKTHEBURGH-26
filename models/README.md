# Lane B: models, validation and decision

Python, standard library only (no install step). Writes contract JSON to `data/public/` (see `contracts/README.md`).

| Command (run from the repo root) | Produces | Issue |
| --- | --- | --- |
| `python models/build_forecast.py` | `data/public/forecast.json` | #29, #30a |
| `python models/build_forecast.py --refresh` | same, re-downloading every input first | |
| `python models/build_copilot.py` | `data/public/copilot.json` (default: 50 MW electrolyser, zone Z1) | #30 |
| `python models/build_copilot.py --type data_centre --mw 20 --zone Z2 --value 80 --periods 8` | the same replay for another load | |
| `python models/build_sandbox.py` | `data/public/sandbox.json` (optional): inputs and a scoring rule for the interactive load sandbox | #76 |
| `python models/build_dashboard.py` | `data/public/dashboard.json` (optional): headline and summaries for the map dashboard; run after the forecast and Copilot builders | #74 |
| `python -m pytest models` | offline unit tests (no network) | |

Inputs are keyless public NESO data. They are cached in `data/cache/models/` (git-ignored), so reruns are fast and reproducible. Delete the folder or pass `--refresh` to refetch.

## What the forecast is

- **Target:** Scottish BM-instructed wind turn-down, MWh per half-hour. "Scottish" means NESO's *Day Ahead Wind BMU Forecast* `Region` is North or South Scotland, matched on the same `Generator_Name` as the Wind BOA file. NESO's BOA volumes are average MW, so MWh = MW / 2.
- **Zeros count.** The BOA file only has rows when something was instructed, so a missing half-hour is scored as 0 MWh. (An earlier hand analysis on #25 dropped these half-hours and was too optimistic.)
- **Features:** day-ahead `SSE_SP2` boundary utilisation (flow / limit) for the target half-hour, and Scottish curtailment in the same period two days earlier.
- **Model:** a lookup table of empirical quantiles by (utilisation bin, lagged-curtailment bin), with fallbacks to the utilisation bin and then to all training data. It outputs p10, p50, p90 and `p_heavy` (share of cases above 1,000 MWh). No tuning, no hidden state.
- **`p_turnup_request`:** probability that NESO publishes a live DFS `Upwards`/`System` requirement. Event rate by tercile of boundary utilisation, only inside 11:00 to 23:00 local (the only window with requests so far). About one month of data, so it is **provisional**.

## What the Copilot is

A replay of one decision: on a day when NESO may publish DFS `Upwards`/`System` requests, which half-hours should a flexible load be ready in, and at what bid price? Three policies face the same days, electricity prices and budget (default 12 half-hours a day), scored identically:

- **Naive:** bid a fixed price in the cheapest-electricity half-hours. The price is the median accepted-price ceiling in the load's own zone on earlier days only (£60 with no history), the same walk-forward cutoff as the other policies.
- **Ours:** rank half-hours by expected margin, using the probability a bid would be accepted at each price, learned from earlier days only (by electricity-price and boundary-utilisation tercile).
- **Oracle:** hindsight best, each bid at its accepted-price ceiling. An unreachable ceiling, not a business case.

Money is kept plain: pay-as-bid settlement, perfect delivery, electricity at the market index price, and a user-set `value` for what the extra energy is worth to the site. Gross settlement and electricity cost are reported separately, with a break-even value per MWh and a sensitivity over site values. A bid is assumed accepted only if it is at or below a price NESO actually accepted **in the load's own zone** that half-hour, and half-hours with no accepted bid in that zone are treated as not tradable. For a Z1 load that leaves only 28 tradable half-hours across the 13 scored days, so percentages of the oracle rest on a handful of events (`summary.tradable_half_hours`). About 13 scored days, so treat it as a feasibility replay.

**Settlement check (PRD K-5).** `copilot.json` carries a `validation` block. The pay-as-bid arithmetic reproduces NESO's published accepted cost exactly (1,130 of 1,130 half-hours, including all 86 Upwards/System ones). But NESO's published *settled* cost is only about 39% of accepted cost across DFS so far (and settlement is published for only 2 of the 86 Upwards/System half-hours), so the Copilot's full-delivery assumption is optimistic and its absolute pound figures are an upper bound.

**How "ours" was built:** a first version used only the request probability from the forecast and trailed the naive rule; the version here learns acceptance by electricity price and utilisation instead. It was adjusted once after seeing the first replay, on the same 13 days, so its edge is not an out-of-sample claim.

**Sandbox (`sandbox.json`, issue #76).** Exports, for every day with a turn-up request, the per-half-hour facts the Copilot's scoring depends on (electricity price, request flag, per-zone caps and accepted-price ceilings, curtailment) and the naive, ours and oracle schedules for each zone and site value. `turnup/sandbox.py` holds a short reference scorer (`score_schedule`), written in plain words in the file, for a client to port to TypeScript; test vectors with expected outputs are included. The builder refuses to write the file if the scorer disagrees with the Copilot's own replay on the real data.

## How the forecast is validated

Rolling-origin, expanding window, weekly folds from 1 Sep 2026. Each fold trains only on earlier dates, and all baselines are scored on the same half-hours. A unit test poisons every future row and checks the earlier predictions do not change.

Baselines: persistence (same half-hour two days earlier), the training mean, a headroom rule (is boundary flow above its limit?) and, for the heavy-curtailment probability, the training prior. Metrics: MAE of the median forecast, Brier score and AUC for "heavy", p10 to p90 coverage, a reliability curve, and results by month.

**Wind-forecast sensitivity (`backtest.morning_update`).** Adding NESO's national incentive wind forecast cuts the median error from about 638 to 477 MWh per half-hour on the same rows (persistence: 1,142), but the archived forecast for recent days is stamped 08:45 UTC *on the target day*, so it is a same-morning update, not a day-ahead vintage. It is scored only from 09:00 local and kept out of the "tomorrow" model, whose features are all known the afternoon before.

## Honest limits

- **Retrospective.** NESO's day-ahead flows file has no per-row publication time, so every score is retrospective. The leakage note is written into `meta` in the JSON.
- One test season (autumn 2026), one boundary, one model family. Reliability is imperfect in places (see the curve in the JSON).
- DFS zones Z1 to Z3 are zone IDs; their mapping to regions is unconfirmed (PRD K-2).
- **Next-day only when it really is, and which model produced it.** `forecast.json` has a top-level `mode` and `meta.model`. The file is `next_day` when the target is the earliest day after the issue date for which an input is published: first NESO's day-ahead flows snapshot (`meta.model: flow_utilisation`), otherwise NESO's day-ahead national wind forecast (`wind_forecast`, issue #58; NESO's flows file appears to be unpublished at weekends). If neither covers a future day it is `same_day_replay`: the latest published day, labelled as a retrospective illustration. The wind model's live input is a genuine day-ahead forecast, but its archive for fitting and scoring is stamped on the target morning, so its backtest is retrospective and probably optimistic; the flow model's scores are kept alongside as `backtest.flow_model`. Rerun with `--refresh` as inputs appear.

## Layout

```text
models/
  build_forecast.py        CLI for forecast.json
  turnup/                  timeutil, stats, fetch, inputs, forecast, turnup_prob
  tests/                   offline tests
```
