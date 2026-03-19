#!/bin/bash

# Doc Check Stop Hook
# On session stop, checks if documentation needs updating based on changes made.
# Blocks stop and sends a prompt to the main model to review and update docs.

set -euo pipefail

HOOK_INPUT=$(cat)

# State file to prevent infinite loops: only trigger once per session
STATE_FILE=".claude/doc-check-done.local"
if [[ -f "$STATE_FILE" ]]; then
  exit 0
fi

# Check if we're in a git repo
if ! git rev-parse --is-inside-work-tree &>/dev/null; then
  exit 0
fi

# Check if there are any uncommitted changes or recent commits in this session
# If working tree is completely clean with no recent activity, skip
CHANGES=$(git diff --name-only HEAD 2>/dev/null || true)
STAGED=$(git diff --cached --name-only 2>/dev/null || true)
UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null || true)

# Combine all changed files
ALL_CHANGES=$(printf "%s\n%s\n%s" "$CHANGES" "$STAGED" "$UNTRACKED" | sort -u | grep -v '^$' || true)

if [[ -z "$ALL_CHANGES" ]]; then
  # No changes at all, skip doc check
  exit 0
fi

# Filter: if ONLY doc files changed (no code changes), skip
CODE_CHANGES=$(echo "$ALL_CHANGES" | grep -v -E '\.(md|txt|rst)$' | grep -v -i 'readme' | grep -v -i 'changelog' | grep -v -i 'license' || true)
if [[ -z "$CODE_CHANGES" ]]; then
  exit 0
fi

# Mark as done so we don't loop
mkdir -p .claude
touch "$STATE_FILE"

# Build the prompt
PROMPT="Session is ending. Please check if any documentation needs updating based on the changes made in this session.

Changed files:
$ALL_CHANGES

Check and update if necessary:
1. README.md / README — if features, usage, or project structure changed
2. CLAUDE.md — if project structure, skills, conventions, or setup instructions changed
3. Any other relevant docs (API docs, CHANGELOG, etc.)

Rules:
- Only update docs that genuinely need changes. Do NOT touch docs that are already accurate.
- Keep updates minimal and precise — match the existing style.
- If no docs need updating, just say so briefly and stop."

jq -n \
  --arg prompt "$PROMPT" \
  '{
    "decision": "block",
    "reason": $prompt
  }'
