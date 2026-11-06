# Issue workflow

GitHub Issues are the team's single work queue. Do not maintain a duplicate task list here. Product requirements and the contributor-agent roster belong in [`../../PRD.md`](../../PRD.md).

## Pick up an issue

- Choose an unassigned issue, or have its human owner assign it.
- Confirm scope, acceptance checks, and affected interfaces in the issue before coding.
- Use one branch per issue: `feature/<issue>-<slug>`, `fix/<issue>-<slug>`, `docs/<issue>-<slug>`, or `chore/<issue>-<slug>`.
- Open one pull request per issue and include `Closes #<issue>` in its description.
- Keep the issue updated with progress, blockers, and the pull request link.

## Collaboration and review

- Give each issue one directly responsible developer. Other contributors can help, but agree on ownership and file boundaries first.
- Claude Code is the primary developer; Codex reviews pull requests and may use subagents for focused review. Other contributors can use their own agents on separate issues.
- Merge after CI passes, Codex review findings are resolved, and the human issue owner approves.
- Record only decisions that materially affect scope, architecture, user experience, dependencies, or shared interfaces in [`DECISIONS.md`](DECISIONS.md).

## Pull request handoff checklist

- [ ] Acceptance checks met
- [ ] Changed behavior and files summarized
- [ ] Relevant checks and results reported
- [ ] Risks or follow-up work noted
- [ ] Linked issue updated and pull request has `Closes #<issue>`
- [ ] CI passes and review is complete
