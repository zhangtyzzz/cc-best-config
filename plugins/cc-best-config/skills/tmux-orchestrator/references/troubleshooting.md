# Troubleshooting

Common issues when using tmux-orchestrator and how to resolve them.

## Setup Issues

### "tmux is not installed"

Install tmux:
```bash
# macOS
brew install tmux

# Ubuntu/Debian
sudo apt install tmux

# Fedora
sudo dnf install tmux
```

### "Not inside a git repository"

The orchestrator requires a git repo to create worktrees. Initialize one:
```bash
git init
git add -A && git commit -m "initial commit"
```

### Agent CLI not found

Each worker's agent CLI must be installed separately:

| Agent | Install |
|-------|---------|
| Claude Code | `npm install -g @anthropic-ai/claude-code` |
| Codex | `npm install -g @openai/codex` |
| Gemini CLI | See Google's documentation |
| aider | `pip install aider-chat` |
| OpenCode | See OpenCode documentation |

## Worker Startup Issues

### Worker doesn't start properly

**Symptoms:** `worker-read.sh` shows errors or no agent prompt after launching.

**Common causes:**
1. **Agent is prompting for authentication** — ensure API keys are set in the environment
2. **Agent is showing a first-run wizard** — run the agent manually first to complete setup
3. **Agent crashed on startup** — check the output with `worker-read.sh`

**Fix:** Read the worker's output to see what's happening:
```bash
worker-read.sh <session>:<window> --lines 50
```

Or attach to the tmux session and check visually:
```bash
tmux attach-session -t <session-name>
```

### "Worktree already exists"

The worktree directory from a previous run was not cleaned up.

```bash
# Remove the stale worktree
git worktree remove .worktrees/<window-name> --force

# Or clean up all stale worktrees
git worktree prune
```

### tmux session name conflicts

If a session with the same name already exists:
```bash
# List existing sessions
tmux list-sessions

# Kill the old session
tmux kill-session -t <session-name>
```

## Runtime Issues

### Worker appears stuck

**Symptoms:** Reading worker output shows no progress for a long time.

**Common causes:**
1. Agent is genuinely working on a large task — check output for progress
2. Agent is waiting for user input — the orchestrator may have missed an approval prompt
3. Agent hit an error and is waiting

**Fix:**
```bash
# Check what the agent is doing
worker-read.sh <session>:<window> --lines 50

# If waiting for approval, send the appropriate key
worker-approve.sh <session>:<window> Enter   # or y, depending on the agent

# If stuck, send Ctrl-C and retry
worker-approve.sh <session>:<window> C-c
sleep 1
worker-send.sh <session>:<window> "Continue with the task"
```

### Worker output is garbled

**Symptoms:** `worker-read.sh` returns text with escape characters or formatting artifacts.

**Common causes:**
1. The agent uses TUI elements (progress bars, spinners) that produce complex ANSI sequences
2. Unicode/CJK characters in output
3. The agent redraws the screen (full-screen TUI mode)

**Fix:**
- The `strip-ansi.sh` script handles most cases
- For persistent issues, try increasing the terminal width: `tmux resize-window -t <session>:<window> -x 250 -y 50`
- Some agents (like OpenCode) have a non-TUI mode — check their docs

### Rate limiting

**Symptoms:** Workers start failing with 429 errors or "rate limit exceeded" messages.

**Common causes:**
- Multiple Claude Code instances sharing the same API key
- Burst of API calls during parallel task distribution

**Fix:**
1. Reduce the number of parallel workers
2. Mix different agent providers (Claude + Codex + Gemini) to distribute across APIs
3. Add delays between worker launches in `worker-setup.sh`
4. Check your API plan's rate limits and upgrade if needed

### Merge conflicts

**Symptoms:** Git merge fails when combining worker results.

**Fix:**
1. Review the conflicting files: `git diff --name-only --diff-filter=U`
2. Options:
   - Resolve manually and commit
   - Accept one side: `git checkout --theirs <file>` or `git checkout --ours <file>`
   - Ask the orchestrator to delegate conflict resolution to a worker

**Prevention:**
- Ensure subtasks have minimal file overlap during task decomposition
- Assign different files/modules to different workers

## Cleanup Issues

### Worktree removal fails

```bash
# If worktree has uncommitted changes
git worktree remove .worktrees/<name> --force

# If worktree is corrupt
rm -rf .worktrees/<name>
git worktree prune
```

### Orphaned tmux sessions

```bash
# List all sessions
tmux list-sessions

# Kill orchestrator sessions
tmux kill-session -t orchestrator-<timestamp>

# Kill all sessions (nuclear option)
tmux kill-server
```

### Orphaned git branches

```bash
# List orchestrator branches
git branch | grep 'orchestrator/'

# Delete specific branch
git branch -D orchestrator/<window-name>

# Delete all orchestrator branches
git branch | grep 'orchestrator/' | xargs git branch -D
```

## Performance Tips

1. **Limit workers to 3-5** — more workers increase coordination overhead and rate limit risk
2. **Use different agent providers** — mixing Claude, Codex, and Gemini avoids single-provider rate limits
3. **Keep tasks focused** — smaller, well-scoped tasks complete faster and merge more cleanly
4. **Pre-install dependencies** — ensure `npm install`, `pip install`, etc. are done before launching workers to avoid duplicate work
5. **Use `--keep-worktree`** during development — allows inspecting worker output before cleanup
