# Turn Up Scotland — shared status

**As of:** 2026-11-07 16:41 UTC

**Next refresh:** by 18:41 UTC, or sooner after any PR merges.

**Source:** GitHub issues and pull requests, PR reviews/comments, and team-harmony handoffs.

**Project:** [PRD](../../PRD.md) · [decision log](DECISIONS.md) · [work queue](BOARD.md)

This is a point-in-time coordination snapshot, not a second task tracker. GitHub Issues and PRs remain authoritative. Refresh it about every two hours and whenever a PR merges. Keep unconfirmed decisions marked **Open**.

## Time remaining

As of the timestamp above:

- **Code freeze:** 14h 19m, at 2026-11-08 07:00 UTC.
- **Internal submission target:** 18h 19m, at 2026-11-08 11:00 UTC.
- **Submission deadline:** 19h 19m, at 2026-11-08 12:00 UTC.

## Workstream status

| Lane | Owner and boundary | Issues and PRs | Current state |
| --- | --- | --- | --- |
| A — data and pipeline | Varshil / Varshil's Claude; `pipeline/`, with generated contract outputs under `data/public/` | #27 open, no PR shown. #28 open; [PR #35](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/35) is open against the #26 branch. | PR #35 has a review comment requesting safe retry/recovery after an append failure and noting that the current PR has no CI checks because the workflow targets `main`. Backfill #27 remains open. |
| B — models, validation and decision | sanamorii / sanamorii's Claude; `models/`, with `forecast.json` and `copilot.json` under `data/public/` | #29 and #30 open; no PRs shown. | Work is assigned; no implementation PRs are listed yet. Preserve chronological validation and retrospective labels while flow snapshot vintage is unknown. |
| C — web, story and hardware | Persia / Persia's Claude; `web/` and `hardware/` | #31 open; [PR #36](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/36) open. #32 and #33 open; no PRs shown. | PR #36's Markdown lint and web build checks pass. It is stacked on #34, which is blocked. Codex sent the author two findings via team-harmony: remove the unsupported gas-payment/geography claim from the Iceberg narration, and calculate conventional medians for even-sized samples. #33 is P2/optional. |
| Project agreement and shared contract | Persia / Persia's Claude; shared `PRD.md` and `contracts/` | #26 open; [PR #34](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/34) open. | The author pushed a revision to describe the £193m wind turn-down and £1.78bn CCGT/NESO measures as parallel, non-additive comparisons. A reviewer re-review and a second lane owner's approval remain pending. The lane confirmation gate on #26 is not fully closed: sanamorii confirmed; Varshil's human confirmation is still requested. |
| Shared status | Persia's Codex; this file and small linked PRD updates | #37 open; [PR #45](https://github.com/PersiaF04/HACKTHEBURGH-26/pull/45) open against the #26 branch. | Refresh on the schedule above and after each merge. |

## Merged and blocked work

- **Merged for this product:** no implementation PRs among #34–#36 are merged as of this snapshot. The idea and product direction were agreed in #25; the PRD and contracts are still in PR #34.
- **Blocked:** PR #34 has the cost wording revision on its branch but still needs reviewer re-review and the required lane-owner approvals. PR #35 depends on the #26 contract branch and has review items to resolve. PR #36 depends on #34 and has the two author handoff findings above.
- **Not yet represented by a PR:** lane A backfill #27, lane B forecast #29 and Copilot #30, lane C follow-on screens #32, and optional hardware/demo work #33.

## Next three priorities

1. **Unblock the shared foundation:** re-review PR #34's revised cost wording, complete the lane confirmation and contract approvals, then merge #34 and rebase dependent work.
2. **Secure the data spine:** resolve PR #35's append-retry/recovery and CI-base review notes; deliver #27's backfill and start collecting point-in-time snapshots for #28.
3. **Finish the P0 model and demo path:** deliver #29/#30 and #32, then integrate and rehearse the offline flow. Keep #33's P2 hardware/game work behind the P0 screens.

## Risk register status

Statuses reflect the PRD's K-1 to K-7 entries and current issue/PR evidence; they do not close a risk without evidence.

| Risk | Status | Current evidence / next check |
| --- | --- | --- |
| K-1 — sponsor criteria fit | **Open** | PRD calls for a human to attend the 17:00 UTC G-Research workshop; the attendee is not yet named in the project records reviewed. Record the criteria on #26 after the workshop. |
| K-2 — DFS zones are Scottish | **Open** | Mapping is unconfirmed. Keep zones labelled by ID in the UI; do not claim they are Scottish. Lane B owns the check. |
| K-3 — flow snapshot vintage / leakage | **Open** | Historical vintage is unknown, so forecast results must stay labelled retrospective. PR #35 is in review; no evidence yet that the archiver has captured usable as-of snapshots. |
| K-4 — calm weather during demo | **Mitigated** | Replay mode and committed fixtures provide the demo path without live curtailment or network access. |
| K-5 — reproduce a DFS settlement before showing £ | **Open** | PRD requires one settlement to be reproduced before making the money claim. Keep gross settlement distinct from energy costs; lane B owns the check. |
| K-6 — hardware parts available | **Open; P2** | Persia is to check at the venue. Cut hardware first if parts or time are unavailable; on-screen fallback is in #33. |
| K-7 — Tiger Data signup | **Open; P1 optional** | No signup is recorded. A human signup is required only if the team keeps this optional integration. |

## Latest agreed decisions

- **Product and architecture — D-001 / PR #34:** build Turn Up Scotland as a static React + Vite + TypeScript app reading JSON produced by Python lanes. No bespoke API for P0; fixtures support offline replay.
- **Shared contract — PR #34:** producers write only to the contract paths under `data/public/`; fixtures are explicitly samples. Contract field changes require approval from all three lanes.
- **Cost framing — #25 and PR #34 review:** wind bids, CCGT offers, and NESO thermal constraint costs are magnitude comparisons, not additive totals or proof of payment identity/geography. Keep that caveat in all UI narration.
- **Unresolved items remain Open:** sponsor criteria, DFS zone mapping, flow-data vintage, settlement reproduction, venue hardware availability, and any optional Tiger Data signup.

## PRD sync rule

When a merged PR or agreed team decision changes product scope, requirements, risks, or roles, update the affected PRD section in a small docs PR and cite the triggering PR or decision. Add a `DECISIONS.md` entry for material changes. Do not turn unconfirmed items into requirements.
