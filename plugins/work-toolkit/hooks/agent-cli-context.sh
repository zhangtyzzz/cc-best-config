#!/usr/bin/env bash
# Reports which supported external CLI agents (codex, opencode, qodercli) are
# installed. Designed to be invoked via `skill-prerun.sh agent-task ...` so it
# only runs when the agent-task skill is being launched.
#
# Outputs the status as PreToolUse JSON `additionalContext` so the model sees
# it before bridge.js is invoked.
set -u

agents=(codex opencode qodercli)
available=()
missing=()

for agent in "${agents[@]}"; do
  if command -v "$agent" >/dev/null 2>&1; then
    available+=("$agent")
  else
    missing+=("$agent")
  fi
done

join_by() {
  local IFS=", "
  echo "$*"
}

available_text="none"
missing_text="none"
[ ${#available[@]} -gt 0 ] && available_text=$(join_by "${available[@]}")
[ ${#missing[@]}   -gt 0 ] && missing_text=$(join_by "${missing[@]}")

context_msg="Available external CLI agents: ${available_text}. Missing: ${missing_text}."

if command -v jq >/dev/null 2>&1; then
  jq -nc --arg ctx "$context_msg" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", additionalContext: $ctx}}'
else
  printf '%s\n' "$context_msg"
fi
