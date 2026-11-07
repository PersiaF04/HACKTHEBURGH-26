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

The demo runs on the one-page map dashboard (Power Dashboard, [issue #71](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/71), PR #89). Control names below are the labels in that build: re-check them if #89 changes before the demo. The story follows `docs/NARRATIVE.md`. We lead with **27 Oct 2026**: it is the largest curtailment day on file, NESO asked for turn-up that day, and it is the only replay day with a scored Copilot call. 13 and 14 Oct have no Copilot call, so do not demo them.

Words that must stay as written when ad-libbing:

- **Procured**, never "delivered". We know what NESO procured, not what was delivered.
- The cables-south flow is NESO's **day-ahead forecast**, not what flowed. Above the limit signals pressure, not proof.
- **MWh is the load's use**, not wind absorbed. The "wind matched" figure is an upper bound.
- **Z1 to Z3 are NESO zone IDs.** Never say they are Scotland.
- Money is **retrospective and net**, not revenue.
- 8 Nov is **calm**. Say so as a feature.

### 1.1 Pre-flight checklist (do 20 minutes before, again 2 minutes before)

| Check | Expected | If wrong |
| --- | --- | --- |
| Which build | The deployed site, with the local copy running in a second tab: `npm --prefix web run build && npm --prefix web run preview` | Local copy is the first fallback: every number except **Live** comes from committed JSON, so it works offline |
| Browser | One normal (not private) window at 1440 px wide, 100% zoom, reduced-motion off | In private mode the first-visit tour reappears. With reduced-motion on, the replay does not autoplay and starts at the end of the day |
| Tour | Press **Skip tour** if the 3-step coach ("Orange means told to stop") shows | It only shows once per browser |
| Tab | **Power Dashboard** is the current section (route `#dashboard`) | Click **Power Dashboard** at the top |
| Day loaded | **27 Oct** is highlighted in the **Day** buttons (13 Oct, 14 Oct, 27 Oct). It is the default because it has the most curtailment of the replay days. **Live** is not selected | Click **27 Oct**. Never click **Live** |
| Start position | Replay **paused at 00:00**: reload, press **Pause replay** during the autoplay, click the timeline, then press Home | Press **Pause replay** and Home again. The clock under the timeline reads 00:00 GMT |
| Pin position | The **Your load** pin (diamond, "illustrative location") sits at its default position in the central belt, clear of the farm cluster. Do not move it in rehearsal | Reload the page: the pin resets |
| Bid | **Your bid £60/MWh**, hint "Highest it accepted this day: £60." | Drag the slider to 60 |
| Load settings | Press **What if**: **Size 50 MW**, **NESO zone Z1**, energy worth **100** £/MWh. Then press **Close** | Click the segment or drag Size. Check the **What if: +0.0 GW** slider is at zero |
| Scores on the card | **You £10,517**, **Copilot £11,909**, **Best possible £12,594** | The sandbox did not load (the card shows a rough estimate instead). Reload. If it persists, use the fallback |
| Tomorrow panel | Press **Tomorrow**: the card says "Tomorrow looks calm" and the Copilot card says "Be ready 11:00–14:30, bid ~£60/MWh" | Check you are on 27 Oct. Then press **Close** |
| Live feed | Do not use it. If a "Data is N minutes old" badge shows, ignore it | See recovery 1 |
| Fallback assets | Six screenshots (section 1.3) in a folder on the laptop and on a phone, and the 90-second video paused at 0:00 in a third tab | Retake them from the local copy |
| Numbers | If the pipeline or models were re-run, re-check every figure in 1.2 against the screen | Say rounded values, or cut the line |

### 1.2 Beat-by-beat script

Control names in **bold** are the visible labels or accessible names. The right-edge buttons are **Why it matters**, **Tomorrow**, **What if** and **Proof**. They open one side panel at a time, and the map stays visible beside it. The round button left of the timeline is **Play replay** (it becomes **Pause replay**).

| Time | On screen | Click | Say | Data source for each number |
| --- | --- | --- | --- | --- |
| 0:00–0:25 | Map of Scotland, 27 Oct, paused at 00:00. Three tiles: **wasted**, **paid to stop**, **farms told to stop now** | Press **Play replay**. At the end, hover **wasted** for the homes tooltip | "This is Scotland on 27 October. Every orange turbine is a wind farm that NESO has accepted a bid to switch off. Watch the day run. By midnight: 168 gigawatt-hours turned down, about a year's electricity for 62,000 homes, and £6.4 million paid to do it. More than any other day since 1 April." | 168 GWh = 168,390 MWh, the sum of curtailed MWh in `replay/2026-10-27.json`, shown as 168.4 GWh. £6.4M = £6,424,731 paid, same file. Biggest day: 168,351 MWh, top of the 192 days with data in `curtailment_daily.json` (its figure differs slightly because the sources differ; say only 168). 62,000 homes = 168,390 MWh at 2,700 kWh/home/yr, approximate (tooltip) |
| 0:25–0:45 | Pipe along the border labelled **Cables south** with "4.5× over the limit (estimate)". Note under the map: "Forecast, not outturn" | Press **Pause replay**. Click the timeline just after the 06:00 tick to reach 07:00 (tiles read 54.9 GWh, £2.9M, 89 farms) | "Why? Not the wind. The wire. This pipe is the boundary between Scotland and England. At 7am, NESO's day-ahead forecast had the market wanting to push 12,700 megawatts south through a limit of 2,800. That's a forecast, not what flowed, and over the limit means pressure, not proof. But the forecast sat over it in all 48 half-hours." | 12,713 MW forecast flow, 2,800 MW limit, 4.5× (12,713 ÷ 2,800) at 07:00; 48 of 48 half-hours above the limit: `scotex_flow_mw`, `scotex_limit_mw` in `replay/2026-10-27.json`. The limit was 4,850 MW until 04:30. 89 farms, 54.9 GWh and £2.9M to 07:00: same file |
| 0:45–1:10 | **Why it matters** panel: "NESO asked for ~81,000 MWh. ~38 MWh was procured." with a fill bar; below it the bill card "£188m to wind is the small part". The timeline shows a shaded band 11:00 to 23:00 | Press **Why it matters**. Point at the fill bar, the shaded band, then the three bars | "Here's the twist: NESO is already asking for help. That day it asked for 500 megawatts of demand to switch on, 11am to 11pm, the shaded band. Across October it asked for about 81,000 megawatt-hours and procured about 38. And the £188 million paid to wind is the small part: gas turn-up offers and NESO's own constraint cost are each about £1.8 billion. They overlap, so you can't add them." | 81,000 MWh and 37.65 MWh (~38) procured, fill 0.046%, 30 events, 8 to 31 Oct: `dfs_requests.json` (Upwards/System; MW × 0.5 h). 500 MW, 11:00 to 23:00, zones Z1 to Z3: same file, 27 Oct rows. £188m = £187,995,768, £1.81bn = £1,814,407,407, £1.79bn = £1,787,705,531, over 210 days to 29 Oct: `iceberg.json` |
| 1:10–1:35 | **Tomorrow** panel: "Tomorrow looks calm — little or no wasted wind expected"; a note "Chance NESO asks up to 23%, 11:00–22:30 UTC; median switch-off none". Under it the Copilot card for 27 Oct: "Be ready 11:00–14:30, bid ~£60/MWh" | Press **Tomorrow**. Point at the calm headline, then the Copilot card and its **Fragile** line | "So when does NESO ask next? Tomorrow, 8 November, is calm: little or no wasted wind, the wire has room. That is the model working, and it is backtested in date order: error 663 megawatt-hours against 1,225 for persistence, labelled retrospective. And here's what it does on a day like 27 October: be ready 11 to 2:30 and bid £60, about 95% of what perfect hindsight could have made. It also tells you it's fragile: one day of 13 carried the result." | Calm, 0 MWh median all day, P(request) 23% from 11:00 to 22:30 UTC: `forecast.json`, `dashboard.json` `tomorrow`. MAE 663.2 vs 1,225 over 3,170 half-hours, 1 Sep to 5 Nov: `forecast.json` `backtest` (not on screen). Ready 11:00–14:30, £60, 94.6% shown as 95%: `dashboard.json` `replay_days` and `copilot.json` (7 half-hours from 11:00). One day of 13: `copilot.json` |
| 1:35–2:20 | The "Can you do better?" card / "Run a 50 MW load on this storm", with **Your bid £60/MWh**. The **Your load** pin on the map | Press **Close** on the open panel if it covers the card. Drag the **Your load** pin to a new spot (judge's choice). Leave the bid at £60 and read the three scores. Then drag **Your bid** above £60 and back | "Now you. A 50-megawatt electrolyser in NESO zone Z1. Drop it anywhere: the pin is only for show, the score depends on the zone, size and your bid. You bid £60 in every turn-up half-hour. Net of electricity, on this day, retrospective: you £10,517, our copilot £11,909, perfect hindsight £12,594. Push your bid past £60 and NESO accepts nothing: £60 was the highest price it took. That's not revenue. It works because we assume your site values the energy at £100 a megawatt-hour, and it's one day." | £10,517 (You), £11,909 (Copilot), £12,594 (Best possible): `sandbox.json` `days["2026-10-27"]`, scored at 50 MW, Z1, £100/MWh. Copilot and oracle equal `copilot.json` day figures. £60 ceiling in Z1: `sandbox.json` half-hours `ceiling_gbp_per_mwh`. Settlement alone (£10,500) does not cover the electricity (£16,091) across 13 days: `copilot.json` `summary` |
| 2:20–2:45 | **What if** panel: "Your load: on this half-hour"/"off", "Load uses 250 MWh", and the **More cables south** slider | Press **What if**. Read **Load uses**. Drag the slider to **+1.0 GW**, then **+5.0 GW** | "It uses 250 megawatt-hours — that's its own use, not wind it absorbed. Couldn't we just build more cable? By a simple counterfactual that reads high: add one gigawatt and about 14% of the day's switch-off goes; five gigawatts, about 71%. Cable takes years. A load can bid this afternoon." | 250 MWh = 10 accepted half-hours × 25 MWh at £60, Z1: `sandbox.json`. +1 GW: 24.0 GWh of 168.4 GWh (14%). +5 GW: 120.0 GWh (71%). Rule: avoided = min(curtailed, reduction in max(0, flow − limit)) per half-hour, from `replay/2026-10-27.json`. The screen says "simple counterfactual, not a power-flow model" |
| 2:45–3:00 | **Proof** panel: "What the data shows": "7.12 TWh of accepted turn-down across 192 days with data, 1 Apr to 5 Nov 2026. Reconciled against NESO over a 186-day window." | Press **Proof** | "Since April, 7.1 terawatt-hours turned down, rebuilt from NESO's per-farm data and checked against NESO's own figure: 0.915 daily correlation over 186 days. The wind isn't the problem. The wire is. NESO is asking. Turn Up Scotland tells you when, and what to bid." | 7,116,615 MWh over 192 days with data: `curtailment_daily.json`. 0.915 over 186 days to 29 Oct (`validation.volume_corr_daily`; not on screen) |

Timing notes:

- The replay steps every 0.38 s, so the 48 half-hours take about 18 seconds. Speak the hook while it runs.
- If you run long, cut the +5 GW step and the backtest sentence in 1:10–1:35.
- If a judge keeps the laptop, point them at the "Can you do better?" card. Zone and size are under **What if**.

### 1.3 Sixty-second fallback (live site or network fails)

Order of fallbacks, fastest first:

1. **Local copy in the second tab** (`vite preview`). It is the same dashboard and needs no network. Reload it, press **Pause replay**, and run the script above, cutting beats to fit.
2. **Static screenshots**, if the laptop or the browser is the problem. Take these six in pre-flight from the local copy at 1440 px and keep them on the laptop and a phone. Do not commit them.
3. The 90-second video (section 2), narrated live. The shot list in section 2 still follows the old seven-tab site, so use it only as a last resort.

| Screenshot | Shows | Say (about 10 seconds each) | Data source |
| --- | --- | --- | --- |
| 1 | 27 Oct at 23:30: map mostly orange, tiles 168.4 GWh, £6.4M | "Scotland, 27 October. Orange farms are paid to switch off. 168 gigawatt-hours, £6.4 million, in one day." | `replay/2026-10-27.json` |
| 2 | 07:00: pipe "4.5× over the limit (estimate)" | "The wire is the problem. NESO's day-ahead forecast had the market pushing 12,700 megawatts south through a 2,800 limit. A forecast, not outturn." | `replay/2026-10-27.json` |
| 3 | **Why it matters**: "NESO asked for ~81,000 MWh. ~38 MWh was procured." and the bill bars | "NESO is asking for demand to switch on. About 81,000 megawatt-hours asked for in October, about 38 procured. The £188 million paid to wind is the small part of about £1.8 billion." | `dfs_requests.json`, `iceberg.json` |
| 4 | **Tomorrow** panel: calm headline and the Copilot call | "Tomorrow, 8 November, is calm. On a day like 27 October the copilot says be ready 11 to 2:30 and bid £60." | `forecast.json`, `dashboard.json` |
| 5 | Card with **You £10,517**, **Copilot £11,909**, **Best possible £12,594** | "Your load, net of electricity, retrospective: £10,517, copilot £11,909, perfect hindsight £12,594. Not revenue, and it is one day." | `sandbox.json` |
| 6 | **What if** at +5.0 GW: 120.0 GWh of 168.4 GWh (71%) | "Even five gigawatts of cable is a simple counterfactual that reads high. A load can bid this afternoon. NESO is asking. Turn Up Scotland tells you when." | `replay/2026-10-27.json` |

At 10 seconds each, six screenshots run 60 seconds. Hold on screenshot 5 if a judge asks a question.

### 1.4 Recovery lines

| Likely failure | What you see | Do | Say |
| --- | --- | --- | --- |
| 1. Live data stale | A badge "Data is N minutes old. The live feed may have stopped.", or a **Live** button that is missing or shows "No farms have an accepted bid right now" | Stay on **27 Oct**. Do not click **Live**. The 27 Oct replay is a fixed file and does not depend on the feed | "That badge is the live feed warning about itself. That's why I'm showing a fixed replay: everything here is 27 October, from public NESO and Elexon data." |
| 2. Pin drag glitch | The **Your load** pin will not drag, jumps, or the page scrolls instead | Click the pin to focus it and use the arrow keys, or leave it where it is. Reload only between beats | "The pin is only a picture of where your load could be. The score doesn't use it. It uses the zone, the size and the bid." |
| 3. Empty sandbox result | "No bid would have been accepted on this day.", or "At £NN, NESO accepts nothing. Try lower.", or "Couldn't load this day. Try another.", or a "Simple rule" row instead of **Copilot** | Click **27 Oct** in the **Day** buttons, then drag **Your bid** back to £60 | "That's an honest zero. NESO took nothing at that price, or asked for nothing that day. £60 was the highest price it accepted on 27 October, so I'll bid there." |
| 4. Map does not load | "Loading the map…" or "Couldn't load data: …" | Reload once. If it persists, switch to the local-copy tab, then screenshots | "The map reads committed data files, so I'll switch to the offline copy." |
| 5. Autoplay does not run | The map stays still at 00:00 or at the end | Press **Play replay**, or drag the playhead along the timeline | "I'll scrub the day by hand." |
| 6. A number on screen differs from this script | A tile or card reads differently | Use the screen value, rounded. Do not defend the script | "On the screen it reads …, in the data files it is the same to the rounding." |
| 7. A "Sample data" badge shows | A warning badge in the **Proof** panel | Say so, and switch to the local copy | "That panel has fallen back to sample data, so I'll show you the real one." |

Deep dives (Hidden Bill, Help Wanted, Flex Copilot, Under the Hood and others) stay available under the section menu for judges at the table. They are not part of the three-minute run.

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
| 7 | 1:15–1:25 | Under the Hood: correlation stat, then the unreconciled-days table. | "Every number is built from public NESO and Elexon data and checked against NESO: 0.915 daily correlation, with the mismatches on show." |
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
- **Under the Hood** shows how each number is built and checked against NESO, including the days that don't reconcile.

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

- A daily curtailment series from NESO per-farm Wind BOA volumes that tracks NESO's published volume with a daily correlation of 0.915 over 186 days.
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

1. **The hidden waste:** farm-by-farm curtailment, built from NESO Wind BOA volumes, priced with Elexon cashflows, and validated against NESO (daily correlation 0.915).
2. **The hidden bill:** the system cost beneath the wind payments. CCGT turn-up offers track NESO's constraint cost with a daily correlation of 0.945, shown as parallel magnitudes, not a sum.
3. **The unanswered call:** NESO's turn-up requests and how little is procured (0.046%), taken directly from NESO's DFS dataset.

**Tiger Data.** We did not use Tiger Data (Timescale). The pipeline writes JSON files to the repository, so we are not entering this track.

## 4. Likely judge questions

**1. How do you know your curtailment numbers are right?**
Daily volumes come from NESO's per-farm Wind BOA volumes and £ from Elexon indicative cashflows; only the replay days use Elexon physical notifications, availability and bids. We compare them with NESO's published thermal constraint volume. Over 186 days (1 Apr to 29 Oct 2026) the daily correlation is 0.915 and our total is 0.837 of NESO's (`curtailment_daily.json` `validation`). They aren't identical, because the two measures are built differently, and 76 of 220 days fall outside 0.3× to 2× of NESO or lack one side. Under the Hood lists those days.

**2. Thirty DFS events is a tiny sample. Can you trust the request model or the Copilot?**
Not much yet, and we say so. DFS began procuring constraint turn-up on 8 Oct 2026, so there are about 30 events and 27 scored days. The request model's Brier score is 0.238 against a base rate of 0.268, a modest gain. Half-hours are clustered by event, so they aren't independent (`forecast.json` `backtest.turnup`). The Copilot's 94.6% of oracle rests on 28 tradable half-hours in zone Z1, and all of the value comes from one day, 27 Oct; the other 12 scored days are zero for both ours and the oracle (`copilot.json`). Treat it as a working method, not a proven edge.

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
