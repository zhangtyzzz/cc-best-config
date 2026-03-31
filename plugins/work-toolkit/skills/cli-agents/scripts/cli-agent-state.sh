#!/usr/bin/env bash
# cli-agent-state.sh - Manage CLI agent session state for context continuation
#
# Usage:
#   cli-agent-state.sh init <run-dir>           # Initialize state directory
#   cli-agent-state.sh save <run-dir> <session-id> <tool> <prompt>  # Save session
#   cli-agent-state.sh latest <run-dir> [tool]  # Get latest session ID for tool
#   cli-agent-state.sh list <run-dir> [tool]    # List all sessions
#   cli-agent-state.sh clear <run-dir>          # Clear all sessions
#
# Dependencies: jq (for JSON manipulation)
#
# Locking: Uses mkdir-based file locking with 5s timeout.
# NOTE: If a process is killed with SIGKILL while holding the lock,
# the lock directory may remain. Delete it manually: rmdir <run-dir>/.agent-sessions.lock

set -euo pipefail

STATE_FILE="agent-sessions.json"
LOCK_DIR=".agent-sessions.lock"

# Cross-platform file locking using mkdir (atomic on most filesystems)
# Returns 0 on success, non-zero if lock acquisition fails
acquire_lock() {
    local run_dir="$1"
    local lock_path="$run_dir/$LOCK_DIR"
    local max_attempts=50
    local attempt=0

    while [[ $attempt -lt $max_attempts ]]; do
        if mkdir "$lock_path" 2>/dev/null; then
            return 0
        fi
        sleep 0.1
        ((attempt++))
    done
    return 1
}

release_lock() {
    local run_dir="$1"
    rmdir "$run_dir/$LOCK_DIR" 2>/dev/null || true
}

with_lock() {
    local run_dir="$1"
    shift

    acquire_lock "$run_dir"
    trap "release_lock '$run_dir'" EXIT
    "$@"
    release_lock "$run_dir"
    trap - EXIT
}

init_state() {
    local run_dir="$1"
    mkdir -p "$run_dir"
    if [[ ! -f "$run_dir/$STATE_FILE" ]]; then
        echo '{"sessions": []}' > "$run_dir/$STATE_FILE"
    fi
}

save_session() {
    local run_dir="$1"
    local session_id="$2"
    local tool="$3"
    local prompt="$4"
    local timestamp
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    mkdir -p "$run_dir"

    # Use unique temp file per process to avoid conflicts
    local tmp_file
    tmp_file=$(mktemp "$run_dir/.agent-sessions.XXXXXX")

    # Perform atomic update with lock
    # Only set trap AFTER acquiring lock to avoid deleting others' locks
    (
        acquire_lock "$run_dir" || exit 1
        trap 'rmdir "$run_dir/$LOCK_DIR" 2>/dev/null' EXIT

        # Initialize if needed
        if [[ ! -f "$run_dir/$STATE_FILE" ]]; then
            echo '{"sessions": []}' > "$run_dir/$STATE_FILE"
        fi

        # Append and sort
        jq --arg sid "$session_id" \
           --arg tool "$tool" \
           --arg prompt "$prompt" \
           --arg ts "$timestamp" '
            .sessions += [{
                "sessionId": $sid,
                "tool": $tool,
                "prompt": $prompt,
                "timestamp": $ts
            }] | .sessions |= sort_by(.timestamp) | .sessions |= reverse
        ' "$run_dir/$STATE_FILE" > "$tmp_file"

        mv "$tmp_file" "$run_dir/$STATE_FILE"
    )

    echo "$session_id"
}

get_latest() {
    local run_dir="$1"
    local tool="${2:-}"

    if [[ ! -f "$run_dir/$STATE_FILE" ]]; then
        echo ""
        return 0
    fi

    if [[ -n "$tool" ]]; then
        jq -r --arg tool "$tool" '
            .sessions | map(select(.tool == $tool)) | .[0].sessionId // empty
        ' "$run_dir/$STATE_FILE" 2>/dev/null || echo ""
    else
        jq -r '.sessions[0].sessionId // empty' "$run_dir/$STATE_FILE" 2>/dev/null || echo ""
    fi
}

list_sessions() {
    local run_dir="$1"
    local tool="${2:-}"

    if [[ ! -f "$run_dir/$STATE_FILE" ]]; then
        echo "No sessions found"
        return 0
    fi

    if [[ -n "$tool" ]]; then
        jq -r --arg tool "$tool" '
            .sessions | map(select(.tool == $tool)) |
            .[] | "\(.timestamp) | \(.tool) | \(.sessionId) | \(.prompt[:50])..."
        ' "$run_dir/$STATE_FILE" 2>/dev/null
    else
        jq -r '
            .sessions[] | "\(.timestamp) | \(.tool) | \(.sessionId) | \(.prompt[:50])..."
        ' "$run_dir/$STATE_FILE" 2>/dev/null
    fi
}

clear_sessions() {
    local run_dir="$1"

    # Create directory if it doesn't exist (consistent with init)
    mkdir -p "$run_dir"

    # Use atomic write (temp file + rename) for consistency with readers
    local tmp_file
    tmp_file=$(mktemp "$run_dir/.agent-sessions.XXXXXX")
    echo '{"sessions": []}' > "$tmp_file"

    # Use lock for consistency (set trap AFTER acquiring lock)
    (
        acquire_lock "$run_dir" || exit 1
        trap 'rmdir "$run_dir/$LOCK_DIR" 2>/dev/null' EXIT
        mv "$tmp_file" "$run_dir/$STATE_FILE"
    )

    echo "Cleared all sessions"
}

# Main
command="${1:-}"
shift || true

case "$command" in
    init)
        init_state "$@"
        ;;
    save)
        save_session "$@"
        ;;
    latest)
        get_latest "$@"
        ;;
    list)
        list_sessions "$@"
        ;;
    clear)
        clear_sessions "$@"
        ;;
    *)
        echo "Usage: $0 {init|save|latest|list|clear} ..."
        echo ""
        echo "Dependencies: jq"
        exit 1
        ;;
esac
