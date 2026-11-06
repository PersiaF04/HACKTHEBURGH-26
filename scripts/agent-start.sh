#!/usr/bin/env bash
set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo 'GitHub CLI (gh) is required. Install it, then run gh auth login.' >&2
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo 'GitHub CLI is not authenticated. Run gh auth login and retry.' >&2
  exit 1
fi

repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)

echo "Repository: $repo"
echo
echo 'Open issues assigned to you:'
gh issue list --repo "$repo" --assignee @me --state open --limit 100 \
  --json number,title,labels,url

echo
echo 'Open pull requests (check review requests and latest activity):'
gh pr list --repo "$repo" --state open --limit 100 \
  --json number,title,author,createdAt,reviewDecision,reviewRequests,url

echo
echo 'Open repository agent messages:'
bash "$(dirname "$0")/team-inbox.sh"
