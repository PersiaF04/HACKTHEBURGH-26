# Turn Up Scotland — shared status

**As of:** 2026-11-07 17:08 UTC

**Next refresh:** by 19:08 UTC, or sooner after any PR merges.
**Project:** [PRD](../../PRD.md) · [decision log](DECISIONS.md) · [work queue](BOARD.md)

This is a point-in-time coordination snapshot, not a second task tracker. GitHub Issues and PRs remain authoritative. Refresh it about every two hours and whenever a PR merges. Keep unconfirmed decisions marked **Open**.

## Time remaining

As of the timestamp above:

- **Code freeze:** 13h 52m, at 2026-11-08 07:00 UTC.
- **Internal submission target:** 17h 52m, at 2026-11-08 11:00 UTC.
- **Submission deadline:** 18h 52m, at 2026-11-08 12:00 UTC.

## Workstream status

| Lane | Owner and boundary | Issues and PRs | Current state |
| --- | --- | --- | --- |
| A — data and pipeline | Varshil / Varshil's Claude; `pipeline/`, outputs under `data/public/` | #27 / [PR #49](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/49); #28 / [PR #35](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/35) | PR #35 has green Markdown, web-build and pipeline checks. Review still finds a BOALF append failure can mark unpersisted rows as seen and an incomplete final JSONL line is not recovered. PR #49 is stacked on #35; generated files and validation are present, but its checks have not run on this base. Backfill covers the contract outputs; archiver has been running on Varshil's machine. |
| B — models, validation and decision | sanamorii / sanamorii's Claude; `models/`, outputs under `data/public/` | #29 / [PR #40](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/40); #30 / [PR #48](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/48); [PR #52](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/52) | PR #40 has a Codex change request: do not present a same-day retrospective target as tomorrow's forecast. PR #48 has requests to keep accepted prices zone-specific, avoid scored-day leakage in the naive baseline, and clarify the net-GBP contract field. PR #52 adds model tests to CI and awaits review. |
| C — web, story and hardware | Persia / Persia's Claude; `web/` and `hardware/` | #31 / [PR #36](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/36) merged; #32/#38/#39 and web part of #33 / [PR #47](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/47); [PR #53](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/53) | PR #36 is on `main`. PR #47 integrates seven screens and has green Markdown/Web CI, but review findings remain: Tomorrow omits the headroom-rule baseline; the Operator game maps half-hour Copilot readiness to whole two-hour blocks, so comparisons use unequal budgets. PR #53 adds net-GBP/sensitivity presentation; it is not yet on `main`. Hardware remains optional/P2. |
| Shared foundation | Persia / Persia's Claude; `PRD.md` and `contracts/` | #26 / [PR #34](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/34) merged | PR #34 is on `main`. PRD G-2 now records the corrected retrospective baseline: 3,168 half-hours, persistence MAE 1,224 and Brier 0.471. Contract changes still require all three lane approvals. |
| Shared status | Persia's Codex; this file and small linked PRD updates | #37 open; [PR #45](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/45) merged to `main`; [PR #56](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/56) refreshes it | This refresh follows the #34, #36 and #45 merges and latest lane handoffs. #37 remains open because status maintenance is ongoing. |

## Merged and blocked work

- **Merged to `main`:** PR #34 (PRD/contracts), PR #36 (web shell), and PR #45 (initial shared status snapshot). No lane A or B implementation PR is merged yet; PR #47 is still open.
- **Blocked or awaiting changes:** PR #35 needs BOALF append recovery; PR #40 needs correct future-target/retrospective labeling; PR #48 needs zone-safe pricing, leakage-free baseline calibration and contract wording. PR #47 needs the headroom baseline and fair game comparison addressed before its integrated demo is ready.
- **Stacked / checks pending:** PR #49 is based on #35; PR #52 and #53 are open against `main`, with lane C integration changes still awaiting review and merge order.

## Next three priorities

1. **Finish the data spine:** fix #35 append recovery, review/merge it, then retarget and validate #49 against `main`; confirm the collected snapshots are usable as-of evidence for K-3.
2. **Make model claims valid:** fix #40's forecast horizon and #48's zone-specific acceptance, baseline leakage and net-value contract; review #52's CI coverage.
3. **Complete the demo safely:** resolve #47's headroom baseline and equal-budget game comparison; review #53's sensitivity/net-GBP claims and rehearse all screens with real contract data and offline fallback.

## Risk register status

Statuses reflect the PRD's K-1 to K-7 entries and current issue/PR evidence; they do not close a risk without evidence.

| Risk | Status | Current evidence / next check |
| --- | --- | --- |
| K-1 — sponsor criteria fit | **Open** | The project records the 17:00 UTC G-Research workshop; no attendee or recorded criteria are confirmed in the handoffs reviewed. Capture the result on #26. |
| K-2 — DFS zones are Scottish | **Open** | Zone-to-region mapping is unconfirmed. Keep zones identified by ID and do not claim a Scottish mapping. |
| K-3 — flow snapshot vintage / leakage | **Partly mitigated** | PR #35 archiver is running and CI passes, but the historical vintage is still unknown and append-recovery is under review. Keep forecast results retrospective until a valid as-of evaluation exists. |
| K-4 — calm weather during demo | **Mitigated** | Committed replay data and fixtures provide an offline demo path. |
| K-5 — reproduce DFS settlement before showing GBP | **Partly verified** | Lane B reports settlement arithmetic and electricity-cost comparison; accepted settlement does not cover estimated electricity cost in the observed sample. Present net sensitivity and assumptions, not gross settlement as income. |
| K-6 — hardware parts available | **Open; P2** | Venue availability is unconfirmed. Keep the on-screen fallback and cut hardware first if needed. |
| K-7 — Tiger Data signup | **Open; optional** | No signup is confirmed. Keep this optional and out of the critical path unless a human decides otherwise. |

## Latest agreed decisions

- **Product and architecture — D-001 / PR #34:** static React + Vite + TypeScript app reads JSON produced by Python lanes. No bespoke API for P0; fixtures support offline replay.
- **Shared contract — PR #34:** producers write only to contract paths under `data/public/`; fixtures are samples. Contract field changes require approval from all three lanes.
- **Cost framing — #25 and PR #34:** wind bids, CCGT offers and NESO thermal constraint costs are parallel, non-additive magnitude comparisons, not proof of payment identity or geography.
- **Review/merge operation — owner handoff #126 and #139:** agents merge when required approval and CI are green; use merge commits for stacked PRs. Update a branch before requesting approval because later pushes dismiss stale reviews. Auto-merge is enabled.
- **Unresolved decisions remain Open:** sponsor criteria, DFS zone mapping, historical flow vintage, net economics beyond the observed sample, venue hardware and optional Tiger Data integration.

## PRD sync rule

When a merged PR or agreed team decision changes product scope, requirements, risks or roles, update the affected PRD section in a small docs PR and cite the triggering PR or decision. Add a `DECISIONS.md` entry for material changes. Do not turn unconfirmed items into requirements.
