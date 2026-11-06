# Product requirements document

> Blank template: the team has not chosen a hackathon idea yet. Replace prompts with agreed decisions; do not treat placeholders as requirements.

## Status and ownership

- **Status:** Idea discovery
- **Product name:** TBD
- **Product owner / decision maker:** TBD
- **Contributors and agents:** See roster below
- **Event / deadline:** TBD
- **Last updated:** YYYY-MM-DD

## 1. Summary

What are we building, for whom, and what value will it provide? Fill this in after the team selects an idea.

## Contributor and agent roster

Add or remove rows to match the team. Give each workstream a human owner and note the agent/tool they use. Each workstream should map to separately owned GitHub Issues and feature branches. Keep cross-cutting decisions and interfaces agreed in the decision log.

| Contributor | Agent / tool | Responsibility or workstream | Issue IDs | Notes |
|---|---|---|---|---|
| TBD | TBD | TBD | TBD | |
| TBD | TBD | TBD | TBD | |
| TBD | TBD | TBD | TBD | |

Codex's default role is pull request review; Claude Code is the primary implementation agent. Other contributor-agent pairs can implement separate issues under the same workflow.

## 2. Problem and users

- What problem are we addressing, and in what context?
- Who experiences it? Who is the primary user?
- What evidence suggests this problem matters?
- What do people do today, and where does that fall short?

## 3. Goals and non-goals

### Goals

- TBD

### Non-goals

- TBD

## 4. Proposed experience

Describe the simplest useful end-to-end experience. Add a sketch or short flow if it helps.

## 5. Scope and priority

### Must have

- TBD

### Nice to have

- TBD

### Out of scope

- TBD

## 6. User stories and acceptance checks

For each important capability:

**As a** [user], **I want** [capability], **so that** [outcome].

- Given [context], when [action], then [observable result].
- Given [context], when [action], then [observable result].

## 7. Demo and success

- What should the demo show from start to finish?
- What would make the demo successful for users or judges?
- What can the team realistically measure or observe?

## 8. Constraints and quality

- Time, team size, skills, event rules, and hardware: TBD
- Platform, APIs, data, privacy, security, and accessibility needs: TBD
- What must work reliably for the demo? TBD
- What assumptions need validation? TBD
- Keep implementation KISS: deliver the smallest durable solution that meets agreed needs, with clear module responsibilities and no speculative features.

## 9. Technical approach

Record only choices the team has agreed. Keep the implementation as simple as possible while meeting the product needs; use focused modules with clear responsibilities.

- Client / interface: TBD
- Server / data: TBD
- External services: TBD
- Deployment / demo setup: TBD
- Relevant project conventions and checks: TBD

## 10. CI/CD and delivery

- CI platform: GitHub Actions (initial Markdown lint workflow)
- Build and test commands: TBD after the application stack is selected
- Required checks before merge: CI passes, Codex review is complete, and the human issue owner approves
- Deployment target and trigger: TBD after the app type and hosting target are selected
- Secrets and environment setup: TBD; store deploy credentials in GitHub Actions secrets, never in the repository
- Rollback or demo fallback: TBD

## 11. Risks and open questions

| Question or risk | Owner | Next step | Status |
|---|---|---|---|
| Which idea and primary user will we choose? | TBD | Agree as a team and update this PRD | Open |

## 12. Milestones

| Milestone | Target | Exit check | Owner |
|---|---|---|---|
| Choose idea and user | TBD | Problem, user, and value statement agreed | TBD |
| Define MVP and demo | TBD | Must-haves and acceptance checks agreed | TBD |
| Build and integrate | TBD | One end-to-end flow works | TBD |
| Rehearse demo | TBD | Demo rehearsed; fallback understood | TBD |
