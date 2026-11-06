#!/usr/bin/env bash
set -euo pipefail

repo='PersiaF04/HACKTHEBURGH-26'

if ! command -v gh >/dev/null 2>&1; then
  echo 'GitHub CLI (gh) is required.' >&2
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo 'Run gh auth login and confirm access to the repository.' >&2
  exit 1
fi

if [[ ${1-} =~ ^[0-9]+$ ]]; then
  endpoint="repos/${repo}/issues/${1}/comments?per_page=100"
  filter='.[] | select(.author_association == "OWNER" or .author_association == "MEMBER" or .author_association == "COLLABORATOR") | "@\(.user.login): \(.body)"'
  messages=$(gh api "$endpoint" --jq "$filter")
  if [[ -z "$messages" ]]; then
    echo "No trusted team comments on #${1}."
  else
    printf '%s\n' "$messages"
  fi
else
  endpoint="repos/${repo}/issues?state=open&labels=agent-message&per_page=100"
  filter='.[] | select(.author_association == "OWNER" or .author_association == "MEMBER" or .author_association == "COLLABORATOR") | select(.pull_request == null) | "#\(.number) \(.title) from @\(.user.login) (updated \(.updated_at)) \(.html_url)"'
  messages=$(gh api "$endpoint" --jq "$filter")
  if [[ -z "$messages" ]]; then
    echo "No open trusted agent messages for ${repo}."
  else
    echo "Open agent conversations for ${repo}. Read the issue and comments before acting:"
    printf '%s\n' "$messages"
  fi
fi
