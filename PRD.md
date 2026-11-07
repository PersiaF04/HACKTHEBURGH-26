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
| Demo smoke command and expected result | `npm --prefix web run build && npm --prefix web run preview`, then all six screens render from `data/public/` or the fixtures with no network |
| Fallback if a live service or network fails | Replay mode from committed JSON (R-7), plus a pre-recorded video |

## 1. Product summary

**Summary:** Scotland pays wind farms to switch off when the cables south are full. It threw away about 7.3 TWh in seven months. Wind turn-down payments were about £193m, while CCGT turn-up offers and NESO's thermal constraint-cost measure were each about £1.78bn over the same window. These are parallel measures of system cost, not an additive breakdown or proof of who ultimately paid. NESO now asks for flexible demand to absorb that power, and almost none arrives. Turn Up Scotland shows the hidden waste and its true cost. It forecasts when NESO will ask for help, and tells a flexible load operator when to be ready and what to bid.

## 2. Problem, users, and evidence

| User / stakeholder | Context and need | Current alternative and gap | Evidence / source |
| --- | --- | --- | --- |
| **Primary user:** operations lead of a flexible load behind Scotland's grid constraints (electrolyser, data centre, heat network with storage) or an aggregator | Decides each day which half-hours to be ready for, and what to bid into NESO's Demand Flexibility Service (DFS) | NESO's raw datasets are scattered and there is no forecast of requests. Requests go unanswered: **0.2% of 500 MW turn-up requests were filled in Oct 2026** | NESO `demand-flexibility` dataset; #25 deep dive |
| Secondary: energy-policy audience (journalists, analysts, the public) | Understand the waste and who pays for it | Headlines quote payments to wind (about £193m). Parallel system-cost measures (CCGT turn-up offers and NESO thermal constraint cost, each about £1.78bn) are rarely shown. These are not an additive breakdown | Elexon cashflows vs NESO Constraint Breakdown, 201 days, daily corr 0.94 (#25) |

**Out of scope for the first version:** households and small loads (the DFS threshold and baselines differ), trading desks, and regions outside GB.

## 3. Proposed experience

1. **See the waste.** The user opens the Waste Map and scrubs through a stormy day. Turbines grey out when NESO pays them to stop, and counters show GWh wasted and £ paid.
2. **See the hidden bill.** The Iceberg shows payments to wind above the waterline and the much larger constraint cost below it.
3. **See the unanswered call.** Help Wanted lists NESO's turn-up requests and how little was filled.
4. **See tomorrow.** Tomorrow shows forecast curtailment and the chance of a request for each half-hour, with the backtest beside it.
5. **Act.** In Flex Copilot the user picks their load and sees a recommended readiness and bid schedule, plus how naive, ours and perfect-hindsight policies would have done.
6. **Trust it.** Under the Hood shows how each number was rebuilt and checked against NESO, including the days that don't reconcile.

Empty and error states: if a data file is missing, the screen falls back to a labelled sample. If live data is quiet (calm weather), the app shows a "Live: no curtailment right now" banner and offers replay.

## 4. Goals and success measures

| ID | Outcome | Measure / pass condition | Baseline | Target | Evidence source / owner |
| --- | --- | --- | --- | --- | --- |
| G-1 | Credible reconstruction of the hidden waste | Daily volume correlation vs NESO thermal constraints | n/a | ≥ 0.9 (0.91 already measured in #25) | `curtailment_daily.json` validation; lane A |
| G-2 | The forecast beats simple baselines out of sample | MAE and Brier on a chronological hold-out | Persistence: MAE 1,224, Brier 0.471 (3,168 half-hours, 1 Sep to 5 Nov 2026, retrospective; corrected in #40) | Beat both baselines on the same hold-out | `forecast.json` backtest; lane B |
| G-3 | The decision adds value over naive | Copilot `pct_of_oracle` vs naive on the same replay days and costs | Naive policy | Higher than naive, reported honestly | `copilot.json`; lane B |
| G-4 | The demo never breaks | All six screens render offline from committed JSON | n/a | Smoke command passes at code freeze | Lane C |

## 5. Scope and priorities

### P0: must work in the demo

- Six screens: Waste Map (with replay), Iceberg, Help Wanted, Tomorrow, Flex Copilot, Under the Hood.
- A backfilled pipeline producing every contract file for at least two storm days.
- A curtailment forecast with an honest chronological backtest, plus the Copilot's naive, ours and oracle comparison.
- Offline replay mode and a recorded video.

### P1: include if time allows

- Live mode (5-minute refresh) and the snapshot archiver feeding as-of forecasts.
- Per-zone request probability.
- Static deploy to one public URL.
- Tiger Data (Timescale) for storage (sponsor fit).

### P2: optional polish

- A desk-turbine mirror and an ESP32 relay load.
- The "You're the operator" judge game.
- A QR load picker.

### Non-goals

- Live trading or submitting real DFS bids.
- Claims of guaranteed revenue, avoided CO₂ from curtailed MWh alone, or "Scotland" for DFS zones before they're confirmed.
- DfC (2028) beyond a labelled scenario.
- User accounts, authentication, or storing personal data.

**Cut order if time is short:** P2, then live mode, then the Tiger Data migration, then per-zone probability. Keep the P0 spine.

## 6. Requirements and acceptance

### R-1 [P0] Waste Map with replay

- **User / reason:** see the hidden waste.
- **Behavior:** a map of wind farms. A scrubber plays a replay day by half-hour and farms change state (`generating`, `instructed`, `unavailable`). Counters show MWh and £.
- **Acceptance checks:**
  - Given a replay file, when the user scrubs, then farm states and counters update for that half-hour.
  - Given a farm with no coordinates, then it is listed but not drawn, and a count of undrawn farms is shown.
- **How verified:** demo step 1; manual check against one Elexon half-hour.
- **Dependencies / owner:** lane A data (#27); lane C UI (#31).
- **Issues:** #27, #31

### R-2 [P0] The Iceberg

- **Behavior:** shows wind payments vs NESO constraint cost vs CCGT turn-up over the stated window, captioned "magnitude, not additive".
- **Acceptance checks:** given `iceberg.json`, when shown, then all three figures appear with their window and sources.
- **Issues:** #27, #31

### R-3 [P0] Help Wanted

- **Behavior:** lists DFS `Upwards`/`System` requests with required vs procured MW, accepted price and auction-close-to-delivery time.
- **Acceptance checks:** given `dfs_requests.json`, when shown, then the fill rate is computed from the data and zones are labelled by ID.
- **Issues:** #27, #31

### R-4 [P0] Tomorrow forecast

- **Behavior:** half-hourly p10, p50 and p90 curtailment plus P(heavy), and P(request) when available. A backtest strip shows the model and baselines.
- **Acceptance checks:** given `forecast.json`, then every metric shows its baseline next to it; given `retrospective: true`, then a "retrospective" label is visible.
- **Issues:** #29, #32

### R-5 [P0] Flex Copilot

- **Behavior:** pick load type, MW and zone. It shows the schedule and naive, ours and oracle results, with `pct_of_oracle` and caveats.
- **Acceptance checks:** given `copilot.json`, then all three policies come from the same days and costs, and gross settlement is shown apart from energy cost.
- **Issues:** #30, #32

### R-6 [P0] Under the Hood

- **Behavior:** shows reconstruction validation, the outage vs instruction method, and the data-quality days that don't reconcile.
- **Acceptance checks:** given `curtailment_daily.json`, then the correlation and ratio are shown with their window.
- **Issues:** #27, #29, #32

### R-7 [P0] Offline replay reliability

- **Behavior:** the app runs from committed JSON with no network, and falls back to fixtures per file.
- **Acceptance checks:** given no network, when the smoke command runs, then all six screens render.
- **Issues:** #28, #31

### R-8 [P1] Live mode

- **Behavior:** refreshes `replay/live.json` every 5 minutes. A calm-weather banner appears when nothing is being curtailed.
- **Issues:** #28

### R-9 [P2] Hardware and judge interaction

- **Behavior:** the desk turbine mirrors one farm's state, a relay lamp follows the Copilot's schedule, plus the judge game and the QR picker.
- **Issues:** #33

## 7. Demo and judging proof

| Demo step | User-visible behavior | Requirement / judging criterion | Proof or measure |
| --- | --- | --- | --- |
| 1. Waste Map (0:00–0:20) | Storm day replay, turbines stop, counters rise | R-1; G-Research: what's hidden | Reconstruction vs NESO, corr 0.91 |
| 2. Iceberg (0:20–0:45) | £193m vs £1.78bn | R-2; G-Research: the hidden bill | Cashflows vs Constraint Breakdown, corr 0.94 |
| 3. Help Wanted (0:45–1:05) | 500 MW asked, 0.2% filled | R-3; G-Research: what we can do | NESO DFS dataset |
| 4. Tomorrow plus Copilot (1:05–1:50) | Forecast, bid schedule, % of oracle | R-4, R-5; HRT: prediction leading to an automated decision | Chronological backtest vs baselines |
| 5. Judge game (1:50–2:30, P2) | A judge's calls vs the model | R-9; HRT: decision quality | Same scoring as the Copilot |
| 6. Under the Hood (2:30–3:00) | Validation and honest gaps | R-6; rigour | Data-quality panel |

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
| NESO day-ahead constraint flows and limits | Forecast features (headroom) | Keyless; snapshot vintage unknown, so results are retrospective | Archiver from tonight (#28) |
| NESO Day Ahead Wind BMU Forecast | Farm region; wind feature | Keyless | Committed JSON |
| NESO `demand-flexibility` (DFS) | Requests, procurement, prices | Keyless | Committed JSON |
| Tiger Data (P1) | Time-series storage (sponsor) | 30-day trial, a human signs up | DuckDB or Parquet locally |

No AI model produces numbers. If an LLM is used for narration (P2), it never produces figures.

## 10. Technical approach and shared boundaries

| Decision area | Agreed choice / status | Owner | Related decision or contract |
| --- | --- | --- | --- |
| Client / interface | React + Vite + TypeScript static app in `web/`, reading JSON | Lane C | D-001 |
| Server / data | Python pipeline (`pipeline/`) and models (`models/`), writing contract JSON to `data/public/`. No bespoke API server for P0. | Lanes A and B | D-001 |
| External services | Keyless NESO and Elexon APIs; Tiger Data P1 | Lane A | Section 9 |
| Deployment / demo setup | Local `vite preview` for the demo; static host P1 | Lane C | Run sheet |
| Shared interface needed for parallel work | `contracts/README.md`, with fixtures in `contracts/fixtures/` | All three lane owners approve changes | [contracts](contracts/README.md) |

**Folder ownership:** lane A `pipeline/`; lane B `models/`; lane C `web/` and `hardware/`. `data/public/` holds generated files written only by their producing lane. Changes to `contracts/` need a PR approved by all three lane owners. CI runs Markdown lint and each lane's checks (`npm run build` for web, `pytest` for Python lanes once they exist).

## 11. Assumptions, risks, and open questions

| Assumption, risk, or question | Impact if wrong | Next check / decision | Owner | Due / status |
| --- | --- | --- | --- | --- |
| K-1: Sponsors value this framing | Misaligned pitch | Attend the G-Research workshop (17:00) and post the criteria on #26 | A human the team names (Persia to assign) | 2026-11-07 17:00 / Open |
| K-2: DFS zones Z1–Z3 are Scottish | Wrong claim on screen | NESO DFS terms or the Ofgem pack; until then, show zone IDs | Lane B | Open |
| K-3: Flows snapshot vintage unknown | Leakage in the backtest | Label results retrospective; archiver from tonight | Lanes A and B | Open |
| K-4: Calm weather at demo time | No live action | Replay first (R-7) | Lane C | Mitigated |
| K-5: Reproduce one DFS settlement before showing £ | Wrong money claims | Varshil's Codex method from #25 | Lane B | Open |
| K-6: Hardware parts on hand | P2 cut | Ask at the venue | Persia | Open |
| K-7: Tiger Data signup | Sponsor fit | A human signs up for the trial if wanted | Varshil | Open |

## 12. CI, delivery, and recovery

- **Local setup / run command:** `npm --prefix web ci && npm --prefix web run dev` (web). Python lanes document their own commands in `pipeline/README.md` and `models/README.md`.
- **CI checks required for a PR:** Markdown lint, plus web build and Python tests as each lane adds them.
- **Demo smoke check:** see the run sheet.
- **Deployment target / trigger:** local preview for P0; a static host for P1 once chosen.
- **Secrets / environment setup:** none needed for P0 (keyless). Any Tiger Data credentials go in local `.env`, never in Git.
- **Recovery / demo fallback:** committed JSON replay plus a recorded video.

## 13. Contributor and agent roster

| Contributor | Agent / tool | Workstream and boundaries | Issue IDs | Reviewer / integrator |
| --- | --- | --- | --- | --- |
| **Varshil** (`varshil247`) | Varshil's Claude (developer) | **Lane A: data and pipeline.** `pipeline/`; writes `farms`, `curtailment_daily`, `replay/*`, `iceberg`, `dfs_requests` | #27, #28 | Varshil's Codex (review) |
| **sanamorii** (`sanamorii`) | sanamorii's Claude (developer) | **Lane B: models, validation and decision.** `models/`; writes `forecast`, `copilot` | #29, #30 | Persia's Codex (review) |
| **Persia** (`PersiaF04`), product owner | Persia's Claude (developer, **integrator**) | **Lane C: front end, story and hardware.** `web/`, `hardware/`; reads all contract files | #26, #31–#33, [#38](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/38), [#39](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/39), [#46](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/46) | Persia's Codex (review) |

Codex agents review pull requests and don't change the developer's branch. Humans merge after CI passes and review is approved. If no reviewer is free, a human may merge on green CI plus one approving agent review.

## 14. Milestones

All times are UTC.

| Milestone | Target date / timezone | Exit check | Owner |
| --- | --- | --- | --- |
| Agree on problem and idea | 2026-11-07 17:00 | PRD merged; lanes confirmed on #26 | Persia |
| Validate the riskiest assumption | 2026-11-07 18:00 | K-1 criteria posted; K-2 checked; archiver running | Team |
| Build the P0 demo spine | 2026-11-08 03:00 | All six screens render from real JSON | Lane C (integrator) |
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
