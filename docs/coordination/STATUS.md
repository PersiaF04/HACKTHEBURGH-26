# Turn Up Scotland — shared status

**As of:** 2026-11-07 17:38 UTC

**Next refresh:** by 19:38 UTC, or sooner after any PR merges.

**Project:** [PRD](../../PRD.md) · [decision log](DECISIONS.md) · [work queue](BOARD.md)

This is a point-in-time coordination snapshot, not a second task tracker. GitHub Issues and PRs remain authoritative. Refresh it about every two hours and whenever a PR merges. Keep unconfirmed decisions marked **Open**.

## Time remaining

As of the timestamp above:

- **Code freeze:** 13h 22m, at 2026-11-08 07:00 UTC.
- **Internal submission target:** 17h 22m, at 2026-11-08 11:00 UTC.
- **Submission deadline:** 18h 22m, at 2026-11-08 12:00 UTC.

## Workstream status

| Lane | Owner and boundary | Issues and PRs | Current state |
| --- | --- | --- | --- |
| A — data and pipeline | Varshil / Varshil's Claude; `pipeline/`, outputs under `data/public/` | #28 / [PR #35](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/35) merged; #27 / [PR #49](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/49) merged | Both lane A PRs are on `main`. PR #49 adds the contract backfill files, farm geocoding, replay days, validator and live poller. Markdown lint, Pipeline tests and Web build passed. |
| B — models, validation and decision | sanamorii / sanamorii's Claude; `models/`, outputs under `data/public/` | #29 / [PR #40](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/40) merged; #30 / [PR #48](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/48) merged; contract #54 / [PR #55](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/55) merged; CI #50 / [PR #52](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/52) merged | Forecast, Copilot and model-test CI are on `main`. PR #48 includes same-day replay labeling, zone-safe prices, training-only naive bids and net-GBP sensitivity. PR #52's Markdown, Model tests and Web build checks passed. |
| C — web, story and hardware | Persia / Persia's Claude; `web/` and `hardware/` | #31 / [PR #36](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/36); #32/#38/#39 and web part of #33 / [PR #47](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/47) merged; [#33](https://github.com/PersiaF04/HACKTHEBURGH-26/issues/33) remains open, optional P2 | All seven screens are on `main`; PR #47 includes the headroom baseline, mode-aware forecast label, equal six-block Operator scoring and Copilot net/sensitivity view. Web build passed. Hardware remains optional and can be cut. |
| Shared foundation and delivery | Persia / product owner and integrator; `PRD.md`, `contracts/`, deployment | #26 / [PR #34](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/34) merged; model CI [PR #52](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/52) merged; Vercel docs [PR #59](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/59) open | D-002 selects Vercel; #59 has green Markdown and Web checks and awaits review. The Vercel project connection and live URL are still pending. G-2 records the corrected retrospective baseline: 3,168 half-hours, persistence MAE 1,224 and Brier 0.471. |
| Shared status | Persia's Codex; this file and small linked PRD updates | #37 open; [PR #45](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/45), [PR #56](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/56), and [PR #57](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/57) merged | This refresh follows merges #49 and #52. Keep #37 open and refresh after the next PR merge or by the next refresh time. |

## Merged and blocked work

- **Merged to `main`:** PRs #34, #35, #36, #40, #45, #47, #48, #49, #52, #53, #55, #56 and #57. PR #47 also integrates #41–#44.
- **Open work:** PR #59 documents Vercel settings; its Markdown and Web checks are green and it awaits review. Issue #50 stays open until the project is connected and the deployed app and JSON paths are verified. Issue #33 remains optional P2 hardware work.
- **Next status refresh:** refresh after the next PR merge, and by 19:38 UTC at the latest.

## Next three priorities

1. **Finish Vercel delivery:** review and merge #59, connect the Vercel project when the owner provides access, and verify the app plus JSON data paths at the deployed URL.
2. **Rehearse the integrated demo:** smoke-test all seven screens with committed JSON and offline fallback; confirm the run sheet and sponsor criteria.
3. **Protect the deadline:** resolve open demo decisions and cut optional hardware/Tiger Data before they threaten the P0 path.

## Risk register status

Statuses reflect the PRD's K-1 to K-7 entries and current issue/PR evidence; they do not close a risk without evidence.

| Risk | Status | Current evidence / next check |
| --- | --- | --- |
| K-1 — sponsor criteria fit | **Open** | The 17:00 UTC G-Research workshop is recorded; no attendee or criteria result is confirmed in the handoffs reviewed. Capture the result on #26. |
| K-2 — DFS zones are Scottish | **Open** | Zone-to-region mapping is unconfirmed. Keep zones identified by ID and do not claim a Scottish mapping. |
| K-3 — flow snapshot vintage / leakage | **Partly mitigated** | PR #35 archiver is on `main`, but historical vintage is unknown. Keep forecast results retrospective until valid as-of evaluation exists. |
| K-4 — calm weather during demo | **Mitigated** | Committed replay data and fixtures provide an offline demo path. |
| K-5 — reproduce DFS settlement before showing GBP | **Partly verified** | PR #48 reproduces accepted-cost arithmetic in the checked sample, but settled cost is about 39% of accepted cost. Keep the full-delivery assumption visible and show net sensitivity; do not present gross accepted cost as income. |
| K-6 — hardware parts available | **Open; P2** | Venue availability is unconfirmed. Keep the on-screen fallback and cut hardware first if needed. |
| K-7 — Tiger Data signup | **Open; optional** | No signup is confirmed. Keep this optional and out of the critical path unless a human decides otherwise. |

## Latest agreed decisions

- **Product and architecture — D-001 / PR #34:** static React + Vite + TypeScript app reads JSON produced by Python lanes. No bespoke API for P0; fixtures support offline replay.
- **Deployment — D-002 / PR #59:** Vercel is the agreed static host. Root `web/`, build `npm run build`, output `dist`, and include files outside the root so `sync-data` can read the contract fixtures and generated data. Project connection and first live verification are pending.
- **Shared contract — PR #34 and #55:** producers write only to contract paths under `data/public/`; fixtures are samples. Lane B policy GBP is net of energy cost and includes assumed site value. Contract field changes require all three lane approvals.
- **Cost framing — #25 and PR #34:** wind bids, CCGT offers and NESO thermal constraint costs are parallel, non-additive magnitude comparisons, not proof of payment identity or geography.
- **Review/merge operation — owner handoffs #126 and #139:** update branches before review; later pushes dismiss stale approvals. Use merge commits for stacked PRs. Auto-merge is enabled after required approvals and checks.
- **Unresolved decisions remain Open:** sponsor criteria, DFS zone mapping, historical flow vintage, net economics beyond the observed sample, venue hardware and optional Tiger Data integration.

## PRD sync rule

When a merged PR or agreed team decision changes product scope, requirements, risks or roles, update the affected PRD section in a small docs PR and cite the triggering PR or decision. Add a `DECISIONS.md` entry for material changes. Do not turn unconfirmed items into requirements.
