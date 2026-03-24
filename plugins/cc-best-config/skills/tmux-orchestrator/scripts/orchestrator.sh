#!/bin/bash
# orchestrator.sh — One-shot script to create the tmux session and open it for viewing
#
# Usage: orchestrator.sh <session-name> [--attach]
#
# Creates the orchestrator tmux session. When --attach is passed,
# opens a new terminal window (macOS Terminal/iTerm2) attached to
# the session so the user can watch workers in real time.
#
# The orchestrator (Claude Code) continues to interact with workers
# via send-keys/capture-pane from the main terminal.

set -euo pipefail

SESSION="${1:-orchestrator}"
ATTACH=false

shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --attach) ATTACH=true; shift ;;
    *) shift ;;
  esac
done

# Create session if it doesn't exist
if ! tmux has-session -t "$SESSION" 2>/dev/null; then
  tmux new-session -d -s "$SESSION" -n "overview"
  tmux send-keys -t "${SESSION}:overview" "echo '=== Orchestrator session: ${SESSION} ==='" Enter
  tmux send-keys -t "${SESSION}:overview" "echo 'Use Ctrl-b w to list windows, Ctrl-b n/p to switch'" Enter
  echo "Created tmux session: ${SESSION}"
else
  echo "Session '${SESSION}' already exists"
fi

# Open a viewer terminal for the user
if [[ "$ATTACH" == "true" ]]; then
  ATTACH_CMD="tmux attach-session -t ${SESSION}; exit"

  if [[ "$(uname)" == "Darwin" ]]; then
    # macOS: detect running terminal and open a new window in it
    # Try Ghostty, iTerm2, then Terminal.app in order
    if pgrep -q "ghostty" 2>/dev/null; then
      # Ghostty: use its CLI or open via shell
      osascript -e "
        tell application \"Ghostty\"
          activate
        end tell
      " 2>/dev/null
      osascript -e "
        tell application \"System Events\"
          tell process \"Ghostty\"
            keystroke \"n\" using command down
            delay 0.5
            keystroke \"${ATTACH_CMD}\"
            key code 36
          end tell
        end tell
      " 2>/dev/null && echo "Opened Ghostty window attached to session '${SESSION}'" || {
        echo "Could not auto-open Ghostty. Run manually:"
        echo "  ${ATTACH_CMD}"
      }
    elif osascript -e 'application "iTerm" is running' 2>/dev/null; then
      osascript <<APPLESCRIPT
tell application "iTerm"
  activate
  set newWindow to (create window with default profile)
  tell current session of newWindow
    write text "${ATTACH_CMD}"
  end tell
end tell
APPLESCRIPT
      echo "Opened iTerm2 window attached to session '${SESSION}'"
    else
      osascript <<APPLESCRIPT
tell application "Terminal"
  do script "${ATTACH_CMD}"
  activate
end tell
APPLESCRIPT
      echo "Opened Terminal.app window attached to session '${SESSION}'"
    fi
  else
    # Linux: try common terminal emulators
    if command -v gnome-terminal >/dev/null 2>&1; then
      gnome-terminal -- bash -c "$ATTACH_CMD" &
    elif command -v xterm >/dev/null 2>&1; then
      xterm -e "$ATTACH_CMD" &
    else
      echo "Could not auto-open terminal. Attach manually with:"
      echo "  ${ATTACH_CMD}"
    fi
  fi
fi

echo ""
echo "To view workers manually:"
echo "  tmux attach-session -t ${SESSION}"
echo ""
echo "Inside tmux:"
echo "  Ctrl-b w     — list all worker windows"
echo "  Ctrl-b n/p   — next/previous window"
echo "  Ctrl-b d     — detach (return to orchestrator)"
