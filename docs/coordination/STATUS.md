# Turn Up Scotland — shared status

**As of:** 2026-11-07 17:27 UTC

**Next refresh:** by 19:27 UTC, or sooner after any PR merges.

**Project:** [PRD](../../PRD.md) · [decision log](DECISIONS.md) · [work queue](BOARD.md)

This is a point-in-time coordination snapshot, not a second task tracker. GitHub Issues and PRs remain authoritative. Refresh it about every two hours and whenever a PR merges. Keep unconfirmed decisions marked **Open**.

## Time remaining

As of the timestamp above:

- **Code freeze:** 13h 33m, at 2026-11-08 07:00 UTC.
- **Internal submission target:** 17h 33m, at 2026-11-08 11:00 UTC.
- **Submission deadline:** 18h 33m, at 2026-11-08 12:00 UTC.

## Workstream status

| Lane | Owner and boundary | Issues and PRs | Current state |
| --- | --- | --- | --- |
| A — data and pipeline | Varshil / Varshil's Claude; `pipeline/`, outputs under `data/public/` | #28 / [PR #35](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/35) merged; #27 / [PR #49](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/49) open | PR #35 merged after the BOALF retry/tail-recovery fixes; Markdown, Pipeline tests and Web build passed. PR #49 contains contract backfill data and its checks are pending after the stack was retargeted to `main`. |
| B — models, validation and decision | sanamorii / sanamorii's Claude; `models/`, outputs under `data/public/` | #29 / [PR #40](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/40) merged; #30 / [PR #48](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/48) merged; contract #54 / [PR #55](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/55) merged; CI #50 / [PR #52](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/52) open | Forecast and Copilot changes are on `main`, including same-day replay labeling, zone-safe prices, training-only naive bids and net-GBP contract semantics. PR #52 has green Markdown/model/Web checks and an approval, but is behind the latest `main` merges and needs its branch updated before auto-merge. |
| C — web, story and hardware | Persia / Persia's Claude; `web/` and `hardware/` | #31 / [PR #36](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/36); #32/#38/#39 and web part of #33 / [PR #47](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/47) merged | All seven screens are on `main`; PR #47 includes the headroom baseline, mode-aware forecast label, equal six-block Operator scoring and Copilot net/sensitivity view. Web build passed. Hardware remains optional/P2. |
| Shared foundation | Persia / Persia's Claude; `PRD.md` and `contracts/` | #26 / [PR #34](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/34) merged | PR #34 is on `main`. G-2 records the corrected retrospective baseline: 3,168 half-hours, persistence MAE 1,224 and Brier 0.471. PR #55's net-GBP contract update is also merged. |
| Shared status | Persia's Codex; this file and small linked PRD updates | #37 open; [PR #45](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/45) and [PR #56](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/56) merged; [PR #57](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/57) refreshes it | PR #57's branch now captures merges #35, #40, #48 and #55 as well as the earlier snapshot. #37 remains open for ongoing maintenance. |

## Merged and blocked work

- **Merged to `main`:** PRs #34, #35, #36, #40, #45, #47, #48, #55 and #56. PR #47 also integrates #41–#44 and #53.
- **Open implementation work:** PR #49 (lane A backfill) and PR #52 (model-test CI). Both have green reported checks, but need their branches brought current with `main` and final eligible approvals.
- **Next status refresh:** PR #57 needs this updated snapshot reviewed and merged; refresh again after its merge or the next project merge.

## Next three priorities

1. **Finish lane A:** confirm PR #49 targets current `main`, checks pass, and backfill data renders through the real contract path.
2. **Finish CI delivery:** update PR #52 from current `main`, obtain eligible approval and let auto-merge run.
3. **Rehearse and submit:** smoke-test all seven screens with real JSON and offline fallback, confirm sponsor criteria, and keep optional hardware/Tiger Data outside the critical path.

## Risk register status

Statuses reflect the PRD's K-1 to K-7 entries and current issue/PR evidence; they do not close a risk without evidence.

| Risk | Status | Current evidence / next check |
| --- | --- | --- |
| K-1 — sponsor criteria fit | **Open** | The 17:00 UTC G-Research workshop is recorded; no attendee or criteria result is confirmed in the handoffs reviewed. Capture the result on #26. |
| K-2 — DFS zones are Scottish | **Open** | Zone-to-region mapping is unconfirmed. Keep zones identified by ID and do not claim a Scottish mapping. |
| K-3 — flow snapshot vintage / leakage | **Partly mitigated** | PR #35 archiver is on `main`, but historical vintage is unknown. Keep forecast results retrospective until valid as-of evaluation exists. |
| K-4 — calm weather during demo | **Mitigated** | Committed replay data and fixtures provide an offline demo path. |
| K-5 — reproduce DFS settlement before showing GBP | **Partly verified** | Lane B reports settlement arithmetic; accepted settlement did not cover estimated electricity cost in the observed sample. Show net sensitivity and assumptions, not gross settlement as income. |
| K-6 — hardware parts available | **Open; P2** | Venue availability is unconfirmed. Keep the on-screen fallback and cut hardware first if needed. |
| K-7 — Tiger Data signup | **Open; optional** | No signup is confirmed. Keep this optional and out of the critical path unless a human decides otherwise. |

## Latest agreed decisions

- **Product and architecture — D-001 / PR #34:** static React + Vite + TypeScript app reads JSON produced by Python lanes. No bespoke API for P0; fixtures support offline replay.
- **Shared contract — PR #34 and #55:** producers write only to contract paths under `data/public/`; fixtures are samples. Lane B policy GBP is net of energy cost and includes assumed site value. Contract field changes require all three lane approvals.
- **Cost framing — #25 and PR #34:** wind bids, CCGT offers and NESO thermal constraint costs are parallel, non-additive magnitude comparisons, not proof of payment identity or geography.
- **Review/merge operation — owner handoffs #126 and #139:** update branches before review; later pushes dismiss stale approvals. Use merge commits for stacked PRs. Auto-merge is enabled after required approvals and checks.
- **Unresolved decisions remain Open:** sponsor criteria, DFS zone mapping, historical flow vintage, net economics beyond the observed sample, venue hardware and optional Tiger Data integration.

## PRD sync rule

When a merged PR or agreed team decision changes product scope, requirements, risks or roles, update the affected PRD section in a small docs PR and cite the triggering PR or decision. Add a `DECISIONS.md` entry for material changes. Do not turn unconfirmed items into requirements.
