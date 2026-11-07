# Demo video shot list and Devpost submission

Submission copy for Turn Up Scotland ([issue #107](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/102)), lane B. It sits beside [`DEMO.md`](DEMO.md) (live script and judge Q&A) and [`NARRATIVE.md`](NARRATIVE.md) (story and winner research), and picks 27 Oct 2026 as the hero day, as `NARRATIVE.md` recommends.

Every figure was recomputed from `data/public/` on `main` (generated 2026-11-07). Each figure's file is in the [source table](#source-table) at the end. All files carry `"retrospective": true`. If the pipeline or models are re-run before recording, re-check the screens against that table.

**Honesty rules for every line below.** Wind is "procured", never "delivered". The SCOTEX flow is NESO's day-ahead forecast, so it signals potential constraint pressure and proves nothing about what was turned down. MWh is what a load uses. DFS zones Z1 to Z3 are NESO zone IDs, not places. Copilot results are retrospective and net of electricity, not revenue. The forecast's P10 to P90 band covered 71% of half-hours, and the backtest is probably optimistic.

## Part 1: demo video shot list (about 2:00)

**Recording setup.** Run `npm --prefix web run build && npm --prefix web run preview`, record at 1080p with the network off, and add the captions below in editing. Screens are reached from the tab bar or the arrow keys. Record the voice-over separately and cut to it. The Waste screen needs `replay/2026-10-27.json` (present on `main`); if the day picker does not list 27 Oct, rebuild the web app first.

**Tone.** Calm and plain. No numbers beyond those in the table. Do not say "delivered", "saved", "revenue" or "Scotland" for a DFS zone.

| # | Sec | Screen recording (exact app state) | Voice-over | On-screen caption | Source of numbers |
| --- | --- | --- | --- | --- | --- |
| 1 | 0:00 to 0:08 (8) | Title card "Turn Up Scotland" on dark, then cut to **The Waste** (`#waste`) with **27 Oct 2026** chosen in the day picker, scrubber at 00:00, nothing playing. | "When the cables south are full, Scotland pays wind farms to switch off." | Turn Up Scotland | None. |
| 2 | 0:08 to 0:22 (14) | Same screen. Press **Play** and let the day run to the end; the farms grey out and the counters climb. Hold the last frame 3 seconds on the end-of-day totals. | "On 27 October, 168 gigawatt-hours of Scottish wind was curtailed, and about £6.4 million was paid to switch it off. One day." | 27 Oct 2026: 168 GWh curtailed, about £6.4M paid to wind | `curtailment_daily.json`: 168,351 MWh and £6,424,730, the largest of 220 days. |
| 3 | 0:22 to 0:34 (12) | Same screen, only if the build shows the SCOTEX lines: scrub to 12:00 UTC and hover the border line. If the build does not show them, skip this shot and extend shot 2. | "NESO's day-ahead forecast had more flow wanting to go south than the limit allowed, all day. That signals potential constraint pressure. It is a forecast, not a measurement." | Day-ahead forecast flow vs limit. Potential pressure, not proof. | `replay/2026-10-27.json`: forecast flow 10,234 to 12,713 MW, above the limit in all 48 half-hours; limit 4,850 MW early, then 2,800 MW. |
| 4 | 0:34 to 0:46 (12) | **Hidden Bill** (`#iceberg`), no interaction. Slow push in from the wind bar to the two bars below the waterline. | "The £188 million paid to wind is the visible part. Gas turn-up offers and NESO's own constraint cost are each about £1.8 billion over the same 210 days. They overlap, so you cannot add them." | £188M to wind. About £1.8B and £1.8B beneath. Parallel measures, not a sum. | `iceberg.json`: 187,995,768; 1,814,407,407; 1,787,705,531; 210 days. |
| 5 | 0:46 to 1:00 (14) | **Help Wanted** (`#help`). Point at the fill bar, then the zone caption. | "Since October, NESO has asked flexible demand to switch on. Across 30 requests it asked for 81,000 megawatt-hours and procured about 38. Zones are NESO's IDs, not places." | Asked: 81,000 MWh. Procured: about 38 MWh (0.046%). | `dfs_requests.json`: 81,000 MWh required and 37.65 MWh procured over 30 events, 324 half-hours, 8 to 31 Oct. |
| 6 | 1:00 to 1:16 (16) | **Tomorrow** (`#tomorrow`). Show the chart for 8 Nov, then the three metric cards with the **Retrospective** note in frame. | "We forecast curtailment a day ahead. Tomorrow looks calm, and the model says so. In a backtest in date order, its average error was 663 megawatt-hours against 1,225 for persistence. The backtest is retrospective and probably optimistic." | Backtest MAE: model 663 MWh, persistence 1,225 MWh. Retrospective, probably optimistic. | `forecast.json`: `backtest` (3,170 half-hours, 1 Sep to 5 Nov) and `periods` (8 Nov median 0 MWh). |
| 7 | 1:16 to 1:42 (26) | **Flex Copilot** (`#copilot`). Choose **2026-10-27** in the Day menu and press **Replay**. Hold on the schedule showing ready from 11:00 to 14:30 UTC at £60, then scroll to the ring and the "Does it still pay?" chart. | "The copilot turns that into a schedule for a modelled 50 megawatt electrolyser in zone Z1: be ready from 11:00 to 14:30 UTC, bid £60 per megawatt-hour. Across 13 replay days it reaches 94.6% of perfect hindsight, but all of that came from one day. This is not revenue: settlement alone did not cover the electricity." | 94.6% of perfect hindsight on 13 replay days. One day carries it. Not revenue. | `copilot.json`: `summary` and the 27 Oct schedule (seven ready half-hours at £60). Settlement £10,500 vs electricity £16,091. |
| 8 | 1:42 to 1:52 (10) | **Under the Hood** (`#hood`). Point at the correlation stat, then the "Days that don't reconcile" table. | "We rebuilt curtailment from public NESO and Elexon data and checked it against NESO's own figure. Daily correlation 0.915, at 84% of NESO's volume, and the days that do not match are on show." | Correlation with NESO: 0.915. 84% of NESO volume. Mismatches shown. | `curtailment_daily.json` `validation`: 186 days, ratio 0.837, correlation 0.915. |
| 9 | 1:52 to 2:00 (8) | End card: "Turn Up Scotland", repository URL, "Data: NESO and Elexon open data". | "Turn Up Scotland. See the waste, forecast the call, be ready to answer it." | See the waste. Forecast the call. Answer it. | None. |

Total 119 seconds. For a 90-second cut, drop shots 3 and 8 and trim shot 7 to 18 seconds.

**Fallbacks while recording.** If a screen shows "sample" or loading text it has fallen back to a contract fixture; re-record after the data loads. Do not use **Be the Operator** (see `DEMO.md`).

## Part 2: Devpost text

Paste the sections below. Tracks entered: **HRT, Best Use of Data for Predictions & Decision Making** and **G-Research, Make the Invisible Visible**.

### One-line pitch

Scotland pays wind farms to switch off when the cables south are full; Turn Up Scotland shows that hidden bottleneck, forecasts when NESO will ask for help, and tells a flexible load when to be ready and what to bid.

### Tagline options

1. "The grid is asking for help. Nobody's answering."
2. "See the waste. Forecast the call. Answer it."
3. "81,000 MWh asked for. About 38 procured."

### Inspiration

When the transmission lines out of Scotland are full, NESO pays wind farms to stop and pays gas plants elsewhere to start. Payments to wind make headlines. Two things get less attention: the larger measures of cost that sit beneath them, and the fact that NESO's Demand Flexibility Service now asks flexible demand to soak up the surplus and almost none is procured. On 27 October 2026 alone, 168 GWh of Scottish wind was curtailed. We wanted to make that hidden system visible and turn it into something a person can act on.

### What it does

Turn Up Scotland is a seven-screen web app built only on public NESO and Elexon data.

- **The Waste** replays a day farm by farm. On 27 Oct 2026, 168 GWh was curtailed and about £6.4M paid to wind; from 1 Apr to 6 Nov the series sums to about 7.12 TWh.
- **Hidden Bill** sets £188M paid to wind against two parallel measures over the same 210 days: £1.8B of gas turn-up offers and £1.8B of NESO's published thermal constraint cost. They overlap and are not added.
- **Help Wanted** shows the 30 DFS turn-up requests since 8 October: 81,000 MWh asked for, about 38 procured. Zones are NESO IDs, not places.
- **Tomorrow** gives a half-hourly day-ahead curtailment forecast (P10, P50, P90), the chance of a heavy period and of a turn-up request, with a chronological backtest beside every score.
- **Flex Copilot** turns the forecast into a ready-and-bid schedule for a flexible load and replays real days against a naive rule and a perfect-hindsight oracle, net of electricity.
- **Be the Operator** lets a visitor make the calls and compares them with the Copilot and the oracle.
- **Under the Hood** shows how each number is built, checked against NESO, and where it does not reconcile.

The app runs from committed JSON, so it works offline.

### How we built it

- **Team and process:** three humans, each paired with a Claude Code developer agent, with Codex agents reviewing pull requests. GitHub Issues were the work queue, with one issue, one branch and one PR per change, and humans made scope and merge decisions.
- **Contract first:** a JSON data contract with hand-made fixtures let the data pipeline, the models and the web app be built in parallel. The web app falls back to fixtures for any file not ready yet.
- **Data pipeline:** Python pulls NESO Wind BOA volumes, Elexon physical notifications, availability, bids and indicative cashflows, the NESO Constraint Breakdown, the NESO DFS dataset and NESO's day-ahead SCOTEX flow and limit. It rebuilds curtailment per farm and half-hour and writes the contract files.
- **Models:** a day-ahead quantile forecast driven by NESO's national wind forecast, scored with weekly rolling-origin folds that train only on earlier dates. The Copilot ranks half-hours by expected margin using an acceptance probability learned from earlier days, and is scored on the same days and costs as the naive and oracle policies.
- **Front end:** React, Vite and TypeScript, hand-built SVG charts, keyboard-operable controls, light and dark modes.
- **Checks:** Markdown lint, web build, pipeline tests and model tests run on every PR.

### Challenges we ran into

- **Defining curtailment honestly.** Telling a paid turn-down from an outage needs several datasets lined up per half-hour. Our daily volume is 0.837 of NESO's, and 76 of 220 days fall outside 0.3x to 2x of NESO's figure or have no NESO figure on one side. We show those days instead of tuning them away.
- **Forecast vintage.** The wind-forecast archive we score on is stamped on the target morning, a later view than a true day-ahead forecast. We label the backtest retrospective and probably optimistic, and the P10 to P90 band covered 71% of half-hours, below its nominal 80%.
- **Thin DFS history.** DFS began procuring constraint turn-up in October, so there are 30 events. The Copilot's result rests on 28 tradable half-hours in zone Z1, and all of its value comes from 27 October.
- **Money that does not add up.** In the replay, DFS settlement (£10,500) did not cover the electricity (£16,091). We report net results and a sensitivity to the site's value for the energy rather than a flattering gross number.
- **Parallel work in 24 hours.** Three lanes and several agents needed a frozen contract and clear file ownership.

### Accomplishments that we're proud of

- A daily Scottish curtailment series from public per-farm data that tracks NESO's published volume with a daily correlation of 0.915 over 186 days.
- A forecast that beats persistence and the training-mean baseline in a chronological backtest: error 663 MWh against 1,225 and 999, and a heavy-period Brier score of 0.149 against 0.471 for persistence. Retrospective, and probably optimistic.
- A decision tool scored against a naive rule and a perfect-hindsight oracle (94.6% of the oracle on 13 replay days), with its weaknesses on screen.
- An unreconciled-days table in the product instead of a hidden caveat.
- A demo that works offline.

### What we learned

- The useful number is often one that is not published. The story appeared only when NESO and Elexon datasets were joined and checked against each other.
- Honest baselines matter more than a clever model. Persistence, a naive rule and an oracle are what make a score mean something.
- A decision tool has to be net of costs. Gross settlement looked attractive; net of electricity, value depends on what the energy is worth to the site.
- A written contract and fixtures let people and agents work in parallel without waiting on each other.

### What's next

- Score the forecast on our own archived snapshots so the backtest is no longer retrospective.
- Confirm the DFS zone-to-region mapping with NESO before naming any region.
- Re-fit the Copilot per load type, size and zone as more DFS events accumulate.
- Model partial delivery using NESO's settled volumes.
- Refresh the hosted site live.

### Built with

Python (standard library only), JSON data contracts, React, Vite, TypeScript, SVG, GitHub Actions, Claude Code, Codex. Data: NESO Data Portal (Wind BOA volumes, Constraint Breakdown, Demand Flexibility Service, day-ahead constraint flows and limits) and Elexon Insights Solution (physical notifications, availability, bids, indicative cashflows).

### HRT: Best Use of Data for Predictions & Decision Making

The project runs from prediction to decision. Tomorrow forecasts curtailment and the chance of a NESO turn-up request for each half-hour. Flex Copilot turns the forecast into a ready-and-bid schedule. Both are scored the way a trading desk would want. The forecast is backtested in date order against persistence and the training mean (3,170 half-hours; error 663 MWh against 1,225 and 999). The decision is scored against a naive rule and a perfect-hindsight oracle on the same days and costs, net of electricity (94.6% of the oracle on 13 replay days). We state the limits in the product: results are retrospective, one day carries all the Copilot's value, and the naive rule wins above about £134 per MWh of site value.

### G-Research: Make the Invisible Visible

We make three hidden layers visible, each checked against a published source.

1. **The hidden waste:** farm-by-farm curtailment rebuilt from NESO Wind BOA volumes and priced with Elexon cashflows. Daily correlation with NESO's constraint volume is 0.915.
2. **The hidden bill:** £188M paid to wind sits above two parallel measures of about £1.8B each. Gas turn-up offers track NESO's constraint cost at 0.945 daily correlation. They are shown as magnitudes, not a sum.
3. **The unanswered call:** NESO asked flexible demand for 81,000 MWh of turn-up and about 38 MWh was procured, taken straight from NESO's DFS dataset.

## Source table

| Figure | Value | File and field |
| --- | --- | --- |
| 27 Oct curtailed and paid | 168,351 MWh; £6,424,730; largest of 220 days | `data/public/curtailment_daily.json` `days[]` |
| Curtailed 1 Apr to 6 Nov | 7,116,615 MWh (about 7.12 TWh), 220 days | `data/public/curtailment_daily.json`, sum of `curtailed_mwh` |
| Correlation with NESO, volume ratio | 0.915; 0.837; 186 days to 29 Oct | `data/public/curtailment_daily.json` `validation` |
| Days not reconciling | 76 of 220 (10 with no NESO figure) | Under the Hood table, from `data/public/curtailment_daily.json` (carried from `DEMO.md`; not recomputed here) |
| SCOTEX 27 Oct | forecast flow 10,234 to 12,713 MW; limit 4,850 then 2,800 MW; flow above limit in 48 of 48 half-hours | `data/public/replay/2026-10-27.json` `periods[].scotex_flow_mw`, `scotex_limit_mw` |
| Wind bids, CCGT offers, NESO thermal | £187,995,768; £1,814,407,407; £1,787,705,531; 210 days | `data/public/iceberg.json` |
| CCGT vs NESO correlation | 0.945 | `data/public/iceberg.json` `ccgt_vs_neso_corr_daily` |
| DFS asked and procured | 81,000 MWh; 37.65 MWh; 0.046%; 30 events; 324 half-hours; 8 to 31 Oct | `data/public/dfs_requests.json`, sums of `required_mw` / 2 and `procured_mw` / 2 |
| Forecast backtest | 3,170 half-hours, 1 Sep to 5 Nov; MAE 663.2 / 1,225 / 999; Brier 0.149 / 0.471 / 0.299; P10 to P90 coverage 0.71 | `data/public/forecast.json` `backtest` |
| 8 Nov forecast | median 0 MWh all day | `data/public/forecast.json` `periods[].curtailed_mwh_p50` |
| Copilot | 94.6% of oracle; 13 scored days; settlement £10,500; electricity £16,091; 28 tradable half-hours; 27 Oct ready 11:00 to 14:30 UTC at £60; naive wins above about £134 per MWh | `data/public/copilot.json` `summary`, `days[]`, `sensitivity` (the £134 crossover is a straight-line interpolation of `sensitivity` between £100 and £150, where ours-minus-naive goes from +£9,933 to -£4,486) |
