# Product requirements document

> Adaptable hackathon template. The team has not chosen an idea yet. `TBD` means a decision is open, not an implied requirement. Remove prompts that do not apply and link evidence for decisions that do.

## Status and ownership

- **Status:** Idea discovery (Idea discovery / Proposed / Team-approved / Building / Frozen / Submitted)
- **Product name:** TBD
- **Product owner / final decision maker:** TBD
- **Contributors and agents:** See roster below
- **Event:** TBD
- **Last updated:** YYYY-MM-DD
- **Last agreed by / date:** TBD

## Team agreement gate

Before creating implementation issues, the team agrees on the items below. Planning or validation issues may be used to resolve open questions. Do not turn unresolved `TBD` items into implementation requirements.

- [ ] A specific user, their problem, and the evidence for it are stated.
- [ ] The proposed solution and one end-to-end demo journey are understandable.
- [ ] Must-have scope, non-goals, and what to cut first are explicit.
- [ ] Success can be checked through observable behavior or measured outcomes.
- [ ] Event rules, constraints, risks, and major assumptions have owners.
- [ ] Contributors agree on workstream boundaries and any shared interfaces.
- [ ] The product owner records approval above and sets the PRD status to `Team-approved`.

After agreement, create GitHub Issues for implementation. Issues own task scope, assignees, status, and branches; this PRD owns product outcomes and acceptance requirements. Link issues to requirement IDs rather than copying task tracking into this document.

## Event run sheet

Fill this from the official event brief. Include the source link and timezone; record UTC for timed deadlines. Do not guess missing event details.

| Item | Agreed value / source |
| --- | --- |
| Event name, venue, and dates | TBD |
| Official rules and judging criteria | TBD |
| Submission deadline and stated timezone | TBD |
| Submission deadline in UTC | TBD |
| Internal code freeze and timezone | TBD |
| Demo duration and presentation format | TBD |
| Submission method and required materials | TBD |
| Demo smoke command and expected result | TBD after stack selection |
| Fallback if a live service or network fails | TBD |

## 1. Product summary

In one or two sentences, say what the team is building, for whom, and what useful outcome it provides.

**Summary:** TBD

## 2. Problem, users, and evidence

Describe the situation where the problem occurs, how people handle it today, and what remains difficult. Separate evidence from assumptions; cite interviews, observations, data, or reliable sources.

| User / stakeholder | Context and need | Current alternative and gap | Evidence / source |
| --- | --- | --- | --- |
| Primary user: TBD | TBD | TBD | TBD |

**Who is out of scope for the first version?** TBD

## 3. Proposed experience

Describe the smallest useful journey from the user's starting point to the outcome. Use a short numbered flow or sketch; call out important error, empty, and recovery states.

1. TBD
2. TBD
3. TBD

## 4. Goals and success measures

Choose a small number of outcomes. Define how each is measured and where the evidence comes from. If a numeric target is not credible yet, state the observable pass condition instead of inventing a number.

| ID | Outcome | Measure / pass condition | Baseline | Target | Evidence source / owner |
| --- | --- | --- | --- | --- | --- |
| G-1 | TBD | TBD | TBD | TBD | TBD |

## 5. Scope and priorities

Keep the first version small enough to build and rehearse. P0 is the end-to-end demo spine; P1 improves it; P2 is optional. If time gets tight, cut P2 first, then P1, while keeping P0 usable.

### P0 — Must work in the demo

- TBD

### P1 — Include if time allows

- TBD

### P2 — Optional polish

- TBD

### Non-goals

List tempting work that the team explicitly will not build for this event.

- TBD

## 6. Requirements and acceptance

Write one outcome per requirement, rank it P0/P1/P2, and describe behavior a user or reviewer can observe. Include normal and relevant failure cases. Link implementation Issues in the final column; do not prescribe internal design unless it is a real constraint.

### R-1 [P0] Requirement title

- **User / reason:** TBD
- **Behavior:** TBD
- **Acceptance checks:**
  - Given [context], when [action], then [observable result].
  - Given [failure or edge case], when [action], then [safe, understandable result].
- **How verified:** TBD (demo step, manual check, automated check, or measurement)
- **Dependencies / owner:** TBD
- **Issues:** TBD

Copy this block for each requirement. Keep stable IDs such as `R-1` in linked Issues and PRs.

## 7. Demo and judging proof

Describe the demo as a short story with visible proof for each important claim. Map official judging criteria to something the judges can see or verify. Do not claim a metric the team has not measured.

| Demo step | User-visible behavior | Requirement / judging criterion | Proof or measure |
| --- | --- | --- | --- |
| 1. TBD | TBD | TBD | TBD |

## 8. Constraints and quality requirements

