#!/bin/bash

# Stop Guard Hook (Stop)
# Combined stop hook that checks BOTH:
#   1. Task completion — are there obvious incomplete items?
#   2. Documentation — do docs need updating based on code changes?
# Only triggers once per session to prevent infinite loops.

set -euo pipefail

HOOK_INPUT=$(cat)

# --- Loop prevention: only trigger once per session ---
STATE_FILE=".claude/stop-guard-done.local"
if [[ -f "$STATE_FILE" ]]; then
  exit 0
fi

# --- Check if we're in a git repo ---
if ! git rev-parse --is-inside-work-tree &>/dev/null; then
  exit 0
fi

# --- Gather changes ---
CHANGES=$(git diff --name-only HEAD 2>/dev/null || true)
STAGED=$(git diff --cached --name-only 2>/dev/null || true)
UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null || true)
ALL_CHANGES=$(printf "%s\n%s\n%s" "$CHANGES" "$STAGED" "$UNTRACKED" | sort -u | grep -v '^$' || true)

if [[ -z "$ALL_CHANGES" ]]; then
  # No changes at all, nothing to check
  exit 0
fi

# --- Guard against massive file lists (e.g. freshly initialized repos) ---
FILE_COUNT=$(echo "$ALL_CHANGES" | wc -l | tr -d ' ')
MAX_FILES=20
if (( FILE_COUNT > MAX_FILES )); then
  ALL_CHANGES=$(echo "$ALL_CHANGES" | head -n "$MAX_FILES")
  ALL_CHANGES="$ALL_CHANGES
... and $((FILE_COUNT - MAX_FILES)) more files (truncated to avoid context overflow)"
fi

# Identify code vs doc changes
CODE_CHANGES=$(echo "$ALL_CHANGES" | grep -v -E '\.(md|txt|rst)$' | grep -v -i 'readme' | grep -v -i 'changelog' | grep -v -i 'license' || true)

# --- Mark as done so we don't loop ---
mkdir -p .claude
touch "$STATE_FILE"

# --- Build the combined prompt ---
PROMPT="Session is ending. Before you stop, please do a final check on the work done this session.

Changed files:
$ALL_CHANGES

## Part 1: Task Completion Check
Review the changes and verify:
- All requested changes are fully implemented (no partial work or TODOs left behind)
- No obvious syntax errors or broken imports in modified files
- If tests exist for modified code, they should pass

If anything is clearly incomplete, fix it now.

## Part 2: Documentation Check"

# Only ask for doc check if there were code changes (not just doc edits)
if [[ -n "$CODE_CHANGES" ]]; then
  PROMPT="$PROMPT
Check if any documentation needs updating based on the code changes:
1. README.md — if features, usage, or project structure changed
2. CLAUDE.md — if project structure, skills, conventions, or setup instructions changed
3. Any other relevant docs (API docs, CHANGELOG, etc.)

Rules:
- Only update docs that genuinely need changes. Do NOT touch docs that are already accurate.
- Keep updates minimal and precise — match the existing style."
else
  PROMPT="$PROMPT
Only documentation files changed — skip doc update check."
fi

PROMPT="$PROMPT

If everything looks good, say so briefly and stop."

jq -n \
  --arg prompt "$PROMPT" \
  '{
    "decision": "block",
    "reason": $prompt
  }'
