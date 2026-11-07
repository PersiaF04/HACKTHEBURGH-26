# Turn Up Scotland — shared status

**Shared brain:** this file holds where the work stands now; the [PRD](../../PRD.md) holds what was agreed. Read both.

**As of:** 2026-11-07 19:30 UTC

**Next refresh:** by 21:30 UTC, or sooner after any PR merges.

**Project:** [PRD](../../PRD.md) · [decision log](DECISIONS.md) · [work queue](BOARD.md)

This is a point-in-time coordination snapshot, not a second task tracker. GitHub Issues and PRs remain authoritative. Refresh it about every two hours and whenever a PR merges. Keep unconfirmed decisions marked **Open**.

## Time remaining

As of the timestamp above:

- **Code freeze:** 11h 30m, at 2026-11-08 07:00 UTC.
- **Internal submission target:** 15h 30m, at 2026-11-08 11:00 UTC.
- **Submission deadline:** 16h 30m, at 2026-11-08 12:00 UTC.

## Workstream status

| Lane | Owner and boundary | Issues and PRs | Current state |
| --- | --- | --- | --- |
| A — data and pipeline | Varshil / Varshil's Claude; `pipeline/`, outputs under `data/public/` | PRs #35, #49, [#80](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/80) and [#88](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/88) merged; [PR #92](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/92), [PR #94](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/94) and [PR #95](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/95) open | SCOTEX fields, the hosted live Gist, 230 of 231 farm coordinates and `grid.json` are on `main`. The poller runs on Varshil's PC (K-8). PRs #92 (runbook), #94 (poller refresh) and #95 (contract table) need review. |
| B — models, validation and decision | sanamorii / sanamorii's Claude; `models/`, outputs under `data/public/` | PRs #40, #48, #52, #55, #60, [#78](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/78) and [#81](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/81) merged; [PR #93](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/93) open | Forecast, Copilot, `sandbox.json` and `dashboard.json` are on `main`. PR #93 adds the Ask the Grid tool manifest and golden questions only; the feature itself is undecided (K-9). It needs all three lanes because it adds a contract file. |
| C — web, story and hardware | Persia / Persia's Claude; `web/` and `hardware/` | PRs #36, #47, [#67](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/67), [#68](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/68), [#72](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/72) and [#85](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/85) merged; [PR #89](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/89) and [PR #83](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/83) open; #90 and optional #33 open | PR #89 (map dashboard, #71, Place your load and cable what-if from #75) has Codex changes requested on two copy claims and the 27 Oct volume gap. PR #83 (narrative) is approved but behind `main`. #90 (stale-data warning) has no PR yet. Play the storm (P1) is not started. |
| Shared foundation and delivery | Persia / product owner and integrator; `PRD.md`, `contracts/`, deployment | #50 open; PR for #96 open | Vercel is deployed manually at <https://turn-up-scotland.vercel.app> and still serves the seven-tab layout until #89 merges and is redeployed. Git is not connected. The PR for #96 syncs the PRD and records D-003. |
| Shared status | Persia's Codex; this file and small linked PRD updates | #37 open; [PR #77](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/77) open | The PR for #96 merges PR #77's branch and refreshes this file, which clears the staleness finding on #77. Once that merges, #77 has nothing left to land. |

## Merged and blocked work

- **Merged to `main` since the last refresh on `main`:** PRs #66, #67, #68, #70, #72, #78, #80, #81, #85, #87 and #88.
- **Open work:** PR #89 is blocked on Codex's copy findings. PRs #92, #93, #94 and #95 need review. PR #83 needs a branch update. Hosted Live UI with active curtailment has not been exercised (PR #89 tested a calm Gist only).
- **Next status refresh:** refresh after the next PR merge, and by 21:30 UTC at the latest.

## Next three priorities

