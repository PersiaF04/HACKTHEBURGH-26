#!/usr/bin/env bash
# Fail if terms from the earlier product (dropped in #122) reappear in tracked files.
# Allow-list: PRD.md keeps one "replaces" note; this script holds the terms itself.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
pattern='turn[- ]?up|curtail|\bNESO\b|Elexon|\bDFS\b|SCOTEX|BOALF|wind farm'
if git grep -n -i -E "$pattern" -- . ':!PRD.md' ':!scripts/check-old-project.sh'; then
  echo "Old-project terms found above. Remove them or extend the allow-list in this script." >&2
  exit 1
fi
echo "No old-project terms found."
