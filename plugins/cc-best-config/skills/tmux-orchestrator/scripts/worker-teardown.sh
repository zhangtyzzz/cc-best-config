#!/bin/bash
# worker-teardown.sh — Clean up a worker: close agent CLI, remove tmux window, delete worktree
#
# Usage: worker-teardown.sh <session-name> <window-name> [--keep-worktree]
#
# 1. Sends exit/quit to the agent CLI
# 2. Waits for the process to exit
# 3. Closes the tmux window
# 4. Removes the git worktree and branch (unless --keep-worktree)

set -euo pipefail

SESSION="${1:-}"
WINDOW="${2:-}"
KEEP_WORKTREE=false

shift 2 2>/dev/null || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep-worktree) KEEP_WORKTREE=true; shift ;;
    *) shift ;;
  esac
done

if [[ -z "$SESSION" || -z "$WINDOW" ]]; then
  echo "Usage: worker-teardown.sh <session-name> <window-name> [--keep-worktree]" >&2
  exit 1
fi

TARGET="${SESSION}:${WINDOW}"
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
WORKTREE_DIR="${REPO_ROOT:-.}/.worktrees/${WINDOW}"
BRANCH_NAME="orchestrator/${WINDOW}"

# Step 1: Try to gracefully exit the agent CLI
if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "Sending exit to worker ${TARGET}..."

  # Send Ctrl-C first (in case agent is mid-operation), then exit commands
  tmux send-keys -t "$TARGET" C-c 2>/dev/null || true
  sleep 0.5
  tmux send-keys -t "$TARGET" "/exit" Enter 2>/dev/null || true
  sleep 1
  tmux send-keys -t "$TARGET" "exit" Enter 2>/dev/null || true
  sleep 1

  # Step 2: Kill the tmux window
  echo "Closing tmux window ${TARGET}..."
  tmux kill-window -t "$TARGET" 2>/dev/null || true
fi

# Step 3: Remove git worktree and branch
if [[ "$KEEP_WORKTREE" == "true" ]]; then
  echo "Keeping worktree at ${WORKTREE_DIR}"
else
  if [[ -n "$REPO_ROOT" && -d "$WORKTREE_DIR" ]]; then
    echo "Removing git worktree at ${WORKTREE_DIR}..."
    git worktree remove "$WORKTREE_DIR" --force 2>/dev/null || true

    # Remove the branch if it exists and is fully merged
    if git rev-parse --verify "$BRANCH_NAME" >/dev/null 2>&1; then
      git branch -d "$BRANCH_NAME" 2>/dev/null || \
        echo "WARNING: Branch ${BRANCH_NAME} not deleted (may not be fully merged). Use 'git branch -D ${BRANCH_NAME}' to force-delete."
    fi
  fi
fi

# Check if the session is now empty and clean it up
if tmux has-session -t "$SESSION" 2>/dev/null; then
  WINDOW_COUNT=$(tmux list-windows -t "$SESSION" 2>/dev/null | wc -l)
  if [[ "$WINDOW_COUNT" -eq 0 ]]; then
    echo "Session ${SESSION} is empty, removing..."
    tmux kill-session -t "$SESSION" 2>/dev/null || true
  fi
fi

echo "Worker ${WINDOW} cleaned up."
