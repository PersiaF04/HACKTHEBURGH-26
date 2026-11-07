# Pitch narrative and winner research

The pitch story for Turn Up Scotland at HackTheBurgh XIII ([issue #82](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/82)). Part 1 looks at what has won comparable prizes. Part 2 turns that into our narrative, a 3-minute script for the map dashboard ([#71](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/71), [#73](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/73), [#75](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/75)) and the product gaps the story exposes.

**Honesty rules for everything below.** Every figure cites a file in `data/public/`. SCOTEX figures come from `replay/<date>.json` on PR #80's branch (`feature/73-scotex-live-gist`) until that merges. All files carry `"retrospective": true`. Figures prefixed "≈ homes" assume about 2,700 kWh per home per year and are approximate. We make no revenue claim and no CO₂ claim, and DFS zones are NESO's IDs (Z1 to Z3), not "Scotland". The SCOTEX flow is NESO's **day-ahead forecast** of the flow the market wants, not measured outturn.

## Part 1: what wins

### Method and limits

I used web search and page fetches. **The Devpost galleries returned HTTP 403 to automated fetches** (`hacktheburghx.devpost.com/project-gallery`, `hackbelfastni.devpost.com/project-gallery`). That means I could not list the winners of HackTheBurgh X, XI or XII, or of HackBelfast's HRT "Best Use of Data" prize. Search found only the prize listings for those, not the winners. The winners below come from university news, event pages and press releases instead. "Why it won" is **inferred** unless the source states the judges' reasoning, and most don't.

### Winners

| # | Winner and prize | One-line story | Why it likely won (inferred unless stated) | Demo moment |
| --- | --- | --- | --- | --- |
| 1 | **Niche Machine**: G-Research "crystal ball" challenge, DurHack X, Nov 2025 ([DurHack Devpost](https://durhack-2025.devpost.com/), [DurHack press on Medium](https://medium.com/@DurHack_press/how-rs-helped-bring-hardware-to-life-at-durhack-x-ce035b9bfc05)) | Predicts the next viral TikTok song. | It answered G-Research's prompt ("create a crystal ball that can predict something unique") literally, with a 3D-printed crystal ball as the prop. The prediction was about something every judge has an opinion on. Search snippets say there were 34 submissions to that challenge. | A physical crystal ball "reveals" a song before it trends (inferred from the press description). |
| 2 | **California wildfire simulator**: HRT "Best Use of Data for Prediction & Decision Making", ICHack, Jan 2026 (self-reported on [LinkedIn](https://www.linkedin.com/in/k-ramrakhani/) and [LinkedIn](https://www.linkedin.com/in/benjamin-kovalick-60986845/)) | Users run single simulations or Monte Carlo experiments to test wildfire mitigation strategies. | **This is the same HRT prize name as our track.** It won by letting the user choose a strategy and see the scored outcome under uncertainty: a prediction tied to a decision. | The user picks a strategy, runs many futures and compares outcomes (inferred). |
| 3 | **Griddy**: 1st, sustainability track, HackMIT 2025 ([Northeastern Khoury](https://www.khoury.northeastern.edu/khoury-undergrads-win-three-categories-at-prestigious-mit-hackathon)) | A micro-grid powered by homemade iron-air batteries. | It was framed around grid resilience and energy independence, with a working physical artefact built in 24 hours. | A small battery-powered model grid running on the table. |
| 4 | **Kava**: EigenCloud sponsor prize, HackMIT 2025 ([same source](https://www.khoury.northeastern.edu/khoury-undergrads-win-three-categories-at-prestigious-mit-hackathon)) | Upload housing documents and damage photos, and get an insurance claim package in minutes. | The team says it focused on one clear problem for named victims: families who lost homes in the January 2025 California wildfires. | A complete claim package in "a couple of minutes". |
| 5 | **EyeCraft**: 1st, entertainment track, HackMIT 2025 ([same source](https://www.khoury.northeastern.edu/khoury-undergrads-win-three-categories-at-prestigious-mit-hackathon)) | Control Minecraft with your face, for players with limited hand mobility. | **Stated by the team:** a demo that worked from start to finish, where most hackathon projects overreach, plus strong pitching. | Open your mouth and the character walks. |
| 6 | **Hawkwatch**: $11,000 grand prize, TreeHacks 2025 ([Stanford Daily](https://stanforddaily.com/2025/02/18/treehacks-awards-200000-in-prizes-to-students-from-around-the-world/)) | Real-time alerts when security cameras catch crime or life-threatening events. | The pitch was a hidden-in-plain-sight problem: "crucial moments were missed despite having camera coverage". The data existed, but no one was watching. | Live alerts across several camera feeds, which the user dismisses or escalates. |
| 7 | **Shepherd**: grand prize, TreeHacks 2026 ([Stanford Daily](https://stanforddaily.com/2026/02/15/12th-annual-treehacks/)) | A motorised smart cane that uses computer vision to steer visually impaired users around obstacles. | The criteria were creativity, technical complexity and social impact. It shows a single person's problem solved physically. | The cane steers its user around an obstacle. |
| 8 | **Sustain-ify**: Overall Best Hack, HackHarvard 2024 ([Amrita University](https://www.amrita.edu/news/amrita-students-win-grand-prize-in-a-world-renowned-hackathon-at-harvard/)) | Photograph waste and get upcycling ideas; scan a product and get a lower-carbon alternative. | The criteria were innovation, technical complexity, functionality and collaboration. Each feature is a camera-in, answer-out moment. | Point the phone at a bottle and get an idea back. |
| 9 | **Good Watt**: 1st ($3,000), CU Boulder Sustainability Hackathon 2024 ([CU Boulder](https://www.colorado.edu/innovate/2024/11/13/five-teams-win-big-2024-sustainability-hackathon)) | A device that helps households track and cut energy waste. Third place, **Peak Energy**, gamified using less energy at home. | The criteria were creativity, execution, design thinking, feasibility and scalability. Energy waste was made personal and countable. | The household's waste is shown as a number you can reduce (inferred). |
| 10 | **Grid Watch**: 2nd, Google Colorado Impact Hackathon ([Google blog](https://blog.google/company-news/outreach-and-initiatives/sustainability/colorado-impact-hackathon/)) | An AI-managed battery network that keeps power on during wildfire shutoffs and cuts bills. Third place, **Grid Guard**, gave predictive insight for grid hardening. | Grid-flexibility projects placed in a grid-themed hack. Both pair a prediction with an action (inferred). | Not described in the source. |
| 11 | **DeBattery**: energy challenge winner, Hack for Earth at COP27 ([press release](https://www.mynewsdesk.com/hackforearth/pressreleases/winners-hack-for-earth-youth-hackathon-at-cop27-3216683)) | A data-driven nudge for EV owners to plug into the smart grid when it improves reliability. | **This is the closest analogue to us:** flexible demand cast as the hero that helps the grid. | Not described in the source. |
| 12 | **University of Waterloo team**: 1st (£10k), ClimateHack.AI 2023-24 ([ClimateHack.AI](https://climatehack.ai/competition/2023-24)) | Site-level UK solar forecasts up to four hours ahead, set by Open Climate Fix for grid operators. | It was scored on a held-out leaderboard: the forecast had to beat others on unseen data. | A score on a shared leaderboard, not a slide. |
| 13 | **HealthMotion**: 1st overall, Hack the Burgh 2015 ([2015 site](https://2015.hacktheburgh.com/)) | Leap Motion gestures that let incapacitated patients alert staff. | This is local precedent: a specific person (the patient who can't call for help) and a live gesture demo. | A hand gesture triggers an alert. |

### Patterns

1. **One day, one person, one moment of pain.** Winners anchor on a specific victim or moment: wildfire families (Kava), missed moments on camera (Hawkwatch), the patient who can't call (HealthMotion). Abstract system cost doesn't land until it's a day you can point at.
2. **The demo is the argument, and it works end to end.** Each winner has one move the judge sees or does: the crystal ball, the cane, the phone camera, the micro-grid. EyeCraft's team says reliability beat ambition. One interaction beats seven tabs.
3. **Answer the sponsor's prompt in the sponsor's own words.** Niche Machine built a literal crystal ball for G-Research's "crystal ball" prompt. The ICHack HRT winner built Monte Carlo decision-making for "prediction and decision making". Judges score against their brief.
4. **Prediction is only half; the winner lets you act on it and see a scored outcome.** The wildfire simulator compares strategies, Grid Watch and DeBattery turn a forecast into an action, and ClimateHack.AI scores against held-out data. A forecast with no decision, or a decision with no baseline, is weaker.
5. **Data becomes a felt quantity.** Good Watt and Peak Energy turn energy into household terms. Hawkwatch turns hours of footage into one alert. Winners translate units the judge can't feel into ones they can.
6. **Hidden in plain sight.** Several winners reveal something already recorded but unseen (Hawkwatch's footage). That is exactly G-Research's "make the invisible visible", and it is our strongest asset.
7. **Story arc (inferred across the set).** Hook with a specific moment, show the stakes in human units, name what's broken, show the fix working live, then prove it with one hard number.

## Part 2: our narrative

### One-line pitch

Scotland pays its wind farms to switch off because the cables south are full. Turn Up Scotland puts that hidden bottleneck on one map, forecasts when NESO will next ask for help, and tells a flexible load exactly when to be ready and what to bid, scored against a naive rule and perfect hindsight.

### Tagline options

1. "The grid is asking for help. Nobody's answering."
2. "The cables are full. Your load isn't."
3. "See the waste. Forecast the call. Answer it."
4. "Scotland's wind is being switched off. Turn it up."
5. "81,000 MWh asked for. About 38 procured." (`dfs_requests.json`)

### Story arc

| Beat | What we say | Evidence (file) |
| --- | --- | --- |
| **Hook** | "On 27 October Scotland threw away more wind than on any other day since 1 April: 168 GWh in one day, ≈ 62,000 homes' annual electricity, and £6.4m paid to switch it off." | 168,351 MWh, the largest of 220 days (`curtailment_daily.json`); £6,424,730 paid to wind (`curtailment_daily.json`, matching `replay/2026-10-27.json`). The homes figure assumes 2,700 kWh/home/yr and is approximate. |
| **Stakes** | "It isn't one day. Since April: 7.12 TWh, ≈ 2.6 million homes' annual electricity. The £188m paid to wind is the tip. Underneath sit two much bigger measures of the same problem, each about £1.8bn. They overlap; you can't add them." | 7,116,615 MWh over 220 days, 1 Apr to 6 Nov 2026 (`curtailment_daily.json`, approximate homes figure). £188m wind bids, £1.81bn CCGT turn-up offers and £1.79bn NESO thermal constraint cost over 210 days, "magnitude, not additive" (`iceberg.json`). |
| **Villain: the invisible bottleneck** | "The wind isn't the problem. The wire is. On 27 October NESO forecast that the market would want to push over 10,000 MW south all day, through a boundary NESO limited to 2,800 MW for most of the day. Nobody sees this boundary, and it decides everything." | `replay/2026-10-27.json` (PR #80 branch): forecast flow 10,234 to 12,713 MW; limit 4,850 MW to 04:30 UTC, then 2,800 MW; forecast flow above the limit in all 48 half-hours. Day-ahead forecast, not outturn. |
| **Hero: whoever can say yes** | "There's a simple fix the grid is already asking for: switch something on in Scotland. NESO's Demand Flexibility Service asked for 500 MW of turn-up from 11:00 to 23:00 that day. It procured 2.4 MWh. Across October: 81,000 MWh asked for, about 38 procured, a fill of 0.046%." | `dfs_requests.json`: 24 half-hours on 27 Oct, 6,000 MWh requested, 2.4 MWh procured, auction close 10:00 UTC; 30 events and 324 half-hours from 8 to 31 Oct, 81,000 MWh requested, 37.65 MWh procured. |
| **Turn: the product** | "Electrolysers, data centres and heat networks could say yes, but they can't see the call coming. Turn Up Scotland shows them the bottleneck, forecasts tomorrow, and turns it into a schedule: be ready from 11:00 to 14:30 and bid £60." | `copilot.json`, 27 Oct: seven "ready" half-hours from 11:00 to 14:30 UTC at £60/MWh, for a modelled 50 MW electrolyser in zone Z1. |
| **Proof** | "We rebuilt the waste from NESO per-farm data and it tracks NESO's own figure at 0.915 daily correlation. The forecast nearly halves persistence's error. The copilot gets 94.6% of what perfect hindsight would. We also show where it's thin." | Correlation 0.915 over 186 days, volume ratio 0.837 (`curtailment_daily.json` `validation`). MAE 663 vs persistence 1,225 and training mean 999; Brier 0.149 vs 0.471 (`forecast.json` `backtest`, retrospective). 94.6% of oracle; net £1,976 naive, £11,909 ours and £12,594 oracle at an assumed £100/MWh site value; all of it on one day; 28 tradable half-hours (`copilot.json` `summary`). |
| **Call to action** | "NESO is asking. Place your load." For judges: place your load and pick a zone. For industry: answer the call. | The sandbox (#75) and `sandbox.json` (PR #78). |

### Three-minute pitch script

The control names follow #71 and #75 (map, timeline scrubber, KPI rail, NESO requests panel, Tomorrow strip, Copilot card, **Place your load** control with its zone picker, and **Cables south** slider). Rename them to match the build. **Day: 27 Oct 2026** (see gap 1). Lines for 14 Oct follow the table.

| Time | Beat | On screen / stage direction | Say |
| --- | --- | --- | --- |
| 0:00–0:20 | Hook | The dashboard is already open on the map of Scotland, with 27 Oct loaded and the scrubber paused at 07:00 UTC. Most farms are grey. Don't touch anything yet. Look at the judges, not the screen. | "This is Scotland on 27 October. Every grey dot is a wind farm being paid to switch off. That day Scotland threw away more wind than on any other day since 1 April: 168 gigawatt-hours, roughly a year's electricity for 62,000 homes. And it paid £6.4 million to do it." |
| 0:20–0:45 | Villain | Press **Play**. Point at the **cables south** pipe on the border as it glows over its limit. | "Why? Not the wind. The wire. This line is the boundary between Scotland and England. NESO's day-ahead forecast had the market wanting to push over 10,000 megawatts south. The limit that day was 2,800. A forecast flow above the limit signals potential constraint pressure." |
| 0:45–1:05 | Stakes | Point at the KPI rail: 7.12 TWh, then the £188m and £1.8bn iceberg tile. | "It's not one bad day. Since April, 7.1 terawatt-hours. The £188 million paid to wind is the bit that makes headlines. Underneath it are two measures of the same problem, gas turn-up and NESO's own constraint cost, each about £1.8 billion. They overlap, so we don't add them, but they're nearly ten times bigger." |
| 1:05–1:25 | Hero | Point at the **NESO requests** panel for 27 Oct, then the October fill bar. | "Here's the twist. The grid is already asking for help. That morning NESO asked for 500 megawatts of demand to switch on from 11 until 11. It procured 2.4 megawatt-hours. Across October it asked for 81,000. It procured about 38." Pause. |
| 1:25–1:55 | Turn | Point at the **Tomorrow** strip and its backtest chip, then the **Copilot card**. | "The loads that could say yes, like electrolysers, data centres and heat stores, can't see the call coming. So we forecast it. Our day-ahead model nearly halves persistence's error over two months, with each day predicted only from earlier data. The copilot turns that into a decision: on the 27th, be ready from 11 to 2:30 and bid £60." |
| 1:55–2:30 | Interaction | Turn the laptop to a judge. "Place your load and pick a zone." They place a 50 MW electrolyser, pick Z1 and keep the £60 bid. The result card shows the MWh the load uses and net £ against the Copilot and the oracle. | "You've just placed a load. That's the electricity you would have used, net of what you paid for it, against our copilot and against perfect hindsight. Across 13 replay days the copilot gets 94.6% of perfect hindsight; a simple rule gets far less. That's retrospective, and it's not revenue: on its own, DFS settlement didn't cover the electricity." |
| 2:30–2:45 | Counterfactual | Drag **Cables south** to +1 GW, then +5 GW. | "Couldn't we just build more cable? Add a gigawatt and, by a simple counterfactual, about 13% of that day's waste goes. Add five and about two-thirds. Cables help, but they take years. A load can bid this afternoon." |
| 2:45–3:00 | Close | Scrub back to 07:00, with the grey map and the pipe over its limit. | "Scotland's wind isn't the problem. It's waiting for someone to say yes. NESO is asking. Turn Up Scotland tells you when, and what to bid." |

**Numbers in the script:** 168 GWh and ≈ 62,000 homes (168,351 MWh; `curtailment_daily.json`; 2,700 kWh/home/yr, approximate). £6.4m (`curtailment_daily.json`). Flow over 10,000 MW against a 2,800 MW limit (`replay/2026-10-27.json`, PR #80 branch; day-ahead forecast). 7.12 TWh (`curtailment_daily.json`). £188m and about £1.8bn (`iceberg.json`; "nearly ten times" is £1.81bn ÷ £188m ≈ 9.7 and £1.79bn ÷ £188m ≈ 9.5). 500 MW, 2.4 MWh, 81,000 MWh requested and about 38 MWh procured (`dfs_requests.json`). The error claim is MAE 663 vs 1,225 (`forecast.json`). The ready window and £60 bid, 94.6%, and settlement below electricity cost all come from `copilot.json`.

**Cable what-if figures** use the #75 rule (avoided ≈ min(curtailed, reduction in max(0, flow − limit)), per half-hour) on `replay/2026-10-27.json` from PR #80's branch. I computed them by hand: +1 GW avoids about 24,000 of 183,752 MWh (13%), and +5 GW about 120,000 MWh (65%). **Re-read them off the built slider before stage**, and call them a simple counterfactual, not a power-flow model. The replay's total (183,752 MWh, from Elexon bids) is higher than `curtailment_daily.json`'s 168,351 MWh (from NESO Wind BOA volumes) because the sources differ. Don't quote both in one breath.

**If the team keeps 14 Oct as the replay day,** use these swap lines (`replay/2026-10-14.json`, PR #80 branch). 149 GWh curtailed and £5.33m paid (≈ 55,000 homes' annual electricity, approximate); 90 of 155 replay farms paid to stop at 04:00 UTC. The day-ahead forecast flow peaks at **11,055 MW at 16:30 UTC against a 5,900 MW limit** and sits above the limit in 42 of 48 half-hours. By the same rule, +1 GW avoids about 20,000 MWh (13%), and even +5 GW avoids only about 69,000 MWh (46%). The Copilot has no scored call on 14 Oct (a warm-up day), so the sandbox comparison there is against naive and the oracle only.

### Thirty-second elevator version

"Scotland pays its wind farms to switch off when the cables to England are full: 7 terawatt-hours since April. The fix is demand that switches on in Scotland, and NESO is already asking for it. In October it asked for 81,000 megawatt-hours and procured about 38. Turn Up Scotland shows that hidden bottleneck on one map, forecasts when NESO will next ask, and tells an electrolyser or data centre exactly when to be ready and what to bid. It's backtested against simple rules and perfect hindsight, and built entirely from public NESO and Elexon data."

Sources: `curtailment_daily.json` and `dfs_requests.json`.

### Edinburgh and Scotland angle

- **It's our weather.** The storms that rattle Edinburgh windows are the days the map goes grey. Judges in the room lived through 27 October and 14 October (both in `curtailment_daily.json`'s top three days).
- **It's close to home.** Within about 45 km of Edinburgh, `farms.json` lists Dun Law, Black Law, Crystal Rig and Aikengall. Black Law alone (124 MW unit) was paid to turn down about 946 MWh on 14 Oct (`replay/2026-10-14.json`, PR #80 branch). Offshore, Seagreen's six units off the Angus coast (1,110 MW in `farms.json`) turned down about 24,200 MWh that day, for about £355k in payments.
- **The bottleneck is a Scottish border.** SCOTEX is literally the Scotland-to-England boundary. "Scotland makes the power; the border can't carry it" is a story that is both local and true.
- **The hero can be Scottish industry.** Electrolysers, data centres and heat networks located behind the constraint could absorb that surplus. We pitch that as the opportunity, not a claim about any named site, and we never call DFS zones "Scotland".
- **Name it.** The "Turn Up" pun works twice: NESO's own term for asking demand to increase, and a Scottish invitation to show up.

### Slide outline

The demo is the product, so keep slides for the opening and the close and stay on the map in between.

1. **Title.** "Turn Up Scotland" over a grey-dotted map of Scotland. Subtitle: "The grid is asking for help. Nobody's answering."
2. **The waste.** 168 GWh in one day (27 Oct) and 7.12 TWh since April, with homes-equivalents labelled approximate. Use one photo-like visual: the grey map.
3. **The bottleneck.** One chart: forecast flow vs the SCOTEX limit on 27 Oct, with the gap shaded. Caption: "day-ahead forecast, not outturn".
4. **The unanswered call.** A giant "81,000 MWh asked" next to a tiny "≈ 38 MWh procured" (`dfs_requests.json`).
5. **Live demo** (no slide content, switch to the dashboard): map, then sandbox, then slider.
6. **Proof.** Three cards: 0.915 correlation vs NESO; MAE 663 vs 1,225; 94.6% of oracle. Small print: "retrospective, small sample, not revenue".
7. **Ask.** "NESO is asking. Place your load." Show the URL (turn-up-scotland.vercel.app) and a QR code to the dashboard.

### Why this wins

**HRT: Best Use of Data for Predictions & Decision Making.** HRT's own prize at ICHack 2026 went to a project where the user chooses a strategy and sees a scored outcome (winner 2). We match that pattern and go further on rigour:

- **Prediction:** a half-hourly day-ahead curtailment forecast with P(heavy) and P(request), backtested in date order on 3,170 half-hours. MAE 663 vs 1,225 for persistence and 999 for the training mean; Brier 0.149 vs 0.471 and 0.299; AUC 0.914 vs 0.528 (`forecast.json` `backtest`). We label it retrospective because the scoring archive is stamped on the target morning.
- **Automated decision:** the Copilot ranks half-hours by expected margin and outputs a ready-and-bid schedule (`copilot.json` `assumptions.ours_rule`).
- **Scored against baselines:** naive, ours and oracle on the same days and costs, net of electricity: £1,976, £11,909 and £12,594, which is 94.6% of the oracle (`copilot.json` `summary`). We show where it breaks: one day carries all the value, there are 28 tradable half-hours, and settled cost is 39.4% of accepted cost across DFS (`copilot.json` `validation`).
- **The judge makes the decision:** "Place your load" lets the judge be the policy and scores them against ours and the oracle. That is the moment that wins this track.

**G-Research: Make the invisible visible.** Niche Machine won G-Research's prize by building the literal object in the prompt (winner 1). Our literal object is the grey map with the overflowing pipe. Frame it as three steps: hidden, found, acted on.

- **Hidden:** the SCOTEX boundary nobody sees; payments below the headline (£1.81bn and £1.79bn vs £188m, parallel, `iceberg.json`); NESO's unanswered requests.
- **Found:** per-farm curtailment rebuilt from public data, validated at 0.915 daily correlation with NESO (`curtailment_daily.json`); 0.046% fill computed from `dfs_requests.json`.
- **Acted on:** the Copilot schedule and the sandbox turn the revealed signal into a decision. The cable slider shows why demand, not just cable, is the near-term answer.

### The three most memorable lines

1. **"NESO asked for 81,000 megawatt-hours. It procured about 38."** (`dfs_requests.json`)
2. **"The wind isn't the problem. The wire is."** (backed by `replay/2026-10-27.json`: forecast flow over 10,000 MW against a 2,800 MW limit; or 11,055 MW against 5,900 MW on 14 Oct.)
3. **"The grid is asking for help. Nobody's answering."**

## Product gaps the story exposes

1. **Lead with 27 Oct, not 14 Oct.** 27 Oct is the largest curtailment day in the series (`curtailment_daily.json`), its SCOTEX gap is the most dramatic (forecast flow over 10,000 MW against 2,800 MW), it has a NESO request (500 MW, 2.4 MWh procured), and it is **the only day the Copilot has a scored call** (`copilot.json`). On 14 Oct the sandbox can't compare with the Copilot. One hero day end to end beats switching days mid-pitch. Make 27 Oct the dashboard's default day. *Check the 2,800 MW limit with lane A first, because it is an unusually low published value.*
2. **Lead the interaction with "Place your load", not the cable slider.** It is the HRT pattern (the judge decides and gets a score) and the call to action at once. The slider is a strong 15-second follow-up, and it supports the hero: even +5 GW leaves about a third of 27 Oct's waste by the simple rule.
3. **Pre-set the sandbox so the first placement produces a non-zero result.** Lane B warns that Z1 had only 28 tradable half-hours, so most placements on most days score £0 (#75 comment). Default to 27 Oct, 50 MW, Z1 and £60, so the judge's first try lights up. Show an honest "no request in this zone" message for zero cases instead of a blank.
4. **Draw the pipe.** The villain must be visible: a thick border line that fills past its limit, labelled "forecast demand on the cables" vs "cable limit" (PR #80's honesty note). Without it the story has no villain on screen.
5. **Put the 81,000 vs 38 contrast on the dashboard in those words**, not only as a percentage. 0.046% reads as noise; "asked 81,000, procured 38" reads as a story.
6. **Show the homes-equivalent next to GWh,** with an info tooltip giving the 2,700 kWh/home/yr assumption. The judges can feel homes; they can't feel GWh.
7. **Make the 8 Nov forecast a feature, not an embarrassment.** Tomorrow is calm (median 0 MWh all day, P(request) 23% from 11:00 to 22:30 UTC, `forecast.json`). Say so: "Tonight the wire has room. Here's how we'd know if it didn't." Then replay 27 Oct.
8. **Ask the Grid: only if the P0 spine is rehearsed.** Lanes A and B both advise against risk this close to freeze (#75 comments). If it ships, keep it to read-only, cited tool answers with an offline fallback, and don't make it the lead moment. **Drop the phone game:** the sandbox already gives judges a scored decision.
9. **Rehearse the three-minute run on the deployed site and offline,** with the 90-second video as backup (`docs/DEMO.md`, PR #67). Several winners are explicit that a reliable end-to-end demo beats breadth (winner 5).
