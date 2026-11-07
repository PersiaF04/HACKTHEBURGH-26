# Turn Up Scotland — shared status

**As of:** 2026-11-07 18:36 UTC

**Next refresh:** by 20:36 UTC, or sooner after any PR merges.

**Project:** [PRD](../../PRD.md) · [decision log](DECISIONS.md) · [work queue](BOARD.md)

This is a point-in-time coordination snapshot, not a second task tracker. GitHub Issues and PRs remain authoritative. Refresh it about every two hours and whenever a PR merges. Keep unconfirmed decisions marked **Open**.

## Time remaining

As of the timestamp above:

- **Code freeze:** 12h 38m, at 2026-11-08 07:00 UTC.
- **Internal submission target:** 16h 38m, at 2026-11-08 11:00 UTC.
- **Submission deadline:** 17h 38m, at 2026-11-08 12:00 UTC.

## Workstream status

| Lane | Owner and boundary | Issues and PRs | Current state |
| --- | --- | --- | --- |
| A — data and pipeline | Varshil / Varshil's Claude; `pipeline/`, outputs under `data/public/` | #28 / [PR #35](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/35) and #27 / [PR #49](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/49) merged; #73 open | Backfill, replay data and poller are on `main`. Issue #73 adds optional boundary overlays, a hosted live-data URL (pending Varshil's approval) and coordinates for four farms; no implementation PR is listed yet. |
| B — models, validation and decision | sanamorii / sanamorii's Claude; `models/`, outputs under `data/public/` | #29 / [PR #40](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/40), #30 / [PR #48](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/48), #54 / [PR #55](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/55), #50 / [PR #52](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/52), and #58 / [PR #60](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/60) merged; #74 and #76 open; [PR #78](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/78) open | The forecast, Copilot and CI are on `main`. #74 adds optional dashboard summaries; PR #78 exports optional sandbox inputs and reference scoring. Codex requested changes because load consumption was being presented as wind absorbed, and #76's per-day naive acceptance figure conflicts with the PR reconciliation. Contract changes still need all three lane-owner approvals. CI is green. |
| C — web, story and hardware | Persia / Persia's Claude; `web/` and `hardware/` | #31 / [PR #36](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/36); #32/#38/#39 and web part of #33 / [PR #47](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/47) merged; #69 / [PR #70](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/70) merged; #62 / [PR #68](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/68), #63 / [PR #67](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/67), #65 / [PR #72](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/72), and #71 open | New direction: one central map dashboard as default, with existing screens as deep dives. PR #68 still uses `in` for farm-state validation and needs an own-property check. PR #67 still needs the 7 Oct procurement / 8 Oct first-data-event distinction and a sync with `main`. PR #72 has no blocking Codex finding; its branch needs syncing before merge. #71 dashboard work is open. |
| Shared foundation and delivery | Persia / product owner and integrator; `PRD.md`, `contracts/`, deployment | #26 / [PR #34](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/34), model CI [PR #52](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/52), Vercel docs [PR #59](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/59), and README [PR #70](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/70) merged; #50 open | Manual Vercel deployment is live and the app, replay index and Iceberg JSON returned HTTP 200. Git-connected deploys remain pending. Issues #73/#75 introduce the map-dashboard and interactive-sandbox direction; current agreed scope is synced in PR #77. |
| Shared status | Persia's Codex; this file and small linked PRD updates | #37 open; PRs #45, #56, #57, #61, #64 and #66 merged; [PR #77](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/77) open | PR #77 refreshes after #70 and syncs PRD scope to #73/#75; next refresh is due after any PR merge or by 20:36 UTC. |

## Merged and blocked work

- **Merged to `main`:** PRs #34, #35, #36, #40, #45, #47, #48, #49, #52, #53, #55, #56, #57, #59, #60, #61, #64, #66 and #70. PR #47 also integrates #41–#44.
- **Open work:** PR #67 (submission materials) needs the DFS start/delivery wording fixed and a sync with `main`; PR #68 needs the own-property farm-state validation fix and a sync; PR #72 needs a sync; PR #78 needs the scoring semantics and stale #76 acceptance corrected, then approvals from all three lanes. Issue #71 is the map-dashboard UI; #73 is its boundary/live-data umbrella; #74 adds dashboard summaries; #75 defines the interactive sandbox and cable what-if. PR #77 carries this status/PRD refresh. Issue #50 has a manually verified Vercel deploy but no Git-connected deploy; live snapshots need an approved hosted source. #33 hardware stays optional.
- **Next status refresh:** refresh after the next PR merge, and by 20:36 UTC at the latest.

