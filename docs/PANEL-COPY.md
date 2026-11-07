# Panel copy

Final plain-English copy for the three slide-over panels of the dashboard ([#71](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/71)): **Why it matters**, **What if** and **Proof**. Each line is at most 25 words and is paired with the file and field it comes from.

Every number is computed by `python models/panel_numbers.py` from `data/public/`. `python -m pytest models/tests/test_panel_numbers.py` fails if a value changes or if this page quotes a number the script no longer produces.

**Which source each number uses.** "Daily file" means `curtailment_daily.json` (NESO Wind BOA volumes). "Replay" means `replay/2026-10-27.json` (Elexon Tagged accepted bid volumes). Since #99 they agree for 27 October: 168,351 MWh (daily file) and 168,390 MWh (replay), 0.02% apart. The older pair (168,351 vs 183,752 MWh) is obsolete. Cable what-if percentages use the replay total.

## Why it matters

| # | Line | Source file : field | Value |
| --- | --- | --- | --- |
| 1 | Scotland's wind farms can make more power than the cables to England can carry, so wind is paid to switch off. | `replay/2026-10-27.json` : `scotex_flow_mw` vs `scotex_limit_mw` | 48 of 48 half-hours over the limit |
| 2 | Since 1 April, 7.12 TWh of Scottish wind was turned down. | `curtailment_daily.json` : sum of `days[].curtailed_mwh` (220 days to 6 Nov) | 7.12 TWh |
| 3 | That is roughly 2.6 million homes' electricity for a year (approximate, about 2,700 kWh per home). | derived from line 2 | 2.6 million homes |
| 4 | On 27 October alone, 168,351 MWh was turned down: roughly 62,000 homes for a year (approximate). | `curtailment_daily.json` : `days[date=2026-10-27].curtailed_mwh` | 168,351 MWh; 62,000 homes |
| 5 | Wind farms were paid £6.4m to switch off that day. | `curtailment_daily.json` : `days[date=2026-10-27].wind_paid_gbp` | £6.4m |
| 6 | Over 210 days to 29 October, accepted bids to turn wind down came to £188m. | `iceberg.json` : `wind_bids_gbp` | £188m |
| 7 | Gas plants' offers over the same days were £1.81bn, and NESO's own constraint cost £1.79bn. | `iceberg.json` : `ccgt_offers_gbp`, `neso_thermal_gbp` | £1.81bn; £1.79bn |
| 8 | These are three measures of one problem. Do not add them up. | `iceberg.json` : `note` | "Magnitude comparison, not additive" |
| 9 | NESO also asks businesses to switch demand on. In October it asked for 81,000 MWh. | `dfs_requests.json` : sum of `required_mw` / 2 (324 half-hours) | 81,000 MWh |
| 10 | It procured 37.65 MWh, which is 0.046% of the request. | `dfs_requests.json` : sum of `procured_mw` / 2 | 37.65 MWh; 0.046% |
| 11 | On 27 October NESO asked for 500 MW from 11:00 to 23:00 UTC and procured 2.4 MWh. | `dfs_requests.json` : events starting 2026-10-27, `required_mw`, `procured_mw` / 2 | 500 MW; 2.4 MWh |

## What if

| # | Line | Source file : field | Value |
| --- | --- | --- | --- |
| 1 | This is a replay of one day, 27 October. It is retrospective, not revenue. | `sandbox.json` : `meta.retrospective`; `copilot.json` : `caveat` | n/a |
| 2 | A 50 MW electrolyser in zone Z1 following our schedule would be ready for 7 half-hours and use 175 MWh. | `sandbox.json` : `test_vectors[ours-2026-10-27-Z1-100].expected.mwh`, `accepted_half_hours` | 175 MWh |
| 3 | NESO's payment at the bid, £10,500, does not cover that electricity, £16,091. | `sandbox.json` : same vector, `gross_gbp`, `energy_cost_gbp` | £10,500; £16,091 |
| 4 | Valuing the energy at an assumed £100 per MWh, the net is £11,909. | `sandbox.json` : same vector, `net_gbp` | £11,909 |
| 5 | Perfect hindsight earns £12,594, so our schedule gets 94.6% of it. | `copilot.json` : `summary.net_gbp.oracle`, `summary.pct_of_oracle` | £12,594; 94.6% |
| 6 | It only pays if the site values the energy above about £32 per MWh. | `copilot.json` : `summary.break_even_value_gbp_per_mwh.ours` | £32/MWh |
| 7 | This assumes the bid is accepted and fully delivered, which is optimistic, and rests on 28 tradable half-hours. | `copilot.json` : `summary.tradable_half_hours`, `caveat` | 28 |
| 8 | Up to 175 MWh of that use could match wind otherwise turned down: an approximate upper bound. | `sandbox.json` : same vector, `wind_matched_mwh` | 175 MWh |
| 9 | Cable what-if rule: avoided = min(curtailed, reduction in max(0, flow minus limit)), per half-hour. A simple counterfactual, not a power-flow model. | `replay/2026-10-27.json` : `farms[].curtailed_mwh`, `scotex_flow_mw`, `scotex_limit_mw` | rule |
| 10 | Replay total that day is 168,390 MWh. Flow is NESO's day-ahead forecast, 10,234 to 12,713 MW. | `replay/2026-10-27.json` : `periods[]` | 168,390 MWh; 10,234 to 12,713 MW |
| 11 | Adding 1 GW of cable would avoid about 24,000 MWh (14%) of that day's turn-down. | same rule, +1,000 MW on `scotex_limit_mw`; MW x 0.5 h = MWh | 24,000 MWh (14%) |
| 12 | Adding 5 GW would avoid about 120,000 MWh (71%). Cables take years; a flexible load can bid today. | same rule, +5,000 MW | 120,000 MWh (71%) |

## Proof

| # | Line | Source file : field | Value |
| --- | --- | --- | --- |
| 1 | Every number comes from public NESO and Elexon data. | each file's `meta.source` | n/a |
| 2 | Our daily wind turn-down tracks NESO's own thermal-constraint volumes over 186 days, with correlation 0.915. | `curtailment_daily.json` : `validation.volume_corr_daily`, `n_days` | 0.915 |
| 3 | For 27 October, Elexon accepted bids give 168,390 MWh and NESO's wind series gives 168,351 MWh. | `replay/2026-10-27.json` : `curtailed_mwh`; `curtailment_daily.json` | 168,390 vs 168,351 MWh |
| 4 | The cable limit and flow are NESO's day-ahead forecast, not a measurement. | `replay/2026-10-27.json` : `meta.scotex_note` | n/a |
| 5 | On 27 October the limit was 4,850 MW until 04:30 UTC, then 2,800 MW. | `replay/2026-10-27.json` : `periods[].scotex_limit_mw` | 4,850 MW until 04:30 UTC, then 2,800 MW |
| 6 | Forecast flow ran 10,234 to 12,713 MW. Above the limit, that signals potential constraint pressure; it does not prove how much was turned down. | `replay/2026-10-27.json` : `periods[].scotex_flow_mw` | 10,234 to 12,713 MW |
| 7 | Tested on 1 September to 5 November, the forecast missed by 663 MWh per half-hour on average. | `forecast.json` : `backtest.mae_mwh.model`, `test_window` | 663 MWh |
| 8 | "Same as two days earlier" missed by 1,225 MWh. | `forecast.json` : `backtest.mae_mwh.persistence` | 1,225 MWh |
| 9 | The p10-p90 band covered 71% of outcomes, not 80%. The test was run after the fact. | `forecast.json` : `backtest.interval_coverage_p10_p90`, `retrospective` | 71% |

## Do not say

- "Delivered" for DFS. Say **procured**.
- That the cable excess "is switched off", or that the forecast flow "causes" or "proves" turn-down. It signals potential constraint pressure.
- That the SCOTEX flow is measured. It is a day-ahead forecast.
- That the limit was 2,800 MW "all day". It was 4,850 MW until 04:30 UTC. Say "most of the day".
- "Revenue", "profit" or "earnings". Say retrospective replay, net of electricity at an assumed site value.
- That the load's MWh is wind. The `mwh` is what a load uses; wind matched is an approximate upper bound.
- That DFS zones Z1 to Z3 are "Scotland". They are NESO zone IDs.
- That the p10-p90 band is an 80% interval, or that the forecast is calibrated. It covered 71%.
- Any CO2 saving. We make no CO2 claim.
- "Homes powered" without "roughly", "approximate" and the 2,700 kWh per home per year basis.
- A total of £188m + £1.81bn + £1.79bn, or who pays.
- 168 GWh and 184 GWh (or 183,752 MWh) for 27 October in the same breath. Use 168 GWh; 183,752 MWh is obsolete since #99.
- That DFS "began procuring" on 8 October. Say the first request in our data is 8 October (the service began 7 October).
- "7.12 TWh over 220 days to 6 Nov" as a fixed sentence. Only 192 of those days have data; let the UI compute it.
