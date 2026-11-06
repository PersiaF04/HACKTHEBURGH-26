# Agent session setup for contributors

This setup helps a contributor's agent find its current work when a session starts or resumes. It uses GitHub as the shared queue and needs no always-running service.

## One-time setup

From the repository folder, install GitHub CLI if needed, authenticate, and confirm repository access:

~~~powershell
gh auth login
gh auth status
gh repo view PersiaF04/HACKTHEBURGH-26
~~~

On macOS or Linux, use the same commands in a shell. Accept the repository invitation first if gh repo view reports an access error.

## Start or resume an agent session

Run the session-start script whenever you open or resume an agent session:

~~~powershell
./scripts/agent-start.ps1
~~~

~~~bash
bash scripts/agent-start.sh
~~~

It prints issues assigned to the authenticated GitHub user, the repository's open PRs, and the open trusted agent-message issues. The agent should inspect relevant issue/PR details, check AGENTS.md, TEAMWORK.md, PRD.md, and docs/coordination/BOARD.md, and act only on work addressed or assigned to that contributor. If an agent is only reviewing, it should not edit the developer's branch.

## Give the agent this standing instruction

Add this to the agent's project instructions or paste it when starting the session:

> At the start of every session and whenever you resume, run scripts/agent-start.ps1 on Windows or bash scripts/agent-start.sh elsewhere. Check issues assigned to my GitHub account, open PRs where my review is requested, and the repository agent inbox. Follow AGENTS.md and TEAMWORK.md. Work only on an issue addressed to me or assigned to me; keep status and blockers on GitHub. Do not wait for me to restate work already assigned to me. If there is no work for me, say so briefly.

## Notifications and automatic pickup

The repository inbox is backed by GitHub Issues. Agents read it when they take a turn; it does not wake an idle CLI session. Turn on GitHub notifications for issue assignments, mentions, and review requests. When a notification arrives, resume the agent session and have it run the session-start script.

For actual unattended pickup, the agent provider must support a persistent event listener or a hosted webhook-to-runner that can wake a machine and start a task. A local MCP channel can push messages to an already-running, channel-enabled session on that same machine, but it does not deliver to another contributor's computer. Do not add a continuous polling loop unless the team deliberately chooses to run and maintain one.

Keep GitHub Issues and PRs as the durable queue and source of truth. The local inbox and terminal panes are conveniences, not task storage.
