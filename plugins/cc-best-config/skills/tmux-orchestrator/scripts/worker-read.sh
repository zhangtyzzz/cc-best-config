#!/bin/bash
# worker-read.sh — Read the output of a worker agent
#
# Usage: worker-read.sh <session>:<window> [--lines N]
#
# Captures the tmux pane content, strips ANSI codes, and outputs clean text.
# Default: last 200 lines. Use --lines to adjust.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET="$1"
shift

LINES=200

while [[ $# -gt 0 ]]; do
  case "$1" in
    --lines)
      LINES="$2"
      shift 2
      ;;
    *)
      echo "Usage: worker-read.sh <session>:<window> [--lines N]" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$TARGET" ]]; then
  echo "Usage: worker-read.sh <session>:<window> [--lines N]" >&2
  exit 1
fi

# Capture pane content with scrollback
tmux capture-pane -t "$TARGET" -p -S "-${LINES}" 2>/dev/null \
  | "$SCRIPT_DIR/strip-ansi.sh" \
  | sed '/^$/{ N; /^\n$/d; }'  # collapse multiple blank lines
