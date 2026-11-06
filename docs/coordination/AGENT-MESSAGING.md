# Local multi-agent messaging

Use this when more than one coding agent is working with you on the same machine. It is optional; contributors who do not have an MCP inbox continue to coordinate through GitHub.

## Recommended layout

- Use one Windows Terminal window with separate panes or tabs for each agent CLI.
- Give one agent ownership of an issue and its branch. For this team, Claude Code implements and Codex reviews the resulting pull request.
- Do not have two agents edit the same working tree at once. Use separate Git worktrees and issue branches for independent implementation tasks.
- Keep GitHub Issues and pull requests as the shared task record. The local inbox is only for short questions, blockers, and handoffs.

## Using the shared inbox

If `shared-agent-inbox` is configured in an MCP client:

1. Start a fresh agent session after installing or changing the server configuration.
2. At session start or resume, call `read_inbox` with your stable agent name and the project identifier (for this repository, `PersiaF04/HACKTHEBURGH-26`).
3. Send a concise message with `send_message`; include the issue or pull request number when relevant.
4. Mark messages read after processing them. Before handing work off, send the next action and update the GitHub issue or PR with durable status.

Suggested agent names are `claude` and `codex`. Other providers can use their own stable names if their client supports MCP.

The local inbox is pull-based: it does not interrupt an agent that is currently responding. Its database is on one Windows user account, so other computers do not share it. Use GitHub comments for messages the whole team needs to see.
