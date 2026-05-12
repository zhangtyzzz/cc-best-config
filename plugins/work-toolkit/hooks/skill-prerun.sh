#!/usr/bin/env bash
# skill-prerun.sh — generic dispatcher for skill-scoped PreToolUse hooks.
#
# Frontmatter hooks defined inside SKILL.md silently do not fire on current
# Claude Code (upstream issue #39468). To get the same skill-scoped behavior,
# we register a single global `PreToolUse` hook with `matcher: "Skill"` and
# dispatch through this script: it inspects `tool_input.skill` from the JSON
# arriving on stdin, only invokes the real hook command when the skill name
# ends with the expected suffix, and exits silently otherwise.
#
# Usage (inside hooks/hooks.json):
#   ${CLAUDE_PLUGIN_ROOT}/hooks/skill-prerun.sh <skill-suffix> <command...>
#
# Examples:
#   ${CLAUDE_PLUGIN_ROOT}/hooks/skill-prerun.sh agent-task \
#     ${CLAUDE_PLUGIN_ROOT}/hooks/agent-cli-context.sh
#
#   ${CLAUDE_PLUGIN_ROOT}/hooks/skill-prerun.sh hf-papers \
#     python3 ${CLAUDE_PLUGIN_ROOT}/skills/hf-papers/scripts/ensure_hf_cli.py
#
# The skill name match is namespace-aware: it accepts either the bare skill
# name (e.g. "agent-task") or any namespace-prefixed form
# (e.g. "work-toolkit:agent-task"). Skills that merely *end* with the same
# letters (e.g. "not-agent-task" or "my-agent-task") DO NOT match — the
# boundary is start-of-string or a colon.
#
# Behavior on edge cases:
#   - jq missing       → cannot read skill name, exit 0 silently
#   - malformed JSON   → skill resolves to "", exit 0 silently
#   - no match         → exit 0 silently
#   - real hook fails  → propagate its exit code
set -u

if [ "$#" -lt 2 ]; then
  printf 'skill-prerun.sh: usage: %s <skill-suffix> <command...>\n' "$0" >&2
  exit 0
fi

suffix="$1"
shift

input=$(cat 2>/dev/null || true)

skill=""
if command -v jq >/dev/null 2>&1; then
  skill=$(printf '%s' "$input" | jq -r '.tool_input.skill // ""' 2>/dev/null || true)
fi

case "$skill" in
  "$suffix"|*:"$suffix") ;;
  *) exit 0 ;;
esac

# Forward the original PreToolUse JSON to the real hook command.
printf '%s' "$input" | "$@"
