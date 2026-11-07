# Judge Q&A: fact-check and 25 harder questions

Companion to the judge Q&A in [`DEMO.md`](DEMO.md) and [`NARRATIVE.md`](NARRATIVE.md) ([issue #111](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/111), lane B). Part 1 checks the existing answers against `data/public/` as committed on 2026-11-07. Part 2 answers 25 questions the existing Q&A does not cover. Part 3 is the source table.

**Rules for every answer.** Wind is "procured", never "delivered". MWh is what a load uses. DFS zones Z1 to Z3 are NESO zone IDs, not places. The SCOTEX flow is NESO's day-ahead forecast, not outturn. Copilot results are retrospective, small-sample and not revenue. Where an answer rests on general knowledge rather than our files, it says so.

## Part 1: fact-check of the existing answers

Verdicts: **OK** (matches the file), **OK, caveat** (true but needs a qualifier), **ERROR** (does not match the file), **UNVERIFIED** (not checkable from `data/public/`). Source IDs (S1 to S12) are in Part 3.

### Numbers at a glance (`DEMO.md`)

| Claim | File, field, value I found | Verdict |
| --- | --- | --- |
| 7,116,615 MWh curtailed, 220 days | S1 `days[].curtailed_mwh` sums to 7,116,615, but 28 of the 220 days are `null` and add zero, so 192 days contribute | OK, caveat: it is a floor, not a full-period total (Q14) |
| Correlation 0.915 over 186 days; ratio 0.837 | S1 `validation`: 0.915, 186, 0.837. Recomputed from `days[]`: 0.9148 and 0.8374 | OK |
| 76 of 220 days outside 0.3x to 2x or one side missing; 10 have no NESO figure | Recomputed: 42 outside the band plus 34 with a missing side (10 no NESO figure, 28 no figure of ours, 4 both) | OK |
| £187,995,768 paid to wind; £1,814,407,407 CCGT offers; £1,787,705,531 NESO thermal; 210 days; 0.945 | S2: identical values; window 2026-04-01 to 2026-10-29 | OK, caveat: S1 `wind_paid_gbp` sums to £196,842,587 over the same window (Q15) |
| 30 events, 324 half-hours, 8 to 31 Oct | S3: 30 distinct `event_id`, 324 rows, first start 2026-10-08T18:00Z, last 2026-10-31T15:30Z | OK |
| 81,000 MWh requested, fill 0.046% | S3: `required_mw` / 2 sums to 81,000; `procured_mw` / 2 sums to 37.65; 37.65 / 81,000 = 0.0465% | OK |
| Median accepted £57.50/MWh over 82 priced half-hours; close to delivery 5.0 h | S3: median of `accepted_price_median_gbp_per_mwh` is 57.5 over 82 values (range 28.43 to 60.00); median gap 5.0 h (mean 5.5, range 0.75 to 10.5) | OK, caveat: a median of per-half-hour medians |
| Backtest 3,170 half-hours, MAE 663 / 1,225 / 999, Brier 0.149 / 0.471 / 0.299, AUC 0.914 / 0.528 | S4 `backtest` | OK |
| 8 Nov: median 0 all day; P(request) 23% from 11:00 to 22:30 UTC | S4 `periods[]`: p50 = 0 and p90 = 0 in all 48; `p_turnup_request` = 0.233 in 24 half-hours | OK |
| Copilot 94.6% of oracle; net £1,976 / £11,909 / £12,594 | S5 `summary`; 11,909 / 12,594 = 0.9456 | OK |
| Settlement £10,500 vs electricity £16,091 | S5 `summary`; 175 MWh x £60 = £10,500 | OK |
| Settled / accepted cost 0.394 over 476 half-hours | S5 `validation` | OK, caveat: the Upwards/System-only ratio is 0.826 but on 2 half-hours (Q20) |
| Naive wins above about £134/MWh | S5 `sensitivity`: ours minus naive is +£9,933 at £100 and -£4,486 at £150; straight-line crossing is £134.4 | OK, caveat: interpolated, as `VIDEO-AND-DEVPOST.md` already says |

### Live demo script and Devpost text (`DEMO.md`)

| Claim | File, field, value I found | Verdict |
| --- | --- | --- |
| 14 Oct: "149 GWh thrown away", £5.3M | S6 `2026-10-14.json`: 147,972 MWh and £5,332,713; S1 14 Oct: 147,966 MWh | **ERROR**: 148 GWh, not 149. £5.3M is right |
| 14 Oct: "at 04:00 UTC 90 farms are paid to stop" | S6: 90 farms in state `instructed` at 04:00 UTC | OK, caveat: 6 of the 90 have negative net pay (the farm paid NESO) |
| "£5.3M paid to wind" for the day | S6: positive payments £5,969,932, negative -£637,220, net £5,332,713 | OK, caveat: it is a net figure (Q15) |
| Gas turn-up and NESO cost "about 9.7 times larger" than £188M | S2: 1,814,407,407 / 187,995,768 = 9.65; 1,787,705,531 / 187,995,768 = 9.51 | OK, caveat: 9.5 to 9.7 depending on the measure |
| 27 Oct ready 11:00 to 14:30 UTC at £60 | S5 `days[2026-10-27].schedule`: 7 `ready` half-hours from 11:00 to 14:00 start, bid 60 | OK |
| "all of that value is one day, 27 Oct" | S5 `days[]`: ours and oracle are £0 on the other 12 days | OK, caveat: naive loses £546 on 16 Oct and £6,011 on 29 Oct |
| 76 days listed on Under the Hood | S1, as above | OK |
| Pay-as-bid reproduces accepted cost in all 1,130 matched half-hours | S5 `validation`: 1,130 matched, 1,130 within 2p | OK, caveat: this checks price x volume arithmetic, not delivery |
| "Be the Operator": every block soaks up 100 MWh on 14 Oct | Not in the files I checked | UNVERIFIED |

### Judge Q&A answers (`DEMO.md` section 4)

| Q | Check | Verdict |
| --- | --- | --- |
| 1. Curtailment right | Sources and numbers as in the table above | OK |
| 2. Thirty events | Brier 0.238 vs base rate 0.268 (S4 `backtest.turnup.brier`), 27 scored days, 28 tradable half-hours, one day carries the value: all match. "DFS began procuring constraint turn-up on 8 Oct" | OK, caveat: S4 `turnup.era_start` and S5 `summary.caveat` say 7 Oct; the first request in S3 is 8 Oct. Say "began 7 Oct, first request 8 Oct" as `README.md` does |
| 3. Out of sample | S4 `meta.leakage_note` matches | OK |
| 4. Copilot £ is not revenue | S5 matches. Net = settlement + value - electricity = 10,500 + 17,500 - 16,091 = 11,909 | OK, caveat: 17,500 of the 28,000 inflow is the assumed £100/MWh site value (Q20) |
| 5. Cannot add the three | S2 `note` matches. "NESO's thermal constraint cost is NESO's own total" | OK, caveat: it is the thermal-constraint series only, not all constraint cost |
| 6. DFS zones | PRD K-2 and the file notes agree | OK |
| 7. Flat forecast | S4 `meta.model` = `wind_forecast`; flow model MAE 619.8 vs headroom 811.0 | OK |
| 8. No live trading | PRD non-goal | OK |
| 9. Oracle | S5 `assumptions.oracle_rule` matches | OK, caveat: also limited to 12 periods a day (`load.max_periods_per_day`) |
| 10. No CO2 | No CO2 field in any file | OK |
| 11. AI | No AI-written number in the files | OK today; re-check if "Ask the Grid" ([PR #93](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/93)) ships |

### `NARRATIVE.md` figures that are stale or wrong

| Claim | File, field, value I found | Verdict |
| --- | --- | --- |
| 27 Oct 168 GWh, £6.4m, about 62,000 homes | S1: 168,351 MWh and £6,424,730; 168,351 / 2.7 = 62,352 homes at the stated 2,700 kWh | OK (the home figure is an assumption, not data) |
| 7.12 TWh is about 2.6 million homes | 7,116,615 / 2.7 = 2.64 million | OK, caveat: the 7.12 TWh is a floor (Q14) |
| 27 Oct flow 10,234 to 12,713 MW, limit 4,850 MW to 04:30 then 2,800 MW, above limit in all 48 half-hours | S6 `2026-10-27.json`: matches (the limit steps down at 05:00 UTC) | OK |
| 14 Oct flow peaks at 11,055 MW at 16:30 UTC vs 5,900 MW, above limit in 42 of 48 | S6: matches | OK |
| 27 Oct replay total 183,752 MWh | S6: 168,390 MWh | **ERROR**: stale from an earlier build of the replay |
| Cable what-if 27 Oct: +1 GW avoids 24,000 (13%), +5 GW avoids 120,000 (65%) | Same rule on the current S6: +1 GW avoids 24,000 (14.3% of 168,390), +5 GW avoids 120,000 (71.3%) | **ERROR** on the percentages and on "about a third remains" (it is about 29%). The MWh are right |
| Cable what-if 14 Oct: +1 GW 20,000 (13%), +5 GW 69,000 (46%) | Same rule: 20,020 (13.5%) and 69,014 (46.6%) | OK |
| Seagreen turned down about 24,200 MWh on 14 Oct for about £355k | S6: six Seagreen units total 23,274 MWh and £355,172 | **ERROR**: 23,274 MWh, not 24,200 |
| Black Law 124 MW unit turned down about 946 MWh on 14 Oct | S6 `T_BLLA-1`: 946 MWh (the 64 MW extension adds 891) | OK |
| Farms within about 45 km of Edinburgh | S7 coordinates: Dun Law 28 km, Crystal Rig 42 km, Black Law 42 km, Aikengall 44 km (straight line) | OK |
| 500 MW asked "from 11 until 11" | S3: 27 Oct requests run 11:00 to 23:00 UTC | **ERROR**: typo, should be 11:00 to 23:00 |
| 27 Oct: auction close 10:00 UTC | S3: two closes on 27 Oct, 10:00 and 12:00 UTC | OK, caveat: not a single close time |
| 27 Oct 6,000 MWh requested, 2.4 MWh procured | S3 | OK |
| 27 Oct "the only day the Copilot has a scored call" | S5: ours also has a schedule on 19, 22, 23, 24 and 25 Oct but accepts nothing | OK, caveat: it is the only day with a non-zero result |
| Replay figures "come from PR #80's branch" | S6 is now on `main` | Stale wording |
| "Each dot is a Scottish wind farm" (map lede, script) | S7 lists 231 farms in 10 NESO regions; only 155 appear in the replays, all North or South Scotland | Check what the map draws for the 76 others |

## Part 2: 25 harder questions

Each answer is short and states its source and its limit.

### Q1. How leaky is your backtest, and what would fix it?

The model's features are NESO's national day-ahead wind forecast for the target day and Scottish curtailment from two or more days earlier. The 8 Nov forecast uses a genuine day-ahead input. The archive we fit and score on is stamped on the target morning, a later and better-informed version, so the scores are probably optimistic. Source: S4 `meta.leakage_note`. Limit: we cannot say how much. The fix is scoring on our own archived snapshots, which the team has only just started archiving, so a clean score needs weeks of accumulation.

### Q2. Are your probabilities and your P10 to P90 band calibrated?

Not fully. The band covered 71% of half-hours against a nominal 80%. The heavy-period probability under-predicts in the middle: predicted 0.56 against observed 0.97 (235 half-hours), predicted 0.46 against 0.77 (401). Source: S4 `backtest.interval_coverage_p10_p90` and `backtest.reliability`. Limit: the ranking is good (AUC 0.914), the stated probabilities are too low, so use it as a ranking, not a calibrated chance.

### Q3. Persistence two days back is a weak baseline. Why should we be impressed?

Fair. Persistence here is the same half-hour two days earlier, which is what is known before the day starts. The model beats it (MAE 663 vs 1,225) and the training mean (999). We did not score a stripped-down "NESO national wind forecast scaled to curtailment" baseline, which is the model's own main input, so we cannot say how much the extra modelling adds. Source: S4 `backtest.method`, `backtest.mae_mwh`. For the flow model we did score a simple headroom rule (MAE 811 vs 620).

### Q4. Why not just build more cables?

Cables help and we say so. A simple counterfactual on the replays (avoided = min(curtailed, reduction in forecast flow above the limit), per half-hour): on 27 Oct, +1 GW avoids about 24,000 MWh (14%) and +5 GW about 120,000 MWh (71%); on 14 Oct, +1 GW avoids about 20,000 MWh (13.5%) and +5 GW about 69,000 MWh (47%). Source: S6 `periods[].scotex_flow_mw`, `scotex_limit_mw`, `farms[].curtailed_mwh`. Limits: the flow is NESO's day-ahead forecast, not outturn; the rule is not a power-flow model; the 2,800 MW limit on 27 Oct is unusually low and unconfirmed with lane A. That building transmission takes years is general knowledge, not in our data. Demand flexibility is a near-term complement, not a replacement.

### Q5. A 50 MW electrolyser against gigawatts of waste: does this matter?

At this scale, no, and we should not imply otherwise. Scottish curtailment on 27 Oct averaged about 7,000 MW (168,351 MWh over 24 hours). Our modelled load used 175 MWh that day, 0.10% of it. NESO's whole 500 MW request is about 7% of that average. Source: S1, S5 `days[2026-10-27]`, S3. The pitch is that the signal and the unanswered call are visible, not that one load fixes the problem.

### Q6. Who pays for all this, and who would pay you?

Our data shows what NESO's accepted DFS bids were (median £57.50/MWh) and what wind was paid to switch off (£188M), but not who ultimately funds them. `iceberg.json` is explicitly "magnitude, not additive" and does not show who pays. That GB system balancing costs are passed on to suppliers and then to bills is general knowledge, not something we measured. We have no business model or customer: this is a hackathon decision-support prototype with no revenue claim. Source: S2 `note`, S3, S5 `caveat`.

### Q7. Is 0.046% real, or an artefact?

The arithmetic is real: 37.65 MWh procured over 81,000 MWh requested, from NESO's DFS requirement and utilisation reports across 324 half-hours. Procurement happened in 82 of the 324 half-hours and in 9 of the 30 events; the best single half-hour filled 5.1% (25.5 of 500 MW). Source: S3 `required_mw`, `procured_mw`. Limits: `required_mw` is NESO's published requirement and may not be a hard need; we do not see other routes NESO may use to meet it; the dataset is under one month old. We say "procured" and "asked for", not "failed".

### Q8. Procured is not delivered. What do you know about delivery?

Almost nothing, and the Copilot assumes full delivery. NESO's published settled cost is 39.4% of accepted cost across all DFS (476 settled half-hours), and 82.6% for Upwards/System but on only 2 half-hours. Source: S5 `validation`. Limit: settlement lags and covers few of our events, so we cannot estimate a delivery rate for turn-up. The Copilot's results are therefore an upper bound on delivery.

### Q9. Why is the whole demo built around 27 October?

It is the largest curtailment day in the series (168,351 MWh), it has a SCOTEX gap above the limit all day, a 500 MW DFS request, a replay, and the only non-zero Copilot result. Source: S1, S3, S5, S6. Limit: that also means the headline Copilot result is one day. The replay set is three days (13, 14, 27 Oct) and the sandbox covers 18 days from 8 to 31 Oct (S6 `index.json`, S8).

### Q10. Is "94.6% of oracle" statistically meaningful?

No, and we do not claim it is. The oracle accepted 8 half-hours on one day (200 MWh); ours accepted 7. The other 12 scored days are zero for ours and the oracle. At site values of £0 and £50 ours equals the oracle trivially (net £30 and £3,899). At £150 and £200 ours falls to 61.5% and 50.4% of the oracle and loses to naive. Source: S5 `days[]`, `sensitivity`. We have no confidence interval and the half-hours cluster by event.

### Q11. Can a load really bid into this?

Our Copilot assumes a bid is accepted whenever it is at or below the highest price NESO accepted in the load's zone that half-hour. That is a replay rule, not a statement that a real bid would have been accepted. Registration as a DFS provider (directly or through an aggregator), minimum size, metering and baselines are not modelled and not in our data. We have not verified them. Source: S5 `assumptions.acceptance`. This is why live bidding is a PRD non-goal.

### Q12. What is a DFS zone, and is it in Scotland?

NESO's DFS requirement lists a cap per zone (Z1, Z2, Z3), each 500 MW. We do not know how the zones map to regions (PRD K-2), so no screen calls them Scotland. Observed behaviour: Z1 and Z2 appear in every event; Z3 is available in 74.7% of events; on 27 Oct the accepted-price ceiling was £60 in Z1 and Z2 and £70 in Z3. Source: S3 `zone_caps_mw`, S4 `turnup.zone_cap_share_given_event`, S8 `days[2026-10-27]`. Z3 is missing from the zone caps of 82 half-hours, none of which had any procurement; we have not explained why.

### Q13. Why does gas turn-up matter, and is £1.8B overstated?

When Scottish wind is turned down, power has to be replaced south of the constraint, typically by gas plants being paid to turn up. That mechanism is general knowledge. In our data CCGT offers track NESO's thermal constraint cost with daily correlation 0.945. Source: S2. Limits: the CCGT series includes energy-balancing actions as well as constraint actions, so it is an upper-bound magnitude, not a constraint cost; the thermal series is one constraint type; we cannot link a specific wind turn-down to a specific gas turn-up.

### Q14. Is 7.12 TWh complete?

No, it is a floor. 28 of the 220 days (for example 23 to 28 Apr, 13 to 16 Jul, and 2 to 6 Nov) have no curtailment figure from us and add zero. Ten days (27 and 28 Oct, 30 Oct to 6 Nov) have no NESO comparison figure. Source: S1 `days[].curtailed_mwh` is `null`. Say "at least 7.1 TWh" and do not annualise it. The 168 GWh figure for 27 Oct is unaffected and agrees with the Elexon-based replay (168,390 MWh).

### Q15. You quote £188M and also a daily "paid" figure. Do they agree?

Not exactly. Summing the daily `wind_paid_gbp` over 1 Apr to 29 Oct gives £196.8M; the iceberg wind-bids figure for the same window is £188.0M, a gap of £8.8M (4.7%). We have not reconciled them; the likely cause is two different filters over the same Elexon cashflows, which is a guess. Also, "paid" is net: on 14 Oct farms were paid £5.97M and paid back £0.64M, and 29 Oct is net negative (-£482,772). Source: S1, S2, S6. Use £188M as the headline and avoid adding the two.

### Q16. Is the 0.915 correlation just two series that rise on windy days?

Partly, yes. It shows the series move together, not that either is correct. Our ratio to NESO's series is 0.837, so we are about 16% lower, and the two are not the same quantity (NESO's series is thermal-constraint volume, ours is wind-only BOA volume). 76 days fall outside 0.3x to 2x or are missing a side. The one independent cross-check is that on 27 Oct the Elexon bid volumes in the replay (168,390 MWh) match our NESO Wind BOA daily figure (168,351 MWh), a day with no NESO thermal figure to compare. Source: S1 `validation`, S6.

### Q17. What counts as "Scottish"?

NESO's day-ahead wind forecast region of North Scotland or South Scotland, and the BMUs tagged to those regions. That includes offshore farms such as Seagreen. It is a grid-region definition, not a geographic one. Source: S4 `meta.region_definition`, S7 `region`. The farm file has 231 farms (187 in the two Scottish regions); the replays use 155.

### Q18. Why does the model say 23% chance of a request on a calm day?

Because it is nearly a constant: 0.233 for every half-hour from 11:00 to 22:30 UTC. The request model is weak: AUC 0.647 and Brier 0.238 against a base rate of 0.268, over 27 days. Its top bins are overconfident (predicted 0.82, observed 0.42 on 24 half-hours). Source: S4 `periods[]`, `backtest.turnup`. Read it as "requests are possible", not as a forecast.

### Q19. Why is the forecast flat for tomorrow, and is the model even working?

NESO had not published future flow data for 8 Nov, so the model used the national day-ahead wind forecast, which implies a calm day: 0 MWh at p10, p50 and p90. A calm-day forecast is the easy case: in November the model's MAE was 76 vs persistence 222 (240 half-hours, none heavy). Source: S4 `periods[]`, `backtest.by_month`. The hard cases are the heavy days in September and October, where MAE was 689 and 733.

### Q20. What does the Copilot get wrong?

The list: full delivery assumed (Q8); electricity priced at the GB market index, not a site tariff, and no levies (S5 `assumptions.energy_price`); acceptance assumed whenever the bid is at or below the accepted price (Q11); one load type, 50 MW, one zone, with other loads scaled linearly in the sandbox; a cap of 12 periods a day; no ramp times, baselines or rebound; and the value of the energy is an input. Of the £28,000 that settlement (£10,500) plus assumed value (£17,500) bring in, the assumed value is 62%. Source: S5 `assumptions`, `summary`, S8 `scoring_rule`.

### Q21. Does the electrolyser actually soak up curtailed wind?

We match MWh used to curtailed MWh in the same half-hour (`wind_matched`), and on 27 Oct curtailment far exceeds the load in every requested half-hour (at least 3,026 MWh against 25 MWh). But the load buys at the GB market index price, which averaged about £178/MWh across the 27 Oct requested half-hours, not at a low local price. Whether a real site sits behind the constraint is unknown, because the zone is not mapped to a place. Source: S8 `days[2026-10-27].half_hours`, `scoring_rule`. So "absorbs curtailed wind" is a system-level framing, not a metered claim.

### Q22. What are the data licences, and is the code open source?

NESO data is under the NESO Open Data Licence, Elexon open data and DESNZ's Renewable Energy Planning Database are used under their own terms, and OSM power-line geometry is ODbL. Our `grid.json` carries the credit "(c) OpenStreetMap contributors, ODbL" and the web app must show it as a visible link. The map outline is Natural Earth, public domain. The repository has no `LICENSE` file yet, so the code is not licensed for reuse; that is an open product-owner decision. Limit: ODbL's share-alike applies to a derived database; we publish simplified geometry and have not had licence advice. Source: S9, S10, S11.

### Q23. Does it scale?

The pipeline writes static JSON (3.0 MB in `data/public/`, largest files `sandbox.json` 257 KB and `grid.json` 222 KB) and the app is static, so serving scales trivially. The data side is a Python batch over 220 days, 231 farms and 1,694 line segments; we have not load-tested anything beyond that. Live mode reads a published gist (`replay/index.json` `live`) on a five-minute refresh target, which is not yet proven under load. Source: S6 `index.json`, S12.

### Q24. How do you turn MWh into homes, and which day is "27 Oct"?

Homes use an assumed 2,700 kWh per home per year: 168,351 MWh is about 62,000 homes and 7.12 TWh about 2.6 million. The 2,700 figure is an assumption from `NARRATIVE.md`, not from our data, so say "roughly". Days: the daily file uses calendar dates; the 13 and 14 Oct replays run from 23:00 UTC the night before (settlement days in British Summer Time), so a "04:00 UTC" label on 14 Oct is the 05:00 BST half-hour. 27 Oct is after the clocks changed, so it starts at 00:00 UTC. Source: S1, S6 `periods[].start_utc`.

### Q25. What would you do with more time?

In priority order: (1) score the forecast on our own archived day-ahead snapshots so the backtest stops being retrospective; (2) confirm the DFS zone mapping with NESO; (3) reconcile the two "paid to wind" totals and fill the 28 empty days; (4) model partial delivery from NESO settled volumes; (5) re-run the Copilot per load type, size and zone as DFS events accumulate; (6) add a power-flow-based counterfactual in place of the simple cable rule; (7) choose a code licence. Source: `DEMO.md` "What's next", PRD K-2 and K-3.

### Note on AI and "Ask the Grid" (not one of the 25 questions)

The numbers in the committed data files come from the pipeline and models over public NESO and Elexon data, and no language model writes a value into them. Not every figure we say aloud is pipeline output: the homes-equivalent uses an assumed 2,700 kWh per home per year, the £134/MWh crossover is our interpolation of the sensitivity table, and the DFS, cable and licence context in Part 2 comes from general knowledge and is marked as such. AI agents wrote and reviewed much of the code. If "Ask the Grid" ships ([PR #93](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/93)), its figures must come from read-only tool calls over these files, with citations. The golden question set checks that the tools return fixed, expected values; it does not check every natural-language answer, because a language model can still phrase a number wrongly. Check the shipped answers against the golden set before the demo.

## Part 3: source table

All paths are under `data/public/` unless stated; all files carry `retrospective: true` except `grid.json`.

| ID | File | Fields used |
| --- | --- | --- |
| S1 | `curtailment_daily.json` | `days[].curtailed_mwh`, `wind_paid_gbp`, `neso_thermal_mwh`, `neso_thermal_gbp`; `validation` |
| S2 | `iceberg.json` | `window`, `days`, `wind_bids_gbp`, `ccgt_offers_gbp`, `neso_thermal_gbp`, `ccgt_vs_neso_corr_daily`, `note`, `meta.source` |
| S3 | `dfs_requests.json` | `requests[].event_id`, `start_utc`, `required_mw`, `zone_caps_mw`, `procured_mw`, `accepted_price_median_gbp_per_mwh`, `auction_close_utc` |
| S4 | `forecast.json` | `meta` (`leakage_note`, `region_definition`, `model`), `periods[]`, `backtest` (`mae_mwh`, `brier_heavy`, `auc_heavy`, `interval_coverage_p10_p90`, `reliability`, `by_month`, `flow_model`, `turnup`) |
| S5 | `copilot.json` | `load`, `days[].policies`, `days[].schedule`, `summary`, `assumptions`, `sensitivity`, `validation` |
| S6 | `replay/2026-10-13.json`, `2026-10-14.json`, `2026-10-27.json`, `replay/index.json` | `periods[].farms[].curtailed_mwh`, `paid_gbp`, `state`; `scotex_flow_mw`, `scotex_limit_mw`; `meta.scotex_note`; `live` |
| S7 | `farms.json` | `farms[].id`, `name`, `region`, `lat`, `lon`, `capacity_mw` |
| S8 | `sandbox.json` | `days[date].half_hours[]` (`curtailed_mwh`, `mid_gbp_per_mwh`, `ceiling_gbp_per_mwh`), `scoring_rule` |
| S9 | `grid.json` | `meta.attribution`, `meta.attribution_url`, `counts` |
| S10 | `README.md` (repo root), `PRD.md` | Licence and data-source notes, risks K-1 to K-7 |
| S11 | `web/src/assets/README.md` | Natural Earth licence |
| S12 | `dashboard.json` | `tomorrow` (headline, `facts`), `replay_days` |
