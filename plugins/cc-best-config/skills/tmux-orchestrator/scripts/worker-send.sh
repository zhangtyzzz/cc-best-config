#!/bin/bash
# worker-send.sh — Send a prompt to a worker agent via tmux
#
# Usage: worker-send.sh <session>:<window> "<prompt>"
#
# For short prompts (< 200 chars): uses tmux send-keys -l (literal mode)
# For long prompts: uses tmux load-buffer + paste-buffer to avoid issues
# Always sends Enter separately to avoid race conditions

set -euo pipefail

TARGET="${1:-}"

# Accept prompt as $2 (argument) OR via stdin pipe.
# Argument form:  worker-send.sh session:win "prompt text"
# Stdin form:     printf '%s' "$PROMPT" | worker-send.sh session:win
#                 worker-send.sh session:win < /tmp/prompt.txt
if [[ $# -ge 2 && -n "${2:-}" ]]; then
  PROMPT="$2"
elif [[ ! -t 0 ]]; then
  # Read from stdin
  PROMPT=$(cat)
else
  PROMPT=""
fi

if [[ -z "$TARGET" || -z "$PROMPT" ]]; then
  echo "Usage: worker-send.sh <session>:<window> \"<prompt>\"" >&2
  echo "   or: printf '%s' \"\$PROMPT\" | worker-send.sh <session>:<window>" >&2
  exit 1
fi

# Verify the target window exists
if ! tmux has-session -t "${TARGET%%:*}" 2>/dev/null; then
  echo "ERROR: tmux session '${TARGET%%:*}' does not exist" >&2
  exit 1
fi

PROMPT_LEN=${#PROMPT}

if [[ $PROMPT_LEN -lt 200 ]]; then
  # Short prompt: send directly with literal mode
  tmux send-keys -t "$TARGET" -l "$PROMPT"
else
  # Long prompt: use load-buffer + paste-buffer
  TMPFILE=$(mktemp)
  trap 'rm -f "$TMPFILE"' EXIT
  printf '%s' "$PROMPT" > "$TMPFILE"
  BUFNAME="worker-send-$$"
  tmux load-buffer -b "$BUFNAME" "$TMPFILE"
  tmux paste-buffer -t "$TARGET" -b "$BUFNAME" -d
fi

# Send Enter separately
sleep 0.2
tmux send-keys -t "$TARGET" Enter
