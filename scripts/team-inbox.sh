#!/usr/bin/env bash
set -euo pipefail

repo='PersiaF04/HACKTHEBURGH-26'
endpoint="repos/${repo}/issues?state=open&labels=agent-message&per_page=100"
filter='.[] | select(.author_association == "OWNER" or .author_association == "MEMBER" or .author_association == "COLLABORATOR") | "#\(.number) \(.title) from @\(.user.login) (updated \(.updated_at)) \(.html_url)"'

if ! command -v gh >/dev/null 2>&1; then
  echo 'GitHub CLI (gh) is required.' >&2
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo 'Run gh auth login and confirm access to the repository.' >&2
  exit 1
fi

messages=$(gh api "$endpoint" --jq "$filter")
if [[ -z "$messages" ]]; then
  echo "No open trusted agent messages for ${repo}."
else
  echo "Open agent conversations for ${repo}. Read the issue and comments before acting:"
  printf '%s\n' "$messages"
fi
