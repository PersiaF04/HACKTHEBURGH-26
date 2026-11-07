# Turn Up Scotland — shared status

**As of:** 2026-11-07 17:22 UTC

**Next refresh:** by 19:22 UTC, or sooner after any PR merges.

**Project:** [PRD](../../PRD.md) · [decision log](DECISIONS.md) · [work queue](BOARD.md)

This is a point-in-time coordination snapshot, not a second task tracker. GitHub Issues and PRs remain authoritative. Refresh it about every two hours and whenever a PR merges. Keep unconfirmed decisions marked **Open**.

## Time remaining

As of the timestamp above:

- **Code freeze:** 13h 38m, at 2026-11-08 07:00 UTC.
- **Internal submission target:** 17h 38m, at 2026-11-08 11:00 UTC.
- **Submission deadline:** 18h 38m, at 2026-11-08 12:00 UTC.

## Workstream status

| Lane | Owner and boundary | Issues and PRs | Current state |
| --- | --- | --- | --- |
| A — data and pipeline | Varshil / Varshil's Claude; `pipeline/`, outputs under `data/public/` | #27 / [PR #49](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/49); #28 / [PR #35](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/35) | PR #35's Markdown, Web build and pipeline checks pass. Codex still requests BOALF failure recovery: don't mark a row seen before append succeeds, and recover an incomplete final JSONL line. PR #49 contains contract outputs and validation but is stacked on #35; its checks need to run after #35 lands. The archiver is running on Varshil's machine. |
| B — models, validation and decision | sanamorii / sanamorii's Claude; `models/`, outputs under `data/public/` | #29 / [PR #40](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/40); #30 / [PR #48](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/48); contract #54 / [PR #55](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/55); CI #50 / [PR #52](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/52) | Codex re-reviewed #40/#48: the requested target-mode, zone-ceiling and baseline-leakage fixes are present. Both branches are behind `main`; update before requesting approval. PR #55's net-GBP definition and fixture arithmetic are clean; Lane A approved, but it also needs updating before Lane C approval. #52's checks pass; Codex review comment is posted. |
| C — web, story and hardware | Persia / Persia's Claude; `web/` and `hardware/` | #31 / [PR #36](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/36); #32/#38/#39 and web part of #33 / [PR #47](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/47) | PR #47 merged at 17:19 UTC, along with PRs #41–#44 and #53. It includes mode-aware same-day replay wording, the headroom-rule metrics, equal six-block Operator scoring, net-GBP/sensitivity and safe caveat punctuation. Markdown lint and Web build passed on the reviewed head. Hardware remains optional/P2. |
| Shared foundation | Persia / Persia's Claude; `PRD.md` and `contracts/` | #26 / [PR #34](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/34) | PR #34 is on `main`. G-2 records the corrected retrospective baseline: 3,168 half-hours, persistence MAE 1,224 and Brier 0.471. Contract changes require approval from all three lane owners. |
| Shared status | Persia's Codex; this file and small linked PRD updates | #37 open; [PR #45](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/45) and [PR #56](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/56) merged; [PR #57](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/57) refreshes it | This snapshot follows the #47 merge as required by #37. #37 stays open for ongoing status maintenance. |

## Merged and blocked work

- **Merged to `main`:** PR #34 (PRD/contracts), #36 (web shell), #45 and #56 (status), and #47 (integrated demo; also #41–#44 and #53). No lane A or B implementation PR is merged yet.
- **Blocked or awaiting changes:** PR #35 needs BOALF append recovery. PRs #40/#48 contain fixes to prior Codex findings but are behind `main`; rebase before formal approval. PR #55 also needs its branch updated before the final lane C approval. PR #49 depends on #35.
- **Checks / review:** PR #40/#48 re-review comments and clean contract review on #55 are posted. PR #42 and #52 have Codex comments with no findings; #52 remains a Persia-authored PR and needs an eligible account approval.

## Next three priorities

1. **Finish the data spine:** fix #35 append recovery, then merge it and validate #49 on `main`; confirm snapshots are usable as-of evidence for K-3.
2. **Land the model and contract:** update #40/#48/#55 to current `main`, then complete approvals and merge #40 before #48; finish the three-lane contract approval on #55.
3. **Close the remaining delivery gates:** approve/merge #52 through an eligible account, rehearse all seven screens with real contract data and offline fallback, and keep optional hardware/Tiger Data outside the critical path.

## Risk register status

Statuses reflect the PRD's K-1 to K-7 entries and current issue/PR evidence; they do not close a risk without evidence.

| Risk | Status | Current evidence / next check |
| --- | --- | --- |
| K-1 — sponsor criteria fit | **Open** | The 17:00 UTC G-Research workshop is recorded; no attendee or criteria result is confirmed in the handoffs reviewed. Capture the result on #26. |
| K-2 — DFS zones are Scottish | **Open** | Zone-to-region mapping is unconfirmed. Keep zones identified by ID and do not claim a Scottish mapping. |
| K-3 — flow snapshot vintage / leakage | **Partly mitigated** | PR #35 archiver is running, but historical vintage is unknown and append recovery is under review. Keep forecast results retrospective until a valid as-of evaluation exists. |
| K-4 — calm weather during demo | **Mitigated** | Committed replay data and fixtures provide an offline demo path. |
| K-5 — reproduce DFS settlement before showing GBP | **Partly verified** | Lane B reports settlement arithmetic; accepted settlement did not cover estimated electricity cost in the observed sample. Show net sensitivity and assumptions, not gross settlement as income. |
| K-6 — hardware parts available | **Open; P2** | Venue availability is unconfirmed. Keep the on-screen fallback and cut hardware first if needed. |
| K-7 — Tiger Data signup | **Open; optional** | No signup is confirmed. Keep this optional and out of the critical path unless a human decides otherwise. |

## Latest agreed decisions

- **Product and architecture — D-001 / PR #34:** static React + Vite + TypeScript app reads JSON produced by Python lanes. No bespoke API for P0; fixtures support offline replay.
- **Shared contract — PR #34:** producers write only to contract paths under `data/public/`; fixtures are samples. Contract field changes require approval from all three lanes.
- **Cost framing — #25 and PR #34:** wind bids, CCGT offers and NESO thermal constraint costs are parallel, non-additive magnitude comparisons, not proof of payment identity or geography.
- **Review/merge operation — owner handoffs #126 and #139:** update branches before review; later pushes dismiss stale approvals. Use merge commits for stacked PRs. Auto-merge is enabled after required approvals and checks.
- **Unresolved decisions remain Open:** sponsor criteria, DFS zone mapping, historical flow vintage, net economics beyond the observed sample, venue hardware and optional Tiger Data integration.

## PRD sync rule

When a merged PR or agreed team decision changes product scope, requirements, risks or roles, update the affected PRD section in a small docs PR and cite the triggering PR or decision. Add a `DECISIONS.md` entry for material changes. Do not turn unconfirmed items into requirements.
