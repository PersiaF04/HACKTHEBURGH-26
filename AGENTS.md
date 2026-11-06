# Contributor and agent guide

This is the shared working agreement for people and AI agents contributing here. Keep the process lightweight. The PRD holds product requirements; GitHub Issues hold work ownership and status.

## Before starting

1. Read this file, [`PRD.md`](PRD.md), and [`docs/coordination/BOARD.md`](docs/coordination/BOARD.md).
2. Pick or get assigned one open GitHub Issue. Confirm its goal, acceptance checks, and owner before editing. Each issue and branch has one directly responsible developer.
3. Coordinate overlapping files and interfaces with their current owners. Split work only when issues can be developed and reviewed independently.
4. If you have a local cross-agent MCP inbox configured, check it at session start, when resuming work, and before handoff. Follow [`docs/coordination/AGENT-MESSAGING.md`](docs/coordination/AGENT-MESSAGING.md); inbox messages do not replace GitHub issue or PR updates.

## Contributor and agent roles

- The human team owns the product idea, requirements, issue triage, priority, and merge decisions.
- Claude Code is the primary developer for issues assigned to it: it implements on an issue branch, runs relevant checks, and opens a pull request.
- Codex is the reviewer: it reviews the pull request against its issue, the PRD, and repository guidance, and reports actionable findings. Codex does not change the developer's branch during review.
- Codex may use subagents for focused, independent review passes when useful. Subagents return findings to Codex; they do not create overlapping implementation work.
- Other contributors may use their own agents as developers on separately owned issues. Every agent follows the same branch, issue, and pull request conventions. The PRD roster maps each human to their agent and workstream.

## Engineering principles

- **KISS:** choose the simplest solution that meets the agreed need and is reliable enough to maintain. Do not build speculative features, frameworks, abstractions, or configuration.
- Keep code modular with clear responsibilities and small interfaces. Add a module or abstraction when it makes current behavior easier to understand, change, or test—not just in case it may be useful later.
- Follow the conventions already in the repository. When there are none, use the simplest consistent approach and document only decisions that materially affect the team.
- Prefer focused changes. Avoid unrelated cleanup, unnecessary dependencies, and premature optimization.
- Keep durability proportional to the feature: handle realistic failures, validate important inputs, and preserve user data where relevant without designing for hypothetical scale.

## Issue, branch, and pull request workflow

- GitHub Issues are the canonical work queue. Do not copy tasks into a second local board. Keep issue owner, status, blockers, and acceptance checks current.
- Give each issue one primary type label: `feature`, `bug`, `fix`, `test`, `docs`, `chore`, `ci`, or `spike`. Apply the same type label to its pull request.
- Use one issue per focused change and one feature branch per issue. Name branches `feature/<issue>-<slug>`, `fix/<issue>-<slug>`, `docs/<issue>-<slug>`, or `chore/<issue>-<slug>`.
- Do not work directly on `main`. Open a pull request against `main`, link it with `Closes #<issue>`, and request Codex review. Merge after the human owner accepts the review and CI passes.
- Use Conventional Commit subjects, for example `feat(#12): add onboarding flow`, `fix(#18): handle empty response`, or `docs(#21): describe local setup`.
- Before parallel work, agree on file or interface boundaries and name an integrator. Avoid concurrent edits to the same files. Each contributor-agent pair should own separate issues and branches.
- Record decisions in [`docs/coordination/DECISIONS.md`](docs/coordination/DECISIONS.md) only when they affect product scope, architecture, user experience, dependencies, or shared interfaces. Routine implementation choices do not need a log entry.
- Keep product decisions in [`PRD.md`](PRD.md). Unknowns stay marked as open questions until the team decides; do not invent requirements.
- Raise blockers on the issue with the decision or help needed. Do not silently change another contributor's scope or overwrite their work.
- Before review, summarize changed files and behavior, relevant checks and results, remaining risks, and any follow-up needed in the pull request.

## Safety and completion

- Never commit credentials, secrets, or private data. Do not add dependencies or generated binaries without a clear need.
- Run checks relevant to the change when the project has them. Report what was run; do not claim unrun checks passed.
- An issue is done when its acceptance checks are met, relevant validation is reported, required docs are updated, and its pull request is reviewed and merged.

## Issue handoff template

```text
Issue / owner:
Goal and acceptance checks:
In scope / out of scope:
Files or interfaces:
Dependencies / blockers:
Branch / pull request:
```
