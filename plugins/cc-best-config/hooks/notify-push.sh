#!/bin/bash

# Notify Push Hook (Notification + Stop)
# Sends push notifications via HTTP POST (Bark by default) with task context.
# Falls back to desktop notification if push is not configured.
#
# Environment variables:
#   NOTIFY_URL    — Push endpoint (e.g. https://api.day.app/your-device-key/)
#                   If unset, only desktop notification is sent.

set -euo pipefail

INPUT=$(cat)
EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // ""')

# --- Build title & body based on event ---
case "$EVENT" in
  Notification)
    TITLE=$(echo "$INPUT" | jq -r '.title // "Claude Code"')
    BODY=$(echo "$INPUT" | jq -r '.message // "Needs your input"')
    ;;
  Stop)
    # Extract first user message from transcript as title
    TITLE=""
    TRANSCRIPT=$(echo "$INPUT" | jq -r '.transcript_path // ""')
    if [[ -n "$TRANSCRIPT" && -f "$TRANSCRIPT" ]]; then
      TITLE=$(head -1 "$TRANSCRIPT" | jq -r '
        if .message.content then
          (if (.message.content | type) == "string" then .message.content
           elif (.message.content | type) == "array" then
             [.message.content[] | select(.type == "text") | .text] | join("")
           else "" end)
        else "" end' 2>/dev/null | head -c 80)
    fi
    TITLE="${TITLE:-Task completed}"
    # Use last_assistant_message as body
    BODY=$(echo "$INPUT" | jq -r '.last_assistant_message // "Done"' | head -c 200)
    ;;
  *)
    TITLE="Claude Code"
    BODY="Event: $EVENT"
    ;;
esac

# --- Send push notification if NOTIFY_URL is set ---
if [[ -n "${NOTIFY_URL:-}" ]]; then
  curl -sf -X POST "${NOTIFY_URL}" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg t "$TITLE" --arg b "$BODY" '{title:$t,body:$b}')" \
    >/dev/null 2>&1 &
fi

# --- Desktop notification fallback ---
if command -v osascript &>/dev/null; then
  osascript -e "display notification \"$BODY\" with title \"$TITLE\" sound name \"Glass\"" 2>/dev/null || true
elif command -v notify-send &>/dev/null; then
  notify-send "$TITLE" "$BODY" 2>/dev/null || true
fi

exit 0