Record only constraints that matter to this idea. For each important limit, give its reason and how the team will verify it. Mark irrelevant areas `Not applicable` with a short reason.

| Area | Agreed constraint or target | Reason / source | How verified |
| --- | --- | --- | --- |
| Event rules / time / team skills | TBD | TBD | TBD |
| Platform / device / connectivity | TBD | TBD | TBD |
| Reliability / performance | TBD | TBD | TBD |
| Accessibility / usability | TBD | TBD | TBD |
| Privacy / security / data retention | TBD | TBD | TBD |
| Cost / usage limits | TBD | TBD | TBD |

Keep implementation KISS: choose the smallest durable solution that meets the agreed outcomes. Keep modules focused and interfaces small where the team is building in parallel; do not add abstractions or services speculatively.

## 9. Data and external services (if applicable)

For each data source or external service, record its purpose, owner, access or licensing constraints, expected cost, and failure fallback. Never put credentials in the repository.

| Source / service | Purpose and data used | Access / rights / cost | Failure fallback |
| --- | --- | --- | --- |
| TBD / Not applicable | TBD | TBD | TBD |

If the product uses AI, also state what inputs the model receives, what outputs it may produce, how quality is evaluated, and what the product does when the model is wrong, unavailable, or too slow.

## 10. Technical approach and shared boundaries

Record agreed choices only. Prefer an existing project convention or the simplest approach that meets the requirements. If contributors need to build in parallel, identify shared interfaces and who maintains their contract.

| Decision area | Agreed choice / status | Owner | Related decision or contract |
| --- | --- | --- | --- |
| Client / interface | TBD | TBD | TBD |
| Server / data | TBD | TBD | TBD |
| External services | TBD | TBD | TBD |
| Deployment / demo setup | TBD | TBD | TBD |
| Shared interface needed for parallel work | TBD / Not applicable | TBD | TBD |

Put decisions that materially change scope, architecture, dependencies, or interfaces in [`docs/coordination/DECISIONS.md`](docs/coordination/DECISIONS.md). Use the issue and PR for routine implementation details.

## 11. Assumptions, risks, and open questions

Track uncertainty with a next action and an owner. Resolve high-impact assumptions early with the cheapest useful check.

| Assumption, risk, or question | Impact if wrong | Next check / decision | Owner | Due / status |
| --- | --- | --- | --- | --- |
| Which idea and primary user? | Blocks product scope | Agree as a team and update this PRD | Product owner | TBD / Open |

## 12. CI, delivery, and recovery

- **Local setup / run command:** TBD after stack selection
- **CI checks required for a PR:** Markdown lint now; add relevant build and checks after stack selection
- **Demo smoke check:** See event run sheet; define one repeatable command and expected result
- **Deployment target / trigger:** TBD; only add deployment once the host and credentials are chosen
- **Secrets / environment setup:** Store credentials in approved secret storage, never in Git
- **Recovery / demo fallback:** State how to restore a working demo if deploy, network, or an external service fails

## 13. Contributors and workstreams

Assign one human as directly responsible for each workstream. Name the agent they use, issue IDs, and any file or interface boundaries that prevent overlap. Keep issue ownership and progress in GitHub.

| Contributor | Agent / tool | Workstream and boundaries | Issue IDs | Reviewer / integrator |
| --- | --- | --- | --- | --- |
| TBD | TBD | TBD | TBD | TBD |
| TBD | TBD | TBD | TBD | TBD |
| TBD | TBD | TBD | TBD | TBD |

Codex's default role is pull request review; Claude Code is the primary implementation agent. Other contributor-agent pairs can implement separately owned issues under the same workflow.

## 14. Milestones

Use dates with timezone when known. Keep milestones outcome-based; the exit check should be observable.

| Milestone | Target date / timezone | Exit check | Owner |
| --- | --- | --- | --- |
| Agree on problem and idea | TBD | Team agreement gate complete | TBD |
| Validate the riskiest assumption | TBD | Evidence recorded; decision made | TBD |
| Build the P0 demo spine | TBD | End-to-end P0 path works | TBD |
| Integrate and rehearse | TBD | Demo smoke passes; fallback rehearsed | TBD |
| Submit | See event run sheet | Required materials submitted | TBD |

## Change and evidence rules

- Keep this PRD focused on agreed product outcomes, constraints, and acceptance. GitHub Issues and PRs carry implementation tasks, owners, and status.
- Mark unresolved decisions `Open` or `Proposed`; do not let an agent turn them into requirements without the product owner's agreement.
- When scope changes, update the relevant requirement and linked Issue, and record material decisions in the decision log.
- Report what was actually verified and what was not exercised. Keep known limitations visible, especially if they affect the demo or a success claim.
- Add a short glossary only when the product uses terms contributors may interpret differently.
