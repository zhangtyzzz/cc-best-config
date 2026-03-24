---
name: tmux-orchestrator
description: 'Orchestrate multiple CLI-based AI agents in parallel via tmux. Use this skill when the user wants to run multiple agents simultaneously — phrases like "parallel agents", "multi-agent", "tmux orchestrate", "run codex and claude together", "并行编程", "多 agent 协作", "用 tmux 编排", "分发任务给多个 agent", or any request that involves launching several AI coding agents (Claude Code, Codex, OpenCode, Gemini CLI, etc.) to work on different subtasks concurrently, coordinating through tmux sessions and git worktrees.'
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "bash ${CLAUDE_SKILL_DIR}/scripts/ensure_tmux_env.sh"
---

# tmux-orchestrator

Use Claude Code as an orchestrator to coordinate multiple CLI-based AI agents working in parallel through tmux. Each worker agent runs in its own tmux window with an isolated git worktree, and the orchestrator distributes tasks, monitors progress, and merges results.

## Design Principles

1. **Scripts are pure transport** — scripts only move bytes (capture output, send keys, create/destroy sessions). They contain zero intelligence about agent state.
2. **LLM is all intelligence** — the orchestrator (you) reads raw terminal output and decides: Is the worker idle? Busy? Asking for approval? Done? Errored? You interpret naturally, no regex needed.
3. **Clean agent abstraction** — switching between Claude Code, Codex, Gemini, aider, or any CLI agent only requires changing the launch command string. No per-agent code paths.

## CRITICAL: Always Use Scripts — Never Raw-Invoke Agent CLIs

**ALL interaction with worker agents MUST go through the provided scripts.** You are an orchestrator, not a shell user. Never bypass the script layer.

❌ **WRONG — Do NOT do any of these:**
```bash
# Direct CLI invocation — NEVER do this
claude --prompt "do something"
claude <<<'do something'
echo "do something" | claude
codex --prompt "do something"

# Raw tmux send without the script — NEVER do this
tmux send-keys -t orch:w1 "some prompt" Enter

# Launching agents without worker-setup.sh — NEVER do this
tmux new-window -t orch -n w1
claude
```

✅ **RIGHT — Always use the scripts:**
```bash
# Launch a worker (creates worktree + tmux window + starts agent)
"${CLAUDE_SKILL_DIR}/scripts/worker-setup.sh" orch w1 "claude"

# Send a prompt to a worker
"${CLAUDE_SKILL_DIR}/scripts/worker-send.sh" orch:w1 "Your task description here"

# Read worker output
"${CLAUDE_SKILL_DIR}/scripts/worker-read.sh" orch:w1 --lines 50

# Approve/deny a permission request
"${CLAUDE_SKILL_DIR}/scripts/worker-approve.sh" orch:w1 Enter

# Tear down a worker
"${CLAUDE_SKILL_DIR}/scripts/worker-teardown.sh" orch w1
```

**Why?** The scripts handle:
- Git worktree isolation (so workers don't clobber each other's files)
- Long prompt delivery (load-buffer for prompts >200 chars to avoid truncation)
- ANSI stripping (clean output for you to interpret)
- Proper cleanup (agent exit + window close + worktree removal)

Skipping scripts means no worktree isolation, no long-prompt handling, no cleanup, and **broken orchestration**.

## Agent Profiles

Each agent is defined by just two things: a **launch command** and **behavioral notes** for the orchestrator to know how it works.

| Agent | Launch Command | Approval UI | Notes |
|-------|---------------|-------------|-------|
| Claude Code | `claude` | Selection list: **Enter** = Yes, **Escape** = Cancel | Default worker. Shows `❯` prompt when idle. Permission prompts render as numbered lists. ~500MB RAM per instance. |
| Codex | `codex` | **Enter** = approve, **Escape** = reject | Shows `>` prompt when idle. "Working (N patches)" when busy. |
| Gemini CLI | `gemini` | `y` / `n` | Shows `❯` or `>` prompt when idle. |
| aider | `aider` | `y` / `n` | Shows `>` prompt when idle. Commit-per-edit workflow. |
| OpenCode | `opencode` | `y` / `n` | TUI-based — output may contain box-drawing chars. |

**Default**: When the user doesn't specify which agent to use, use `claude` (Claude Code).

**Custom agents**: If the user wants to use an agent not listed above, just ask them for the launch command. The orchestrator can figure out the rest by reading the terminal output.

## Phase 1: Task Decomposition

Before launching any workers, analyze the user's request:

