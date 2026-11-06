# Contributor quickstart

This page is the short path for each person and their coding agent. GitHub Issues and pull requests are the shared record for the whole team; the repository inbox below works across contributors' machines. The local agent inbox is an optional same-computer convenience.

## Before you start

1. Accept the repository invitation. Install Git and GitHub CLI, then run `gh auth login` and `gh auth status`.
2. Clone the repository and open the project folder in your editor or agent terminal.
3. Read [`AGENTS.md`](AGENTS.md), [`PRD.md`](PRD.md), and [`docs/coordination/BOARD.md`](docs/coordination/BOARD.md). Check [`docs/coordination/AGENT-MESSAGING.md`](docs/coordination/AGENT-MESSAGING.md) only if you use the local inbox.

## Pick up and deliver work

1. During idea discovery, work only on planning tasks the team has agreed. Do not invent product requirements or start speculative implementation.
2. Once implementation issues exist, take or get assigned one issue. Confirm its goal, acceptance checks, owner, affected files, and dependencies with the team.
3. Use one issue branch and one primary developer. Coordinate shared files and interfaces before parallel work; use separate worktrees if two agents need separate working copies.
4. Make focused changes, run the checks listed in the issue or repository, and report exactly what passed or was not run.
5. Open a pull request against `main`, link the issue with `Closes #<number>`, use the PR template, and request review. Merge only after CI passes, review findings are resolved, and the human issue owner approves.
6. Keep status, blockers, and decisions that affect the whole team on the GitHub issue or pull request. Do not put team-wide decisions only in a local agent inbox.

## Message another contributor or agent

Use **New issue → Agent message** for a question, blocker, decision, or handoff that needs its own conversation. Include your human GitHub handle and agent name, the recipient's human handle and agent name (or `all`), and the related work issue or PR. Mention each human recipient with `@handle` so GitHub can notify them. Reply in the message issue and close it when resolved; put implementation requests on their own work issue.

Agents check the repository inbox when they start or resume work and before handoff:

```powershell
./scripts/team-inbox.ps1
```

To display trusted replies on a conversation, pass its issue number: `./scripts/team-inbox.ps1 -Issue 42`.

```bash
bash scripts/team-inbox.sh
```

To display trusted replies on a conversation, pass its issue number: `bash scripts/team-inbox.sh 42`.

The inbox lists open messages from repository members or collaborators. Agents read the issue and comments, then act only when the recipient matches their human/agent identity or is `all`. This is a GitHub polling inbox, not a live push channel.

## Starting an agent

Use this prompt with Claude Code, Codex, or another coding agent:

> Read `AGENTS.md`, `TEAMWORK.md`, and `PRD.md`. Check the GitHub issue assigned to me before editing. Work only on that issue, confirm the acceptance checks and branch with me, and keep progress and blockers on the issue or pull request. Do not invent product requirements.

The local Codex/Claude inbox is an optional convenience for short handoffs on one machine. Contributors on other computers use the repository inbox and GitHub issues/PRs.
