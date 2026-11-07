# Product requirements document: Turn Up Scotland

> The idea was chosen on 2026-11-07 after spikes #19–#25. The evidence and research are in [#25](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/25). `Open` marks a decision that still has an owner and a next check.
> Current team status: [STATUS.md](docs/coordination/STATUS.md), added for [issue #37](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/37) (refreshed about every two hours and after PR merges).

## Status and ownership

- **Status:** Building
- **Product name:** Turn Up Scotland (working title; "Where Did the Wind Go?")
- **Product owner / final decision maker:** Persia (`PersiaF04`)
- **Contributors and agents:** See the roster in section 13
- **Event:** HackTheBurgh XIII, Edinburgh, 7–8 Nov 2026
- **Last updated:** 2026-11-07
- **Last agreed by / date:** Persia, 2026-11-07. Varshil and sanamorii to confirm on #26.

## Team agreement gate

- [x] A specific user, their problem, and the evidence for it are stated (sections 2 and 9; #25).
- [x] The proposed solution and one end-to-end demo journey are understandable (sections 3 and 7).
- [x] Must-have scope, non-goals, and what to cut first are explicit (section 5).
- [x] Success can be checked through observable behavior or measured outcomes (sections 4 and 6).
- [x] Event rules, constraints, risks, and major assumptions have owners (run sheet, sections 8 and 11).
- [ ] Contributors agree on workstream boundaries and shared interfaces (section 10, `contracts/`). **Varshil and sanamorii confirm on #26.**
- [x] The product owner records approval above and sets the PRD status to `Team-approved`. Status is `Building` at Persia's request.

## Event run sheet

| Item | Agreed value / source |
| --- | --- |
| Event name, venue, and dates | HackTheBurgh XIII, Edinburgh, 7–8 Nov 2026, 24 hours ([listing](https://createwith.com/event/edinburgh-hacktheburgh-xiii-nov-2026)) |
| Official rules and judging criteria | Tracks: HRT "Best Use of Data for Predictions & Decision Making"; G-Research "Make the invisible visible". **Detailed criteria are not published**, so we check at the sponsor workshops (K-1). |
| Submission deadline and stated timezone | Sun 8 Nov 2026, 12:00 GMT (Devpost, per #25) |
| Submission deadline in UTC | 2026-11-08 12:00 UTC |
| Internal code freeze and timezone | 2026-11-08 07:00 UTC. Bug fixes only after this. Submit by 11:00 UTC. |
| Demo duration and presentation format | Open. Plan a 3-minute live demo plus a recorded video (section 7). |
| Submission method and required materials | Devpost project: description, video and repository link. Confirm the list on Devpost (owner: Persia). |
| Demo smoke command and expected result | `npm --prefix web run build && npm --prefix web run preview`, then the map dashboard and existing deep-dive screens render from `data/public/` or fixtures with no network |
| Fallback if a live service or network fails | Replay mode from committed JSON (R-7), plus a pre-recorded video |

## 1. Product summary

**Summary:** Scotland pays wind farms to switch off when the cables south are full. From 1 April to 6 November 2026, the reconstruction counts 7.12 TWh curtailed over 220 days. Between 1 April and 29 October (210 days), wind turn-down bids totalled about £188m; CCGT turn-up offers and NESO's thermal constraint-cost measure were about £1.81bn and £1.79bn. These are parallel measures, not an additive breakdown or proof of who ultimately paid. Turn Up Scotland makes the constraint visible in a central map dashboard, forecasts when NESO will ask for help, and lets a flexible-load operator test a readiness and bid decision against replay data.

## 2. Problem, users, and evidence

| User / stakeholder | Context and need | Current alternative and gap | Evidence / source |
| --- | --- | --- | --- |
| **Primary user:** operations lead of a flexible load behind Scotland's grid constraints (electrolyser, data centre, heat network with storage) or an aggregator | Decides each day which half-hours to be ready for, and what to bid into NESO's Demand Flexibility Service (DFS) | NESO's raw datasets are scattered and there is no forecast of requests. Across 30 DFS events in October (8–31 Oct), 81,000 MWh was requested and 0.046% was procured | NESO `demand-flexibility` dataset; `data/public/dfs_requests.json`; #25 deep dive |
| Secondary: energy-policy audience (journalists, analysts, the public) | Understand the waste and who pays for it | Wind bids totalled about £188m; parallel system-cost measures were £1.81bn (CCGT offers) and £1.79bn (NESO thermal constraint cost). These overlap and are not additive | Elexon cashflows vs NESO Constraint Breakdown, 210 days (1 Apr–29 Oct), daily corr 0.945; `data/public/iceberg.json` |

**Out of scope for the first version:** households and small loads (the DFS threshold and baselines differ), trading desks, and regions outside GB.

## 3. Proposed experience

1. **Start with the grid.** The default view is one Scotland map with headline metrics, timeline, tomorrow's forecast, the Copilot call and NESO's requests around it. A one-line explainer and legend should make the problem clear to a first-time viewer in about 10 seconds. Existing screens remain deep dives.
2. **Replay the waste.** Scrub a stormy day. Farms change state and counters show curtailed energy and payments; outages remain distinct from instructed turn-downs.
3. **Make a decision.** Place a flexible load on the map, choose its type, size, zone and bid, then replay the schedule client-side. Show load energy, net pounds and comparisons with the same-day Copilot and oracle. Pick the zone explicitly until its map geography is confirmed.
4. **Try a grid change.** If boundary data is available, let the judge add export capacity and show an approximate avoided-curtailment counterfactual. Label it as a simple estimate, not a power-flow model.
5. **Play the storm.** At higher playback speed, the judge switches the load on and sees the score against the Copilot.
6. **Check the evidence.** Deep dives show the hidden bill, requests, forecast and reconciliation limits. Keep retrospective, full-delivery, sample-size and zone-mapping caveats visible.

Load electricity consumption does not prove the electricity physically came from curtailed Scottish wind. Identify any wind-matched or avoided-curtailment figure as a separate approximate counterfactual, bounded by available data. If live or optional data is missing, the dashboard and replay remain usable from committed JSON or labelled fixtures.

## 4. Goals and success measures

| ID | Outcome | Measure / pass condition | Baseline | Target | Evidence source / owner |
| --- | --- | --- | --- | --- | --- |
| G-1 | Credible reconstruction of the hidden waste | Daily volume correlation vs NESO thermal constraints | n/a | ≥ 0.9 (0.91 already measured in #25) | `curtailment_daily.json` validation; lane A |
| G-2 | The forecast beats simple baselines out of sample | MAE and Brier on a chronological hold-out | Persistence: MAE 1,225 MWh, Brier 0.471 (3,170 half-hours, 1 Sep–5 Nov 2026; retrospective) | Beat both baselines on the same hold-out | `forecast.json` backtest; lane B |
| G-3 | The decision adds value over naive | Copilot `pct_of_oracle` vs naive on the same replay days and costs | Naive policy | Higher than naive, reported honestly | `copilot.json`; lane B |
| G-4 | The demo never breaks | The map dashboard and existing deep dives render offline from committed JSON | n/a | Smoke command passes at code freeze | Lane C |
| G-5 | The map turns evidence into an understandable decision | Map dashboard is the default and the core load sandbox recomputes client-side from optional contract data; 27 Oct agrees with the reference scorer | Static deep dives | A newcomer can explain the map in about 10 seconds; sandbox result matches the reference to the cent | #71, #75, #76; lanes B and C |

## 5. Scope and priorities

### P0: must work in the demo

- One central map dashboard is the default; the existing screens remain accessible as deep dives.
- A judge can place a load, choose MW, zone and bid, and see the client-side same-day result compared with the Copilot and oracle using the optional sandbox contract.
- The committed data path remains usable offline, with missing optional files handled clearly.
- The backfilled pipeline, curtailment forecast and Copilot comparisons remain available as evidence behind the interaction.

### P1: include if time allows

- Cable what-if slider using optional Scottish boundary limit/flow data. #75 leaves its priority at P0/P1 for the product owner to settle; label the result an approximate counterfactual.
- Play-the-storm interaction at 60× replay speed.
- Live mode and snapshot archiving for as-of forecasts.
- Dashboard summaries / request probabilities when their optional files are available.
- Tiger Data (Timescale) for storage (sponsor fit).

### P2: optional polish

- A desk-turbine mirror and an ESP32 relay load.
- A QR load picker.

### Non-goals

- Live trading or submitting real DFS bids.
- Claims of guaranteed revenue, avoided CO₂ from curtailed MWh alone, or that load consumption was physically sourced from curtailed wind.
- Claims that DFS zones are Scottish before mapping is confirmed.
- DfC (2028) beyond a labelled scenario.
- User accounts, authentication, or storing personal data for the core demo.

**Cut order if time is short:** P2 hardware/QR work first, then the cable what-if and Play the storm, then hosted live mode and Tiger Data. Preserve the central map and P0 load sandbox with evidence and caveats.

## 6. Requirements and acceptance

### R-1 [P0] Waste Map with replay

- **User / reason:** see the hidden waste.
- **Behavior:** a map of wind farms. A scrubber plays a replay day by half-hour and farms change state (`generating`, `instructed`, `unavailable`). Counters show MWh and GBP.
- **Acceptance checks:**
  - Given a replay file, when the user scrubs, then farm states and counters update for that half-hour.
  - Given a farm with no coordinates, then it is listed but not drawn, and a count of undrawn farms is shown.
- **How verified:** demo step 1; manual check against one Elexon half-hour.
- **Dependencies / owner:** lane A data (#27); lane C UI (#31).
- **Issues:** #27, #31

### R-2 [P0] The Iceberg

- **Behavior:** shows wind payments vs NESO constraint cost vs CCGT turn-up over the stated window, captioned "magnitude, not additive".
- **Acceptance checks:** given `iceberg.json`, all three figures appear with their window and sources.
- **Issues:** #27, #31

### R-3 [P0] Help Wanted

- **Behavior:** lists DFS `Upwards`/`System` requests with required vs procured MW, accepted price and auction-close-to-delivery time.
- **Acceptance checks:** given `dfs_requests.json`, the fill rate is computed from the data and zones are labelled by ID.
- **Issues:** #27, #31

### R-4 [P0] Tomorrow forecast

- **Behavior:** half-hourly p10, p50 and p90 curtailment plus P(heavy), and P(request) when available. A backtest strip shows the model and baselines.
- **Acceptance checks:** given `forecast.json`, every metric shows its baseline; given `retrospective: true`, a "retrospective" label is visible.
- **Issues:** #29, #32

### R-5 [P0] Flex Copilot

- **Behavior:** pick load type, MW and zone. It shows the schedule and naive, ours and oracle results, with `pct_of_oracle` and caveats.
- **Acceptance checks:** given `copilot.json`, all three policies use the same days and costs, and gross settlement is shown apart from energy cost.
- **Issues:** #30, #32

### R-6 [P0] Under the Hood

- **Behavior:** shows reconstruction validation, the outage vs instruction method, and the data-quality days that don't reconcile.
- **Acceptance checks:** given `curtailment_daily.json`, the correlation and ratio are shown with their window.
- **Issues:** #27, #29, #32

### R-7 [P0] Offline replay reliability

- **Behavior:** the dashboard and deep dives run from committed JSON with no network, and fall back to labelled fixtures per file.
- **Acceptance checks:** given no network, the smoke command renders the dashboard and existing deep-dive screens.
- **Issues:** #28, #31, #71

### R-8 [P1] Live mode

- **Behavior:** when `index.json` points to an available live replay, the Waste Map offers Live mode and refreshes it every 60 seconds while selected. A calm-weather banner appears when nothing is being curtailed; hide Live when the source is missing.
- **Issues:** #28, #62

### R-9 [P2] Hardware and QR interaction

- **Behavior:** the desk turbine mirrors one farm's state, a relay lamp follows the Copilot's schedule, and a QR load picker remains optional.
- **Issues:** #33

### R-10 [P0] Place your load

- **Behavior:** the map lets a judge place/select a load, choose size, zone and bid, and score its schedule client-side for the replay day.
- **Acceptance checks:**
  - Given optional `sandbox.json`, the chosen schedule reports load energy, gross settlement, electricity cost, assumed site value, net pounds and accepted half-hours, and compares on the same day with naive, Copilot and oracle results.
  - The default 27 Oct case reproduces the reference scorer and `copilot.json`; absent optional data does not break the map.
  - Load consumption is not described as physically sourced from curtailed Scottish wind. Any wind-matched / avoided-curtailment figure is separately labelled as an approximate counterfactual and uses the available curtailment input.
  - The zone is selected from NESO's IDs unless a verified zone-to-region mapping is available; no map-derived Scottish claim is made.
- **Dependencies / owner:** optional sandbox inputs and reference scorer (lane B); map interaction (lane C).
- **Issues:** #75, #76

### R-11 [P0/P1 priority to confirm] Cable what-if

- **Behavior:** a slider adds export capacity and estimates avoided curtailment from the relevant Scottish boundary limit/flow and replay data.
- **Acceptance checks:** when optional boundary data exists, the dashboard shows the scenario and labels it an approximate counterfactual, not a power-flow model; without the data, the rest of the dashboard works.
- **Dependencies / owner:** optional boundary data (lane A); map UI (lane C).
- **Issues:** #73, #75

### R-12 [P1] Play the storm

- **Behavior:** replay runs at 60×; the judge taps to switch the load on and sees its score against the Copilot.
- **Acceptance checks:** the game uses the same scoring assumptions as R-10 and does not claim consumption came from curtailed wind.
- **Issues:** #75

## 7. Demo and judging proof

The primary demo opens on the map dashboard, not the seven-tab navigation. Exact order and timing should be updated in `docs/DEMO.md` after the dashboard and sandbox are integrated.

| Demo step | User-visible behavior | Requirement / judging criterion | Proof or measure |
| --- | --- | --- | --- |
| 1. Map dashboard | Scotland map, one-line explanation, timeline and evidence KPIs; a first-time viewer understands the situation in about 10 seconds | #71; G-Research: make the invisible visible | Committed replay and dashboard evidence |
| 2. Place your load | Judge picks load size, zone and bid, then sees same-day results vs the Copilot and oracle | R-10; #75/#76; HRT: prediction to decision | Reference scorer / `sandbox.json`, consumption and approximate wind-matched amounts distinguished |
| 3. Cable what-if (if ready) | Judge changes export capacity and sees approximate avoided curtailment | R-11; #73/#75 | Boundary limit/flow replay data; explicitly not a power-flow model |
| 4. Deep dives and trust | Replay, hidden bill, DFS requests, forecast and reconciliation evidence | R-1–R-8; both tracks | Existing committed contract files and retrospective labels |
| 5. Play the storm (if ready) | 60× replay with judge switching the load on | R-12; HRT: decision quality | Same R-10 scoring assumptions |

## 8. Constraints and quality requirements

| Area | Agreed constraint or target | Reason / source | How verified |
| --- | --- | --- | --- |
| Event rules / time / team skills | 24-hour build, 3 developers and 5 agents; freeze 07:00 UTC | Event | Milestones (section 14) |
| Platform / device / connectivity | Desktop browser for the demo. Must work offline from committed JSON. | Venue Wi-Fi risk; calm weather | R-7 smoke check |
| Reliability / performance | Each screen interactive in under 2 s on a laptop. Replay scrubbing is smooth at 48 half-hours × about 200 farms. | Demo quality | Manual check |
| Accessibility / usability | **Apple-style design:** clarity, deference (content first, restrained chrome), depth (purposeful motion). System font stack, generous whitespace, light and dark modes, WCAG AA contrast, keyboard-operable scrubber, no colour-only states. | Team design direction | Lane C review |
| Privacy / security / data retention | Public datasets only, no personal data, no credentials in Git | AGENTS.md | Review |
| Cost / usage limits | Keyless public APIs, polite rate limits. Tiger Data trial only if a human signs up. | Data rights | Lane A |

Engineering follows AGENTS.md: KISS, small modules, no speculative abstractions, and a static front end reading JSON rather than a bespoke backend.

## 9. Data and external services

| Source / service | Purpose and data used | Access / rights / cost | Failure fallback |
| --- | --- | --- | --- |
| NESO Wind BOA Volumes | Curtailed volume per wind unit (MW, so MWh = /2) | Keyless, NESO Open Data Licence | Committed JSON |
| Elexon Insights (BOALF, PN, MELS, BOD, indicative cashflows) | Instructions, availability, £ | Keyless, Elexon open data | Committed JSON |
| NESO Constraint Breakdown | Validation reference | Keyless, NESO ODL | Committed JSON |
| NESO day-ahead constraint flows and limits | Forecast features (headroom) | Keyless; historical snapshot vintage unknown, so results are retrospective; PR #35 adds prospective archiving | Archived snapshots when available |
| NESO Day Ahead Wind BMU Forecast | Farm region; wind feature | Keyless | Committed JSON |
| NESO `demand-flexibility` (DFS) | Requests, procurement, prices | Keyless | Committed JSON |
| Tiger Data (P1) | Time-series storage (sponsor) | 30-day trial, a human signs up | DuckDB or Parquet locally |

No AI model produces numbers. If an LLM is used for narration (P2), it never produces figures.

## 10. Technical approach and shared boundaries

| Decision area | Agreed choice / status | Owner | Related decision or contract |
| --- | --- | --- | --- |
| Client / interface | React + Vite + TypeScript static app in `web/`, with the map dashboard as its default and existing screens as deep dives | Lane C | D-001 / #71 |
| Server / data | Python pipeline (`pipeline/`) and models (`models/`), writing contract JSON to `data/public/`. No bespoke API server for P0. | Lanes A and B | D-001 |
| External services | Keyless NESO and Elexon APIs; Tiger Data P1 | Lane A | Section 9 |
| Deployment / demo setup | Local `vite preview` remains the fallback; Vercel is manually deployed and verified at [turn-up-scotland.vercel.app](https://turn-up-scotland.vercel.app/) on 7 Nov; Git-connected deploys remain pending | Lane C | D-002 / issue #50 |
| Interactive sandbox | Client-side port of the lane B reference scorer using optional `sandbox.json`; no bespoke server for the core replay interaction | Lanes B and C | #75, #76 |
| Shared interface needed for parallel work | `contracts/README.md`, with fixtures in `contracts/fixtures/` | All three lane owners approve changes | [contracts](contracts/README.md) |

**Folder ownership:** lane A `pipeline/`; lane B `models/`; lane C `web/` and `hardware/`. `data/public/` holds generated files written only by their producing lane. Changes to `contracts/` need a PR approved by all three lane owners. CI runs Markdown lint and each lane's checks (`npm run build` for web, `pytest` for Python lanes once they exist).

## 11. Assumptions, risks, and open questions

| Assumption, risk, or question | Impact if wrong | Next check / decision | Owner | Due / status |
| --- | --- | --- | --- | --- |
| K-1: Sponsors value this framing | Misaligned pitch | Attend the G-Research workshop (17:00) and post the criteria on #26 | A human the team names (Persia to assign) | 2026-11-07 17:00 / Open |
| K-2: DFS zones Z1–Z3 are Scottish | Wrong claim on screen | NESO DFS terms or the Ofgem pack; until then, show zone IDs | Lane B | Open |
| K-3: Flows snapshot vintage unknown | Leakage in the backtest | Keep results labelled retrospective; use newly archived vintages only for prospective as-of evaluation | Lanes A and B | Open |
| K-4: Calm weather at demo time | No live action | Replay first (R-7) | Lane C | Mitigated |
| K-5: Reproduce one DFS settlement before showing £ | Wrong money claims | Keep full-delivery assumption visible; validate accepted and settled cost separately | Lane B | **Partly verified:** PR #48 reproduces accepted-cost arithmetic in the checked sample, but settled cost is about 39% of accepted cost. Do not present gross accepted cost as income. |
| K-6: Hardware parts on hand | P2 cut | Ask at the venue | Persia | Open |
| K-7: Tiger Data signup | Sponsor fit | A human signs up for the trial if wanted | Varshil | Open |

## 12. CI, delivery, and recovery

- **Local setup / run command:** `npm --prefix web ci && npm --prefix web run dev` (web). Python lanes document their own commands in `pipeline/README.md` and `models/README.md`.
- **CI checks required for a PR:** Markdown lint, Web build, Pipeline tests (when `pipeline/` changes) and Model tests (when `models/` changes). See `docs/coordination/CI-CD.md`.
- **Demo smoke check:** see the run sheet.
- **Deployment target / trigger:** Vercel is the agreed static host. The app and committed replay data paths were manually deployed and returned HTTP 200 at [the deployed app](https://turn-up-scotland.vercel.app/) on 2026-11-07. The project is not yet Git-connected, so rebuild and deploy after relevant merges until automatic deployment is configured. Use root `web/`, build `npm run build`, output `dist`, and include files outside the root because `sync-data` reads repository-root fixtures and data. The hosted build includes committed replay data only; `data/public/replay/live.json` is gitignored, so hosted R-8 live mode needs a separately approved publishing path.
- **Secrets / environment setup:** no secrets are needed to build or serve the current app. Any future Tiger Data credentials go in local `.env`, never in Git; deployment credentials belong in the host's environment settings if required.
- **Recovery / demo fallback:** committed JSON replay plus a recorded video.

## 13. Contributor and agent roster

| Contributor | Agent / tool | Workstream and boundaries | Issue IDs | Reviewer / integrator |
| --- | --- | --- | --- | --- |
| **Varshil** (`varshil247`) | Varshil's Claude (developer) | **Lane A: data and pipeline.** `pipeline/`; writes `farms`, `curtailment_daily`, `replay/*`, `iceberg`, `dfs_requests`, and optional Scottish boundary fields | #27, #28, #73 | Varshil's Codex (review) |
| **sanamorii** (`sanamorii`) | sanamorii's Claude (developer) | **Lane B: models, validation and decision.** `models/`; writes `forecast`, `copilot`, optional `dashboard.json` and `sandbox.json` | #29, #30, #74, #76 | Persia's Codex (review) |
| **Persia** (`PersiaF04`), product owner | Persia's Claude (developer, **integrator**) | **Lane C: front end, story and hardware.** `web/`, `hardware/`; reads all contract files and builds the map dashboard / interactions | #26, #31–#33, #38, #39, #46, #71 | Persia's Codex (review) |

Codex agents review pull requests and don't change the developer's branch. Humans merge after CI passes and review is approved. If no reviewer is free, a human may merge on green CI plus one approving agent review.

## 14. Milestones

All times are UTC.

| Milestone | Target date / timezone | Exit check | Owner |
| --- | --- | --- | --- |
| Agree on problem and idea | 2026-11-07 17:00 | PRD merged; lanes confirmed on #26 | Persia |
| Validate the riskiest assumption | 2026-11-07 18:00 | K-1 criteria posted; K-2 checked; archiver running | Team |
| Build the P0 demo spine | 2026-11-08 03:00 | Map dashboard and P0 deep dives render from real JSON; core load sandbox matches the reference scorer | Lane C (integrator) |
| Integrate and rehearse | 2026-11-08 07:00 (freeze) to 10:00 | Smoke check passes; video recorded; two rehearsals | Team |
| Submit | 2026-11-08 11:00 (deadline 12:00) | Devpost submitted | Persia |

## Change and evidence rules

- Keep this PRD focused on agreed product outcomes, constraints, and acceptance. GitHub Issues and PRs carry implementation tasks, owners, and status.
- Mark unresolved decisions `Open` or `Proposed`; do not let an agent turn them into requirements without the product owner's agreement.
- When scope changes, update the relevant requirement and linked Issue, and record material decisions in the decision log.
- Report what was actually verified and what was not exercised. Keep known limitations visible, especially if they affect the demo or a success claim.

## Glossary

- **Curtailment:** NESO pays a wind farm to reduce output, usually because the grid can't carry its power south.
- **BOA / BOALF:** an accepted instruction in the Balancing Mechanism.
- **DFS:** NESO's Demand Flexibility Service. `Upwards`/`System` requests ask for more demand in a zone.
- **Oracle:** the result a policy would get with perfect hindsight; the upper bound we compare against.
