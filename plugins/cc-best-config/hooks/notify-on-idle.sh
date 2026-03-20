#!/bin/bash

# Notify on Idle Hook (Notification)
# Sends a desktop notification when Claude Code needs your input.
# Supports macOS (osascript) and Linux (notify-send).

set -euo pipefail

TITLE="Claude Code"
MESSAGE="Claude Code needs your input"

if command -v osascript &>/dev/null; then
  osascript -e "display notification \"$MESSAGE\" with title \"$TITLE\" sound name \"Glass\"" 2>/dev/null || true
elif command -v notify-send &>/dev/null; then
  notify-send "$TITLE" "$MESSAGE" 2>/dev/null || true
fi

exit 0