## Next three priorities

1. **Make the interaction accurate:** resolve PR #78's consumption-vs-wind-absorbed semantics and correct the 27 Oct reference value in issue #76 before lane C ports it.
2. **Integrate the default map (#71):** connect dashboard summaries (#74) and the sandbox only when optional contract files are available; preserve the existing deep dives and offline fallback.
3. **Complete the map evidence (#73/#75):** deliver boundary data only with honest counterfactual wording; hold optional live publishing and extra add-ons until the core interaction is stable; redeploy after merged app changes.

## Risk register status

Statuses reflect the PRD's K-1 to K-7 entries and current issue/PR evidence; they do not close a risk without evidence.

| Risk | Status | Current evidence / next check |
| --- | --- | --- |
| K-1 — sponsor criteria fit | **Open** | The 17:00 UTC G-Research workshop is recorded; no attendee or criteria result is confirmed in the handoffs reviewed. Capture the result on #26. |
| K-2 — DFS zones are Scottish | **Open** | Map-to-zone mapping is unconfirmed. Keep the explicit zone picker and do not infer a Scottish zone from a map pin. |
| K-3 — flow snapshot vintage / leakage | **Partly mitigated** | Archiver code is on `main`, but no valid historical as-of vintage is established. Keep backtests retrospective; use newly captured snapshots prospectively. |
| K-4 — calm weather during demo | **Mitigated** | Committed replay data and fixtures provide an offline demo path. |
| K-5 — reproduce DFS settlement before showing GBP | **Partly verified** | PR #48 reproduces accepted-cost arithmetic in the checked sample, but settled cost is about 39% of accepted cost. Keep the full-delivery assumption visible and show net sensitivity; do not present gross accepted cost as income. |
| K-6 — hardware parts available | **Open; P2** | Venue availability is unconfirmed. Keep the on-screen fallback and cut hardware first if needed. |
| K-7 — Tiger Data signup | **Open; optional** | No signup is confirmed. Keep this optional and out of the critical path unless a human decides otherwise. |

## Latest agreed decisions

- **Product and architecture — D-001 / PR #34:** static React + Vite + TypeScript app reads JSON produced by Python lanes. No bespoke API for P0; fixtures support offline replay.
- **Deployment — D-002 / PR #59 and issue #50:** Vercel is the agreed static host. The app plus committed replay index and Iceberg JSON returned HTTP 200 at [the deployed app](https://turn-up-scotland.vercel.app/) after a manual deploy. GitHub auto-deploy is not configured. Hosted committed replay days work; `replay/live.json` is absent. Live mode stays hidden unless an approved hosted URL is added to `replay/index.json`.
- **Shared contract — PR #34 and #55:** producers write only to contract paths under `data/public/`; fixtures are samples. Lane B policy GBP is net of energy cost and includes assumed site value. Contract field changes require all three lane approvals.
- **Cost framing — #25 and PR #34:** wind bids, CCGT offers and NESO thermal constraint costs are parallel, non-additive magnitude comparisons, not proof of payment identity or geography.
- **Review/merge operation — owner handoffs #126 and #139:** update branches before review; later pushes dismiss stale approvals. Use merge commits for stacked PRs. Auto-merge is enabled after required approvals and checks.
- **Unresolved decisions remain Open:** sponsor criteria, DFS zone mapping, historical flow vintage, net economics beyond the observed sample, hosted live-data publishing approval, cable what-if priority (P0/P1), venue hardware and optional Tiger Data. Persia's Codex recommends no additional AI/chat, multiplayer-store or autonomous-device feature before the #71/#75 core interaction is stable; the owner's decision remains open.

## PRD sync rule

When a merged PR or agreed team decision changes product scope, requirements, risks or roles, update the affected PRD section in a small docs PR and cite the triggering PR or decision. Add a `DECISIONS.md` entry for material changes. Do not turn unconfirmed items into requirements.