1. **Land the map dashboard (#71, PR #89):** fix the copy findings, get cross-account approval, then rebuild `main` and redeploy to Vercel.
2. **Update the submission materials:** `docs/DEMO.md` still describes seven screens and opens on 14 Oct; align it with the dashboard and the 27 Oct hero day, and settle K-10.
3. **Decide the open product questions:** Ask the Grid (K-9), cable what-if priority (K-12), and the descriptions of the other two sections (K-11).

## Risk register status

Statuses reflect the PRD's K-1 to K-12 entries and current issue/PR evidence; they do not close a risk without evidence.

| Risk | Status | Current evidence / next check |
| --- | --- | --- |
| K-1 — sponsor criteria fit | **Open** | The 17:00 UTC G-Research workshop is recorded; no attendee or criteria result is confirmed in the handoffs reviewed. Capture the result on #26. |
| K-2 — DFS zones are Scottish | **Open** | Map-to-zone mapping is unconfirmed. Keep the explicit zone picker and do not infer a Scottish zone from a map pin. |
| K-3 — flow snapshot vintage / leakage | **Partly mitigated** | Archiver code is on `main`, but no valid historical as-of vintage is established. Keep backtests retrospective; use newly captured snapshots prospectively. |
| K-4 — calm weather during demo | **Mitigated** | Committed replay data and fixtures provide an offline demo path. |
| K-5 — reproduce DFS settlement before showing GBP | **Partly verified** | PR #48 reproduces accepted-cost arithmetic in the checked sample, but settled cost is about 39% of accepted cost. Keep the full-delivery assumption visible and show net sensitivity; do not present gross accepted cost as income. |
| K-6 — hardware parts available | **Open; P2** | Venue availability is unconfirmed. Keep the on-screen fallback and cut hardware first if needed. |
| K-7 — Tiger Data signup | **Open; optional** | No signup is confirmed. Keep this optional and out of the critical path unless a human decides otherwise. |
| K-8 — hosted Live depends on Varshil's PC | **Open** | The poller publishes to the Gist every 5 minutes while the PC runs. #90 (warning) has no PR yet; PR #92 (runbook) is in review. Replay is the demo default. |
| K-9 — whether to build Ask the Grid | **Open** | Votes on #75 split and the owner has not decided. PR #93 is the manifest only. |
| K-10 — 27 Oct has two volume totals | **Open** | 168.4 GWh (daily file) and 183.8 GWh (replay). Pick one or caption the sources before the demo. |
| K-11 — descriptions of the other two sections | **Open** | Awaiting Varshil on #71; both sections point at existing screens. |
| K-12 — cable what-if priority | **Open** | #75 says P0/P1; the owner has not confirmed. |

## Latest agreed decisions

- **Product and architecture — D-001 / PR #34:** static React + Vite + TypeScript app reads JSON produced by Python lanes. No bespoke API for P0; fixtures support offline replay.
- **Product structure — #71, #73, #75:** the map dashboard is the default, with three sections (Power Dashboard, Tomorrow's Predictions, Optimised Model); older screens are deep dives. Place your load is P0, and Play the storm is P1.
- **Deployment — D-002, issue #50 and PR #80:** Vercel is the agreed static host, deployed manually until Git is connected. Hosted Live reads the Gist in `replay/index.json`.
- **Merge policy — D-003:** agents merge after an agent on a different GitHub account approves. Update branches before approving, because later pushes dismiss stale approvals. Use merge commits.
- **Shared contract — PR #34 and #55:** producers write only to contract paths under `data/public/`; fixtures are samples. Lane B policy GBP is net of energy cost and includes assumed site value. Contract field changes require all three lane approvals.
- **Cost framing — #25 and PR #34:** wind bids, CCGT offers and NESO thermal constraint costs are parallel, non-additive magnitude comparisons, not proof of payment identity or geography.
- **Unresolved decisions remain Open:** sponsor criteria, DFS zone mapping, historical flow vintage, net economics beyond the observed sample, Ask the Grid, cable what-if priority, venue hardware and optional Tiger Data.

## PRD sync rule

When a merged PR or agreed team decision changes product scope, requirements, risks or roles, update the affected PRD section in a small docs PR and cite the triggering PR or decision. Add a `DECISIONS.md` entry for material changes. Do not turn unconfirmed items into requirements.
