# Demo script, Devpost write-up and judge Q&A

Submission materials for Turn Up Scotland ([issue #63](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/63)). Every figure below comes from a committed file in `data/public/` (cited inline) as generated on 2026-11-07. All of those files carry `"retrospective": true`. If the pipeline or models are re-run before the demo, re-check the numbers here against the screens.

## Numbers at a glance

| Figure | Value | Source file |
| --- | --- | --- |
| Scottish wind curtailed, 1 Apr to 6 Nov 2026 (220 days) | 7,116,615 MWh (about 7.12 TWh) | `curtailment_daily.json` (sum of `days[].curtailed_mwh`) |
| Daily volume correlation with NESO thermal constraints | 0.915 over 186 days, 1 Apr to 29 Oct 2026 | `curtailment_daily.json` `validation` |
| Our volume divided by NESO's | 0.837 | `curtailment_daily.json` `validation` |
| Days outside 0.3× to 2× of NESO, or one side missing | 76 of 220 (10 have no NESO figure) | `curtailment_daily.json`, as listed on Under the Hood |
| Paid to wind to switch off (bids, Scottish wind) | £187,995,768 (screen: £188M) | `iceberg.json` |
| CCGT turn-up offers, same window | £1,814,407,407 (screen: £1.8B) | `iceberg.json` |
| NESO published thermal constraint cost, same window | £1,787,705,531 (screen: £1.8B) | `iceberg.json` |
| Iceberg window | 210 days, 1 Apr to 29 Oct 2026; CCGT vs NESO daily correlation 0.945 (screen: 0.94) | `iceberg.json` |
| DFS turn-up requests (`Upwards`/`System`) | 30 events, 324 half-hours, 8 to 31 Oct 2026 | `dfs_requests.json` |
| Turn-up requested vs procured | 81,000 MWh requested; fill rate 0.046% | `dfs_requests.json` (screen computes procured MW ÷ required MW) |
| Median accepted DFS price / auction close to delivery | £57.50/MWh (82 priced half-hours) / 5.0 h | `dfs_requests.json` |
| Forecast backtest, 1 Sep to 5 Nov 2026, 3,170 half-hours | MAE 663 MWh vs persistence 1,225 and training mean 999 | `forecast.json` `backtest` |
| Heavy-period Brier / AUC | 0.149 vs persistence 0.471 and prior 0.299 / 0.914 vs persistence 0.528 | `forecast.json` `backtest` |
| Forecast for 8 Nov 2026 | Median curtailment 0 MWh all day; P(turn-up request) 23% from 11:00 to 22:30 UTC | `forecast.json` `periods` |
| Copilot, 50 MW electrolyser in zone Z1, 13 scored days | 94.6% of oracle; net £1,976 naive, £11,909 ours, £12,594 oracle at £100/MWh site value | `copilot.json` `summary` |
| Copilot gross settlement vs electricity | £10,500 settlement vs £16,091 electricity | `copilot.json` `summary` |
| DFS settled cost ÷ accepted cost | 0.394 across all DFS (476 half-hours) | `copilot.json` `validation` |

## 1. Three-minute live demo script

**Setup before going on stage.** Run `npm --prefix web run build && npm --prefix web run preview` and open the preview URL with no network dependency. Start on `#waste`. The arrow keys move between screens; the screen tabs are at the top. Have the recorded video open in a second tab, paused at 0:00.

**General fallback.** If the preview fails to start, play the 90-second video and narrate over it. If one screen shows "sample" or loading text, it has fallen back to a contract fixture: say so, then move to the next screen.

| Time | Screen (tab) | Click | Say | Fallback |
| --- | --- | --- | --- | --- |
| 0:00–0:25 | **The Waste** (`#waste`) | Pick **14 Oct 2026** in the day picker, press **Play**. Hover one grey-ringed farm. | "Each dot is a Scottish wind farm. When the cables south are full, NESO pays farms to switch off. This is a replay of 14 October. Watch them go dark: at 04:00 UTC 90 farms are paid to stop. By the end of the day 149 GWh was thrown away and £5.3M paid to wind, for one day." | Drag the scrubber by hand. If the map fails, switch to the video at 0:00. |
| 0:25–0:50 | **Hidden Bill** (`#iceberg`) | None. | "The headline number is what wind gets paid: £188M over 210 days. Below the waterline are two much bigger measures of the same constraint: £1.8B in gas turn-up offers and £1.8B in NESO's own constraint cost, about 9.7 times larger. These are parallel measures that overlap, not a breakdown you can add up." | Read the figures from the table above. |
| 0:50–1:10 | **Help Wanted** (`#help`) | Point at the fill bar, then the zone caption. | "Since 7 October NESO has asked flexible demand to switch on and soak up that wind. Across 30 events it asked for 81,000 MWh. It procured 0.046%. Bids were accepted at a median £57.50/MWh, with about five hours between auction close and delivery. Zones are NESO's IDs, Z1 to Z3; we don't claim which region they cover." | Same. |
| 1:10–1:40 | **Tomorrow** (`#tomorrow`) | Point at the **Retrospective** note, then the three metric cards. | "So when will NESO need help? This is our day-ahead forecast for 8 November. Tomorrow is calm, and the model says so: nothing heavy. The proof is the backtest, run in date order on 3,170 half-hours it never trained on: error 663 MWh against 1,225 for persistence, Brier 0.149 against 0.471. It's labelled retrospective because the archive it was scored on was stamped on the target morning, so treat those scores as optimistic." | If the chart is empty or flat, say "calm day" and go straight to the metric cards. |
| 1:40–2:25 | **Flex Copilot** (`#copilot`) | Choose **2026-10-27** in the Day menu, press **Replay**. Scroll to the ring and the "Does it still pay?" chart. | "Now act on it. A 50 MW electrolyser in zone Z1. On 27 October the copilot says be ready from 11:00 to 14:30 UTC, bidding £60/MWh. Across 13 replay days it captures 94.6% of the oracle, the perfect-hindsight upper bound, against much less for the naive rule. Two honest caveats: almost all of that is one day, and DFS settlement alone (£10,500) does not cover the electricity (£16,091). It only pays if the site values the energy; above about £134/MWh the naive rule wins." | The default day (15 Oct) shows zeros; if the menu misbehaves, narrate from the ring and sensitivity chart. |
| 2:25–2:55 | **Under the Hood** (`#hood`) | Point at the correlation stat, then the "Days that don't reconcile" table. | "Why trust any of this? We rebuild curtailment from raw Elexon instructions and check it against NESO: daily correlation 0.915, at 84% of NESO's volume. And here are the 76 days that don't reconcile, including 10 where NESO publishes nothing. We show them rather than hide them." | Read the stats from the table above. |
| 2:55–3:00 | Any | None. | "Turn Up Scotland: see the waste, forecast the call, and be ready to answer it." | — |

**Be the Operator** (`#operator`) is left out of the 3-minute run. Its current data makes it a weak demo. On 14 Oct every two-hour block soaks up the full 100 MWh, so any six picks tie the Oracle at 600 MWh. `copilot.json` also has no 14 Oct schedule, so the Copilot row scores 0 MWh. Use it only for judges at the table, or after the game is moved to a day with a Copilot schedule.

## 2. Ninety-second video shot list

Record at 1080p from `vite preview` with the network off, so every frame comes from committed JSON. Add captions with the voice-over lines.

| # | Time | Shot | Voice-over |
| --- | --- | --- | --- |
| 1 | 0:00–0:08 | Title card: "Turn Up Scotland". Fade to The Waste, 14 Oct, paused at 00:00. | "Scotland pays wind farms to switch off when the cables south are full." |
| 2 | 0:08–0:22 | The Waste: press Play; the map greys out and the counters climb. Hold on the end-of-day totals. | "On 14 October, 149 GWh was thrown away and £5.3M paid to wind, in one day." |
| 3 | 0:22–0:35 | Hidden Bill: slow push in from the wind bar to the two bars below the waterline. | "That's the visible bill. Gas turn-up offers and NESO's constraint cost are each about £1.8B over the same 210 days: parallel measures, not a sum." |
| 4 | 0:35–0:45 | Help Wanted: the fill bar, then the zone caption. | "NESO now asks flexible demand to switch on. It procured 0.046% of what it asked for." |
| 5 | 0:45–0:58 | Tomorrow: the forecast chart, then the three metric cards with "Retrospective" visible. | "We forecast curtailment a day ahead, and beat persistence on every score in a chronological backtest, labelled retrospective." |
| 6 | 0:58–1:15 | Flex Copilot: select 27 Oct, press Replay as the load switches on; cut to the ring and the sensitivity chart. | "The copilot turns that forecast into a ready-and-bid schedule: 94.6% of perfect hindsight on 13 replay days. Not a revenue claim: settlement alone doesn't cover the electricity." |
| 7 | 1:15–1:25 | Under the Hood: correlation stat, then the unreconciled-days table. | "Every number is rebuilt from raw data and checked against NESO: 0.915 daily correlation, with the mismatches on show." |
| 8 | 1:25–1:30 | End card: project name, repository URL, "Data: NESO and Elexon open data". | "Turn Up Scotland." |

## 3. Devpost text (ready to paste)

### Tagline

Scotland pays its wind farms to switch off. We show the hidden bill, forecast when NESO will ask for help, and tell flexible loads when to answer.

### Inspiration

When the transmission lines out of Scotland are full, NESO pays wind farms to stop and pays gas plants further south to start. The payments to wind make headlines. The larger cost of managing the constraint, and the fact that NESO now asks flexible demand to soak up the surplus and almost nobody answers, do not. We wanted to make that invisible system visible and turn it into a decision someone can act on.

### What it does

Turn Up Scotland is a seven-screen web app built entirely on public NESO and Elexon data:

- **The Waste** replays a stormy day farm by farm. On 14 Oct 2026, 149 GWh of Scottish wind was curtailed and £5.3M paid to switch it off (`replay/2026-10-14.json`). Over 1 Apr to 6 Nov 2026 we count about 7.12 TWh (`curtailment_daily.json`).
- **Hidden Bill** sets £188M paid to wind against two parallel measures of system cost over the same 210 days: £1.8B of CCGT turn-up offers and £1.8B of NESO's published thermal constraint cost (`iceberg.json`). They overlap; they are not an additive breakdown.
- **Help Wanted** shows NESO's Demand Flexibility Service turn-up requests: 30 events since October, 81,000 MWh asked for, 0.046% procured (`dfs_requests.json`).
- **Tomorrow** gives a half-hourly day-ahead curtailment forecast (p10, p50, p90), the probability of a heavy period and of a turn-up request, and a chronological backtest beside every score (`forecast.json`).
- **Flex Copilot** turns the forecast into a ready-and-bid schedule for a flexible load (electrolyser, data centre or heat network) and replays real days against a naive rule and a perfect-hindsight oracle, net of electricity cost, with a sensitivity chart for the site's value of the energy (`copilot.json`).
- **Be the Operator** lets you make the calls yourself and compares them with the Copilot and the oracle.
- **Under the Hood** shows how each number is rebuilt and checked against NESO, including the days that don't reconcile.

The app runs offline from committed JSON, so the demo works without venue Wi-Fi or windy weather.

### How we built it

- **Team:** three humans, each paired with a Claude Code developer agent, with Codex agents reviewing every pull request. Work ran in three lanes: data pipeline (lane A), models and decision (lane B) and web front end (lane C).
- **Coordination:** the agents were coordinated through a shared hub. GitHub Issues were the work queue, with one issue, one branch and one PR per change. A GitHub-Issues-backed team inbox and a local agent inbox handled questions and handoffs between agents. Humans owned scope and merge decisions.
- **Contract first:** a JSON data contract (`contracts/README.md`) with hand-made fixtures let all three lanes build in parallel from hour one. The web app falls back to the fixtures for any file that isn't ready yet.
- **CI:** Markdown lint, web build, pipeline tests and model tests run on every PR.
- **Data:** a Python pipeline pulls NESO Wind BOA volumes, Elexon physical notifications, availability, bids and indicative cashflows, the NESO Constraint Breakdown and the NESO DFS dataset. It rebuilds curtailment per farm and half-hour, separates paid curtailment from outages and writes the contract files.
- **Models:** a day-ahead model driven by NESO's national wind forecast, plus a flow-utilisation model, scored with rolling-origin weekly folds that train only on earlier dates. The Copilot ranks half-hours by expected margin, using an acceptance probability learned from earlier days, and is scored on the same days and costs as the naive and oracle policies.
- **Front end:** React, Vite and TypeScript, a static app with hand-built SVG charts, keyboard-operable controls and light and dark modes.

### Challenges we ran into

- **Defining curtailment honestly.** Telling a paid turn-down from an outage needs physical notifications, availability and accepted bids lined up per half-hour. Our reconstruction runs at 0.837 of NESO's volume, and 76 of 220 days fall outside 0.3× to 2× of NESO's figure or lack one side. We show those days instead of tuning them away.
- **Forecast leakage.** Historical day-ahead flow snapshots aren't archived with publication times, so the archive we score on is stamped on the target morning. We label every backtest retrospective and probably optimistic, and started archiving our own snapshots.
- **No future flows.** NESO hadn't published future flow data for 8 Nov, so lane B added a fallback driven by the national day-ahead wind forecast and disclosed it in the file metadata.
- **Money that doesn't add up.** DFS settlement in the replay (£10,500) doesn't cover the electricity bought (£16,091), and NESO's settled cost is only 39.4% of accepted cost across DFS so far. We switched the Copilot to net £ and added a sensitivity chart rather than show a flattering gross figure.
- **Parallel work in 24 hours.** Three lanes and several agents editing at once needed a frozen contract, fixtures and strict file ownership to avoid collisions.

### Accomplishments that we're proud of

- A reconstruction of Scottish wind curtailment from raw instructions that tracks NESO's published volume with a daily correlation of 0.915 over 186 days.
- A forecast that beats persistence and the training mean on MAE (663 vs 1,225 and 999 MWh), Brier (0.149 vs 0.471 and 0.299) and AUC (0.914 vs 0.528) in a chronological backtest, labelled as retrospective.
- A decision tool scored against both a baseline and an oracle, with its weaknesses on screen: small samples, the full-delivery assumption, and the site value at which the naive rule wins.
- Pay-as-bid arithmetic that reproduces NESO's published accepted cost in all 1,130 matched half-hours (`copilot.json` `validation`).
- A demo that runs entirely offline.

### What we learned

- The most useful number is often the one that isn't published. NESO's datasets contain the story, but only once they're joined and checked against each other.
- Honest baselines matter more than a clever model. Persistence and a simple headroom rule are the scores that make our numbers mean something.
- A decision tool has to be net of costs. Gross payments made DFS look attractive; net of electricity, value depends on what the energy is worth to the site.
- A written contract and fixtures let humans and agents work in parallel without waiting on each other.

### What's next for Turn Up Scotland

- Score the forecast on our own archived snapshots (`fetched_at` vintages) so the backtest is no longer retrospective.
- Confirm the DFS zone-to-region mapping with NESO before naming any region.
- Re-run the Copilot per load type, size and zone rather than scaling one modelled load linearly, and re-score it as more DFS events accumulate.
- Model partial delivery using NESO's settled volumes.
- Live mode on the hosted site, refreshing every five minutes.

### Tracks

**HRT: Best Use of Data for Predictions & Decision Making.** The project runs the full path from prediction to automated decision. The Tomorrow screen forecasts curtailment and the chance of a NESO turn-up request for each half-hour. Flex Copilot turns that forecast into a ready-and-bid schedule automatically. Both are scored the way a trading desk would want. The forecast is backtested chronologically against persistence, the training mean and (for the flow model) a headroom rule. The decision is scored against a naive rule and a perfect-hindsight oracle on the same days and costs, net of electricity. Results are labelled retrospective, and we show where the decision stops beating naive (above about £134/MWh of site value).

**G-Research: Make the invisible visible.** We reveal three hidden layers, each checked against a published source:

1. **The hidden waste:** farm-by-farm curtailment, rebuilt from Elexon instructions and validated against NESO (daily correlation 0.915).
2. **The hidden bill:** the system cost beneath the wind payments. CCGT turn-up offers track NESO's constraint cost with a daily correlation of 0.945, shown as parallel magnitudes, not a sum.
3. **The unanswered call:** NESO's turn-up requests and how little is procured (0.046%), taken directly from NESO's DFS dataset.

**Tiger Data.** We did not use Tiger Data (Timescale). The pipeline writes JSON files to the repository, so we are not entering this track.

## 4. Likely judge questions

**1. How do you know your curtailment numbers are right?**
We rebuild them from Elexon accepted bids and physical notifications, then compare them with NESO's published thermal constraint volume. Over 186 days (1 Apr to 29 Oct 2026) the daily correlation is 0.915 and our total is 0.837 of NESO's (`curtailment_daily.json` `validation`). They aren't identical, because the two measures are built differently, and 76 of 220 days fall outside 0.3× to 2× of NESO or lack one side. Under the Hood lists those days.

**2. Thirty DFS events is a tiny sample. Can you trust the request model or the Copilot?**
Not much yet, and we say so. DFS began procuring constraint turn-up on 7 Oct 2026, so there are about 30 events and 27 scored days. The request model's Brier score is 0.238 against a base rate of 0.268, a modest gain. Half-hours are clustered by event, so they aren't independent (`forecast.json` `backtest.turnup`). The Copilot's 94.6% of oracle rests on 28 tradable half-hours in zone Z1, and almost all of the value comes from one day, 27 Oct (`copilot.json`). Treat it as a working method, not a proven edge.

**3. Is the forecast backtest really out of sample?**
In time, yes: rolling-origin weekly folds train only on earlier dates. In data vintage, no. The wind forecast archive we fit and score on is stamped on the target morning, a later and better-informed version than a true day-ahead forecast. So the scores are retrospective and probably optimistic (`forecast.json` `meta.leakage_note`). The screen shows a "Retrospective" label. We started archiving our own snapshots to fix this.

**4. Is the Copilot's £ figure revenue?**
No. It is net: DFS settlement plus the site's assumed value for the energy, minus the electricity bought (`contracts/README.md`). In the replay, settlement (£10,500) doesn't cover the electricity (£16,091). The positive figure exists only because we assume the site values the energy at £100/MWh, an illustrative input. It also assumes full delivery, while NESO's settled cost is only 39.4% of accepted cost across DFS so far. We make no revenue claim and no guarantee.

**5. Can I add £188M, £1.8B and £1.8B to get the total cost?**
No. They are parallel measures that overlap. Wind bids are what Scottish wind was paid to turn down. CCGT offers include energy balancing as well as constraint actions. NESO's thermal constraint cost is NESO's own total. CCGT offers track NESO's figure closely (daily correlation 0.945), which is why we show them side by side as magnitudes. That doesn't prove who ultimately paid (`iceberg.json`).

**6. Are DFS zones Z1 to Z3 in Scotland?**
We don't know yet. NESO publishes zone IDs, and we haven't confirmed their mapping to regions. Every screen shows Z1, Z2 and Z3 as NESO zone IDs and never calls them Scotland (PRD risk K-2).

**7. Why is tomorrow's forecast flat, and what model produced it?**
NESO hadn't published future flow snapshots for 8 Nov, so the flow model had no input. The model falls back to NESO's national day-ahead wind forecast and Scottish curtailment from two or more days earlier (`forecast.json` `meta.model: wind_forecast`). For 8 Nov it predicts no heavy curtailment, a calm day. The backtest shown is that wind model's. The flow model's scores are kept in the file (MAE 620 vs a headroom rule's 811).

**8. Why not trade or bid live?**
Live trading and real DFS bids are out of scope (PRD non-goal). Real bids would need a registered DFS provider and a real flexible asset. The evidence also doesn't support it yet: the samples are small, the backtest is retrospective and settlement is uncertain. We built decision support, scored on replays.

**9. What does "Oracle" mean?**
The oracle is the result with perfect hindsight. It picks the best tradable half-hours after the fact and bids each one at the highest price NESO actually accepted (`copilot.json` `assumptions.oracle_rule`). It's an upper bound for scoring, not a strategy anyone can run. "94.6% of oracle" means our forecast-driven bids captured that share of the best possible net result on the same days and costs. In Be the Operator, the oracle is the best six blocks in hindsight.

**10. Do you claim CO₂ savings?**
No. Absorbing curtailed wind could reduce gas burn elsewhere, but we haven't measured that, and avoided CO₂ can't be inferred from curtailed MWh alone. We don't show a CO₂ figure.

**11. Where did AI come in?**
AI agents wrote and reviewed code: Claude Code as developer and Codex as reviewer, under human scope and merge decisions. No AI model produces any number in the app; every figure comes from the pipeline and models over public NESO and Elexon data.
