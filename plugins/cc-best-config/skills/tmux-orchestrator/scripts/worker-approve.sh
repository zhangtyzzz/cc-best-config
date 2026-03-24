#!/bin/bash
# worker-approve.sh — Send a key to a worker's tmux pane
#
# Usage: worker-approve.sh <session>:<window> <key>
#
# Sends the specified key to the worker. The orchestrator LLM decides
# what key to send based on reading the worker's output.
#
# Examples:
#   worker-approve.sh orch:w1 Enter     # Accept (Claude Code default selection)
#   worker-approve.sh orch:w1 Escape    # Cancel (Claude Code)
#   worker-approve.sh orch:w1 y         # Approve (Codex, aider, Gemini, etc.)
#   worker-approve.sh orch:w1 n         # Deny
#
# Special keys (Enter, Escape, C-c, etc.) are sent as tmux key names.
# Regular characters are sent in literal mode followed by Enter.

set -euo pipefail

TARGET="$1"
KEY="$2"

if [[ -z "$TARGET" || -z "$KEY" ]]; then
  echo "Usage: worker-approve.sh <session>:<window> <key>" >&2
  exit 1
fi

# Send the key
case "$KEY" in
  Enter|Escape|C-c|C-d|C-z|Up|Down|Left|Right|Tab|Space|BSpace)
    # Special tmux key names — send directly
    tmux send-keys -t "$TARGET" "$KEY"
    ;;
  *)
    # Regular character — send literal, then Enter
    tmux send-keys -t "$TARGET" -l "$KEY"
    sleep 0.1
    tmux send-keys -t "$TARGET" Enter
    ;;
esac

echo "Sent key '${KEY}' to ${TARGET}"