1. **Break down into subtasks** — each subtask should be independently executable with minimal file overlap
2. **For each subtask, define**:
   - Goal (one sentence)
   - Files involved (list specific paths)
   - Acceptance criteria (how to verify it's done)
   - Launch command to use (default: `claude`)
3. **Identify dependencies** — which tasks can run in parallel vs. which must be sequential
4. **Present the plan to the user for confirmation** before proceeding

Example decomposition:

```
Task 1 (w1, claude): Refactor auth module
  Files: src/auth/*.ts
  Acceptance: All existing tests pass + new unit tests added

Task 2 (w2, claude): Write API integration tests
  Files: tests/api/*.test.ts
  Acceptance: Tests cover all endpoints, `npm test` passes

Task 3 (w3, codex): Optimize database queries
  Files: src/db/queries.ts, src/db/indexes.sql
  Acceptance: Query benchmark shows >= 30% improvement
```

## Phase 2: Worker Startup

### Initialize the session

First, create the tmux session and open a viewer window for the user:

```bash
"${CLAUDE_SKILL_DIR}/scripts/orchestrator.sh" <session-name> --attach
```

This creates the session and **automatically opens a new terminal window** attached to it, so the user can watch workers in real time. Inside that terminal, `Ctrl-b w` lists all worker windows, `Ctrl-b n/p` switches between them.

### Launch workers

For each worker, run the setup script:

```bash
"${CLAUDE_SKILL_DIR}/scripts/worker-setup.sh" <session-name> <window-name> "<launch-cmd>" [base-branch]
```

Examples:
```bash
"${CLAUDE_SKILL_DIR}/scripts/worker-setup.sh" orch w1 "claude"
"${CLAUDE_SKILL_DIR}/scripts/worker-setup.sh" orch w2 "codex"
"${CLAUDE_SKILL_DIR}/scripts/worker-setup.sh" orch w3 "gemini"
```

This script:
1. Creates a git worktree at `.worktrees/<window-name>` branching from the current HEAD (or specified base branch)
2. Creates a new tmux window named `<window-name>` inside session `<session-name>`
3. Changes directory to the worktree
4. Launches the agent CLI

**Session naming**: Use `orch-<timestamp>` or a user-provided name.

**Window naming**: Use `w1`, `w2`, `w3`, etc. or descriptive names like `auth`, `tests`, `db`.

### Startup verification

After launching, wait a few seconds then read the worker's output to verify it started:

```bash
"${CLAUDE_SKILL_DIR}/scripts/worker-read.sh" <session>:<window> --lines 30
```

Read the output. If you see the agent's prompt (e.g., `❯` for Claude Code, `>` for others), the worker is ready. If you see errors or login prompts, report to the user.

## Phase 3: Task Distribution

Send each subtask to its worker:

```bash
"${CLAUDE_SKILL_DIR}/scripts/worker-send.sh" <session>:<window> "<prompt>"
```

### Prompt construction

Each worker receives a prompt that includes:

```
You are working in a git worktree at: <worktree-path>
Your branch: <branch-name>

## Task
<task description>

## Files to modify
<file list>

## Acceptance criteria
<criteria>

## Instructions
- Work only within the files listed above
- Commit your changes when done with a descriptive message
- Do NOT modify files outside your scope
- When finished, output "TASK COMPLETE" on its own line
```

## Phase 4: Monitoring & Approval

This is where the orchestrator's intelligence matters. **You read raw terminal output and make all judgments yourself.** No regex, no status codes — just read and understand.

### Monitoring loop

Poll workers by reading their output:

```bash
"${CLAUDE_SKILL_DIR}/scripts/worker-read.sh" <session>:<window> --lines 50
```

Read the output and determine the worker's state naturally:

- **Idle/Done**: You see the agent's prompt character (like `❯` or `>`) at the bottom, and the output contains completed work or "TASK COMPLETE"
- **Busy**: The agent is showing progress — editing files, running commands, thinking
- **Waiting for approval**: The agent is asking a question like "Do you want to proceed?", "Allow this?", showing a Yes/No selection, etc.
- **Error**: You see stack traces, "Error:", "FAILED", crash messages
- **Unknown**: Can't tell — read more lines or wait and check again

Poll every 15-30 seconds. Report status to the user proactively:

```
Worker status update:
  [w1] auth    — working (editing src/auth/middleware.ts)
  [w2] tests   — waiting for approval (wants to run: npm install jest)
  [w3] db      — done (3 commits, output contains "TASK COMPLETE")
```

### Handling approval requests

When you see a worker asking for permission:

1. **Read the context** — what does the worker want to do? (which tool, which file, what command)
2. **Evaluate against task scope**:

| Situation | Decision | Action |
|-----------|----------|--------|
| Edit file within assigned scope | **Approve** | Send approval key |
| Read file outside scope (for context) | **Approve** | Send approval key |
| Edit file outside assigned scope | **Deny** | Send denial key |
| Run tests, linters, build commands | **Approve** | Send approval key |
| Install packages | **Approve with caution** | Log for user review |
| Delete files | **Ask user** | Escalate to user |
| Git push, deploy, publish | **Deny** | Only orchestrator does this after merge |
| Network requests to external services | **Ask user** | May have side effects |

3. **Send the key**:
```bash
"${CLAUDE_SKILL_DIR}/scripts/worker-approve.sh" <session>:<window> <key>
```

The key depends on which agent you're talking to (see Agent Profiles table above):
- **Claude Code**: `Enter` to approve, `Escape` to deny
- **Codex**: `Enter` to approve, `Escape` to deny
- **Others (Gemini, aider, OpenCode)**: `y` to approve, `n` to deny

When uncertain, **ask the user** before approving:

```
Worker [w1] is requesting approval:
  Tool: Bash
  Command: npm install express-rate-limit
  Context: Adding rate limiting middleware (part of Task 1)

Approve this action? [y/n]
```

### Approval logging

Keep a mental log of all approval decisions. After orchestration completes, present a summary:

```
Approval log:
  w1: 12 approved, 0 denied (auth module)
  w2:  8 approved, 1 denied (API tests — blocked git push)
  w3:  6 approved, 0 denied (db optimization)
```

### Error handling

If you see error output from a worker:
1. Read the full output to diagnose the issue
2. Present options to the user:
   a. Send a corrective prompt to the worker
   b. Teardown and re-create the worker with adjusted instructions
   c. Skip this subtask and continue with others
   d. Abort the entire orchestration

## Phase 5: Result Aggregation

When all workers finish:

1. **Review each worktree's changes**:
   ```bash
   cd .worktrees/<worker-name> && git diff main..HEAD --stat
   ```

2. **Merge strategy** (present options to user):
   - **Sequential merge**: Merge each worker branch into main one at a time, resolving conflicts as they arise
   - **Cherry-pick**: Select specific commits from each worker
   - **Squash merge**: Squash each worker's commits into a single commit per subtask

3. **Conflict resolution**:
   - If merge conflicts occur, show the conflicting files and ask the user how to resolve
   - For simple conflicts, suggest resolutions based on the task context

4. **Verification**:
   - Run the project's test suite after merging
   - If tests fail, identify which worker's changes caused the failure

## Phase 6: Cleanup

After merging (or on abort):

```bash
"${CLAUDE_SKILL_DIR}/scripts/worker-teardown.sh" <session-name> <window-name>
```

This script:
1. Sends exit/quit command to the agent CLI
2. Waits for the agent to exit
3. Closes the tmux window
4. Removes the git worktree (with `--force` if needed)

Clean up all workers, then remove the tmux session if it was created by the orchestrator.

**Optional**: The user can choose to keep worktrees for inspection before cleanup by passing `--keep-worktree`.

## Usage Examples

### Example 1: Parallel feature development

```
User: I need to add authentication, API rate limiting, and logging
      to my Express app. Use 3 workers in parallel.

Orchestrator:
→ Task 1 (w1, claude): Add JWT authentication middleware
→ Task 2 (w2, claude): Add rate limiting with express-rate-limit
→ Task 3 (w3, claude): Add structured logging with winston
→ Creates 3 worktrees, launches 3 Claude Code workers
→ Monitors workers by reading their output
→ Approves tool-use requests within scope
→ Merges all 3 branches sequentially
→ Runs npm test to verify
```

### Example 2: Mixed agent types

```
User: Use Codex for refactoring and Claude for tests.

Orchestrator:
→ Task 1 (w1, codex): Refactor utils module to TypeScript
→ Task 2 (w2, claude): Write comprehensive tests for utils
→ Task 2 depends on Task 1 — run sequentially
→ After Task 1 completes, send Task 2 with awareness of new code
```

## Safety

### Orchestrator-as-supervisor model

Workers run in **normal mode** with permission prompts enabled. The orchestrator (main Claude Code agent) acts as the human proxy, reviewing and approving each permission request. This gives the user:

- **Visibility**: The user can watch any worker live via the tmux-attached terminal window
- **Control**: The orchestrator applies scope-based policies and escalates uncertain decisions to the user
- **Safety**: Destructive operations are blocked by default; only task-relevant actions are approved

The user interacts **only** with the orchestrator. Workers never prompt the user directly.

### Rate limiting

- Running multiple Claude Code instances may trigger API rate limits
- Running multiple Codex instances may trigger OpenAI rate limits
- Consider staggering worker launches by a few seconds
- If rate-limited, reduce the number of parallel workers

### Known limitations

- ANSI escape code stripping is best-effort — some agent CLIs use non-standard sequences
- `capture-pane` has a scrollback limit (default ~2000 lines) — very long outputs may be truncated
- Workers cannot communicate with each other directly — all coordination goes through the orchestrator

## Script Reference

All scripts are in `${CLAUDE_SKILL_DIR}/scripts/`. Each script is a pure transport layer — no intelligence, no state detection.

| Script | Purpose | Usage |
|--------|---------|-------|
| `orchestrator.sh` | Create session + open viewer terminal | `orchestrator.sh <session> [--attach]` |
| `ensure_tmux_env.sh` | PreToolUse hook: auto-check/install tmux | (auto-invoked) |
| `worker-setup.sh` | Create worktree + tmux window + launch agent | `worker-setup.sh <session> <window> "<launch-cmd>" [base-branch]` |
| `worker-send.sh` | Send a prompt to a worker | `worker-send.sh <session>:<window> "<prompt>"` |
| `worker-read.sh` | Read worker output (raw text) | `worker-read.sh <session>:<window> [--lines N]` |
| `worker-approve.sh` | Send a key to a worker | `worker-approve.sh <session>:<window> <key>` |
| `worker-teardown.sh` | Cleanup worker | `worker-teardown.sh <session> <window> [--keep-worktree]` |
| `strip-ansi.sh` | Remove ANSI escapes from text | `echo "text" \| strip-ansi.sh` |
