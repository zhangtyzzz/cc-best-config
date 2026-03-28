#!/bin/bash
# worker-setup.sh — Initialize a worker: create git worktree, tmux window, launch agent CLI
#
# Usage: worker-setup.sh <session-name> <window-name> "<launch-cmd>" [base-branch] [--init-git] [--no-worktree]
#
# Flags:
#   --init-git      Auto-initialize a git repo in cwd if none exists (git init + empty commit)
#   --no-worktree   Skip git worktree creation; run agent directly in cwd instead
#
# Steps:
# 1. Creates a git worktree at .worktrees/<window-name>  (skipped with --no-worktree)
# 2. Creates a tmux window (or session + window if session doesn't exist)
# 3. cd into the worktree (or cwd with --no-worktree)
# 4. Launches the agent CLI
# 5. Waits for the agent to be ready (handles codex update/trust prompts automatically)
#
# Examples:
#   worker-setup.sh orch w1 "claude"
#   worker-setup.sh orch w2 "codex --full-auto"
#   worker-setup.sh orch w3 "gemini"
#   worker-setup.sh orch w4 "aider"
#   worker-setup.sh orch w1 "claude" HEAD --init-git

set -euo pipefail

SESSION="$1"
WINDOW="$2"
LAUNCH_CMD="$3"
BASE_BRANCH="HEAD"
INIT_GIT=false
NO_WORKTREE=false

# Parse remaining args
shift 3
while [[ $# -gt 0 ]]; do
  case "$1" in
    --init-git)    INIT_GIT=true; shift ;;
    --no-worktree) NO_WORKTREE=true; shift ;;
    *)             BASE_BRANCH="$1"; shift ;;
  esac
done

if [[ -z "$SESSION" || -z "$WINDOW" || -z "$LAUNCH_CMD" ]]; then
  echo "Usage: worker-setup.sh <session-name> <window-name> \"<launch-cmd>\" [base-branch] [--init-git] [--no-worktree]" >&2
  exit 1
fi

# Pre-flight: ensure tmux is installed
if ! command -v tmux >/dev/null 2>&1; then
  echo "ERROR: tmux is not installed." >&2
  if [[ "$(uname)" == "Darwin" ]]; then
    echo "  Fix: brew install tmux" >&2
  else
    echo "  Fix: sudo apt-get install tmux" >&2
  fi
  exit 1
fi

# Determine working directory for the agent
if [[ "$NO_WORKTREE" == "true" ]]; then
  AGENT_DIR="$(pwd)"
  echo "Using --no-worktree: agent will run in ${AGENT_DIR}"
else
  # Get repo root, optionally initializing git
  REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
  if [[ -z "$REPO_ROOT" ]]; then
    if [[ "$INIT_GIT" == "true" ]]; then
      echo "No git repo found — initializing one (--init-git)..."
      git init
      git commit --allow-empty -m "init (auto by worker-setup)"
      REPO_ROOT=$(git rev-parse --show-toplevel)
    else
      echo "ERROR: Not inside a git repository." >&2
      echo "  Fix: run 'git init && git commit --allow-empty -m init' in your project root" >&2
      echo "  Or:  pass --init-git to auto-initialize" >&2
      echo "  Or:  pass --no-worktree to skip worktree creation entirely" >&2
      exit 1
    fi
  fi

  WORKTREE_DIR="${REPO_ROOT}/.worktrees/${WINDOW}"
  BRANCH_NAME="orchestrator/${WINDOW}"

  echo "Creating git worktree at ${WORKTREE_DIR} (branch: ${BRANCH_NAME})..."
  if [[ -d "$WORKTREE_DIR" ]]; then
    echo "WARNING: Worktree already exists at ${WORKTREE_DIR}, reusing it"
  else
    git worktree add -b "$BRANCH_NAME" "$WORKTREE_DIR" "$BASE_BRANCH"
  fi
  AGENT_DIR="$WORKTREE_DIR"
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

# cd into agent directory
tmux send-keys -t "$TARGET" "cd '${AGENT_DIR}'" Enter
sleep 0.5

# Launch agent CLI
echo "Launching '${LAUNCH_CMD}' in ${TARGET}..."
tmux send-keys -t "$TARGET" "$LAUNCH_CMD" Enter

# Wait for agent to be ready (handles interactive startup prompts)
wait_for_agent_ready() {
  local target="$1"
  local cmd="$2"
  local timeout=60
  local elapsed=0

  echo "Waiting for agent to be ready in ${target}..."
  while [ $elapsed -lt $timeout ]; do
    local pane_text
    pane_text=$(tmux capture-pane -t "$target" -p -J 2>/dev/null | tail -25)

    # Codex: dismiss "Update available" prompt (send "2" = Skip)
    if echo "$pane_text" | grep -q "Update available"; then
      echo "  [startup] Dismissing codex update prompt..."
      tmux send-keys -t "$target" "2" Enter
      sleep 1
      continue
    fi

    # Codex: dismiss "Do you trust the contents" prompt (send "1" = Yes)
    if echo "$pane_text" | grep -q "trust the contents"; then
      echo "  [startup] Approving codex directory trust..."
      tmux send-keys -t "$target" "1" Enter
      sleep 1
      continue
    fi

    # Codex: ready when we see the model/prompt indicator
    if echo "$cmd" | grep -q "codex"; then
      if echo "$pane_text" | grep -qE "›|gpt-[0-9]|Press enter to continue$|Write tests|Improve doc"; then
        echo "  [startup] codex is ready."
        return 0
      fi
    fi

    # Claude Code: ready when we see the > prompt
    if echo "$cmd" | grep -qE "^claude|claude$"; then
      if echo "$pane_text" | grep -qE "^\s*>"; then
        echo "  [startup] claude is ready."
        return 0
      fi
    fi

    # Generic: any prompt character at end of output
    if echo "$pane_text" | tail -3 | grep -qE "[>›$#%] *$"; then
      echo "  [startup] agent appears ready."
      return 0
    fi

    sleep 1
    elapsed=$((elapsed + 1))
  done

  echo "WARNING: agent ${target} did not signal readiness after ${timeout}s — proceeding anyway"
}

wait_for_agent_ready "$TARGET" "$LAUNCH_CMD"

echo "Worker ${TARGET} ready. Use worker-send.sh to send prompts, worker-read.sh to check output."
