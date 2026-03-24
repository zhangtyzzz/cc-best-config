#!/bin/bash
# worker-setup.sh — Initialize a worker: create git worktree, tmux window, launch agent CLI
#
# Usage: worker-setup.sh <session-name> <window-name> "<launch-cmd>" [base-branch]
#
# 1. Creates a git worktree at .worktrees/<window-name>
# 2. Creates a tmux window (or session + window if session doesn't exist)
# 3. cd into the worktree
# 4. Launches the agent CLI using the provided launch command
#
# The launch command is passed directly — no built-in profile mapping.
# Examples:
#   worker-setup.sh orch w1 "claude"
#   worker-setup.sh orch w2 "codex"
#   worker-setup.sh orch w3 "gemini"
#   worker-setup.sh orch w4 "aider"

set -euo pipefail

SESSION="$1"
WINDOW="$2"
LAUNCH_CMD="$3"
BASE_BRANCH="${4:-HEAD}"

if [[ -z "$SESSION" || -z "$WINDOW" || -z "$LAUNCH_CMD" ]]; then
  echo "Usage: worker-setup.sh <session-name> <window-name> \"<launch-cmd>\" [base-branch]" >&2
  exit 1
fi

# Get repo root
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [[ -z "$REPO_ROOT" ]]; then
  echo "ERROR: Not inside a git repository" >&2
  exit 1
fi

WORKTREE_DIR="${REPO_ROOT}/.worktrees/${WINDOW}"
BRANCH_NAME="orchestrator/${WINDOW}"

# Create worktree
echo "Creating git worktree at ${WORKTREE_DIR} (branch: ${BRANCH_NAME})..."
if [[ -d "$WORKTREE_DIR" ]]; then
  echo "WARNING: Worktree already exists at ${WORKTREE_DIR}, reusing it"
else
  git worktree add -b "$BRANCH_NAME" "$WORKTREE_DIR" "$BASE_BRANCH"
fi

# Create or attach to tmux session + window
if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "Creating window '${WINDOW}' in existing session '${SESSION}'..."
  tmux new-window -t "$SESSION" -n "$WINDOW"
else
  echo "Creating new tmux session '${SESSION}' with window '${WINDOW}'..."
  tmux new-session -d -s "$SESSION" -n "$WINDOW"
fi

TARGET="${SESSION}:${WINDOW}"

# cd into worktree
tmux send-keys -t "$TARGET" "cd '${WORKTREE_DIR}'" Enter
sleep 0.5

# Launch agent CLI
echo "Launching '${LAUNCH_CMD}' in ${TARGET}..."
tmux send-keys -t "$TARGET" "$LAUNCH_CMD" Enter

echo "Worker ${TARGET} launched. Use worker-read.sh to check its output."
