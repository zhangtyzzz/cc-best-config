#!/bin/bash
# ensure_tmux_env.sh — PreToolUse hook for tmux-orchestrator skill.
#
# Checks that tmux is installed (auto-installs via brew/apt if possible).
# Checks that claude CLI is available (default worker agent).
# Injects environment status into Claude's context via additionalContext.

check_and_install_tmux() {
  if command -v tmux >/dev/null 2>&1; then
    TMUX_VERSION=$(tmux -V 2>/dev/null || echo "unknown")
    echo "ok:${TMUX_VERSION}"
    return 0
  fi

  # Try auto-install
  if [[ "$(uname)" == "Darwin" ]] && command -v brew >/dev/null 2>&1; then
    brew install tmux >/dev/null 2>&1
    if command -v tmux >/dev/null 2>&1; then
      echo "installed:$(tmux -V)"
      return 0
    fi
  elif command -v apt-get >/dev/null 2>&1; then
    sudo apt-get install -y tmux >/dev/null 2>&1
    if command -v tmux >/dev/null 2>&1; then
      echo "installed:$(tmux -V)"
      return 0
    fi
  fi

  echo "missing"
  return 1
}

check_claude_cli() {
  if command -v claude >/dev/null 2>&1; then
    echo "ok"
    return 0
  fi
  echo "missing"
  return 1
}

check_git() {
  if command -v git >/dev/null 2>&1; then
    echo "ok"
    return 0
  fi
  echo "missing"
  return 1
}

# Run checks
TMUX_STATUS=$(check_and_install_tmux)
CLAUDE_STATUS=$(check_claude_cli)
GIT_STATUS=$(check_git)

# Build context message
CONTEXT="[tmux-orchestrator — Environment Check]"
ALL_OK=true

case "$TMUX_STATUS" in
  ok:*)
    CONTEXT="${CONTEXT} tmux=${TMUX_STATUS#ok:}."
    ;;
  installed:*)
    CONTEXT="${CONTEXT} tmux auto-installed (${TMUX_STATUS#installed:})."
    ;;
  missing)
    CONTEXT="${CONTEXT} ERROR: tmux is not installed. Ask the user to install it (brew install tmux / apt install tmux)."
    ALL_OK=false
    ;;
esac

case "$GIT_STATUS" in
  ok) CONTEXT="${CONTEXT} git=ok." ;;
  missing)
    CONTEXT="${CONTEXT} ERROR: git is not installed."
    ALL_OK=false
    ;;
esac

case "$CLAUDE_STATUS" in
  ok) CONTEXT="${CONTEXT} claude-cli=ok (default worker agent)." ;;
  missing)
    CONTEXT="${CONTEXT} WARNING: claude CLI not found. Worker agents need at least one agent CLI installed. Default is claude; others (codex, gemini, aider) are optional."
    ;;
esac

if [[ "$ALL_OK" == "true" ]]; then
  CONTEXT="${CONTEXT} ORCHESTRATOR_READY=1. All prerequisites met. Default worker agent: claude-code."
else
  CONTEXT="${CONTEXT} ORCHESTRATOR_READY=0. Fix the errors above before proceeding."
fi

# Escape JSON special characters in CONTEXT
CONTEXT_ESCAPED=$(printf '%s' "$CONTEXT" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g')

# Output PreToolUse hook JSON
cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "tmux-orchestrator environment check",
    "additionalContext": "${CONTEXT_ESCAPED}"
  }
}
EOF
