---
name: cli-agents
description: >
  Use CLI based AI tools such as Codex, Gemini CLI, Claude CLI, or OpenCode as
  sub agents through direct Bash exec. Each agent runs to completion, writes its
  result, and exits, so there is no tmux, polling, or session bookkeeping. Use
  this skill when the user wants to delegate work to a specific AI CLI, run
  several agents in parallel, or build a multi agent pipeline with different
  tools handling different steps. Trigger on requests like "用 Codex 来做", "让
  Gemini 处理", "起几个子 Agent", "parallel agents", or "delegate to codex".
---

# CLI Agents — Any CLI Tool as a Sub-Agent

The simplest possible sub-agent pattern: run a CLI AI tool in non-interactive
(exec) mode via Bash. The process exits when done. No tmux, no polling, no
session management. Results go to a file; Claude reads the file and continues.

Keep process files separate from deliverables. Prompts, intermediate outputs,
critic notes, logs, and revision instructions belong in a dedicated run
directory. Only the final user-facing artifact should be written to the target
path the user actually asked for.

```
Main Claude (Orchestrator)
    │
    ├── Bash → codex exec "task A" → exits → /tmp/a.md     ← Codex sub-agent
    ├── Bash → gemini -p "task B" → exits → /tmp/b.md      ← Gemini sub-agent
    │         (parallel: both background tasks run at once)
    │
    └── Read /tmp/a.md + /tmp/b.md → continue orchestration
```

## Session Persistence (NEW)

**Claude Code supports native session persistence.** You can resume a previous
CLI agent session with full context intact — no need to re-send the entire
conversation history.

### How It Works

1. **Capture session ID**: Use `--output-format json` to get the `session_id`
2. **Save session ID**: Store it in a state file for later lookup
3. **Resume session**: Use `--resume <session_id>` to continue with context

```bash
# Round 1: Create session and capture ID
RESULT=$(claude -p "Analyze the codebase and list all API endpoints" \
    --output-format json)
SESSION_ID=$(echo "$RESULT" | jq -r '.session_id')
echo "$SESSION_ID" > "$RUN_DIR/session.id"

# Round 2: Resume with full context
claude -p "Now create a markdown document summarizing the endpoints" \
    --resume "$(cat "$RUN_DIR/session.id")" \
    --output-format json | jq -r '.result'
```

### State Management Script

Use the provided script to track sessions across a multi-round workflow:

```bash
# Initialize state
"$SKILL_DIR/scripts/cli-agent-state.sh" init "$RUN_DIR"

# Save session after each round
SESSION_ID=$(claude -p "$PROMPT" --output-format json | jq -r '.session_id')
"$SKILL_DIR/scripts/cli-agent-state.sh" save "$RUN_DIR" "$SESSION_ID" "claude" "$PROMPT"

# Get latest session for resume
LATEST_ID=$("$SKILL_DIR/scripts/cli-agent-state.sh" latest "$RUN_DIR" "claude")
```

### Session Resume Pattern

For multi-round workflows where context should carry forward:

```bash
RUN_DIR=$(mktemp -d /tmp/cli-agent-run-XXXXXX)
PROMPT_FILE="$RUN_DIR/task.txt"

# Round 1: Initial task
cat > "$PROMPT_FILE" << 'EOF'
Analyze the authentication module in src/auth/.
List all security concerns you find.
EOF

RESULT=$(claude -p "$(cat "$PROMPT_FILE")" --output-format json)
SESSION_ID=$(echo "$RESULT" | jq -r '.session_id')
echo "$SESSION_ID" > "$RUN_DIR/session.id"
echo "$RESULT" | jq -r '.result' > "$RUN_DIR/round1.md"

# Round 2: Follow-up with context (agent remembers Round 1)
cat > "$PROMPT_FILE" << 'EOF'
Based on your analysis, create a security report.
Include specific code locations and remediation steps.
EOF

claude -p "$(cat "$PROMPT_FILE")" \
    --resume "$(cat "$RUN_DIR/session.id")" \
    --output-format json | jq -r '.result' > "$RUN_DIR/final-report.md"
```

### Session ID Control

You can pre-specify a session ID for deterministic tracking:

```bash
# Generate a valid UUID (macOS/Linux)
SESSION_UUID=$(uuidgen)  # macOS
# or: SESSION_UUID=$(cat /proc/sys/kernel/random/uuid)  # Linux

# Or use a fixed UUID for testing/deterministic workflows
SESSION_UUID="00000000-0000-0000-0000-000000000001"

# Use this ID for the session
claude -p "Initial task" --session-id "$SESSION_UUID" --output-format json

# Later, resume by this known ID
claude -p "Continue" --resume "$SESSION_UUID"
```

## CLI Adapter Reference

Each tool has an exec / non-interactive mode. Use these invocations:

### Codex (OpenAI)
```bash
# Exec mode (one-shot, no persistence)
codex exec --full-auto \
  -C /path/to/workdir \
  -o /tmp/output.txt \
  "Your task prompt here"

# Resume previous session (Codex uses subcommand syntax)
codex exec resume --last \
  -C /path/to/workdir \
  -o /tmp/output.txt \
  "Continue the previous task"

# Or resume a specific session by ID
codex exec resume <session-uuid> \
  -C /path/to/workdir \
  "Continue with specific session"

# Flags:
#   --full-auto          No approval prompts; workspace writes allowed
#   -C <dir>             Working directory for the agent
#   -o <file>            Write final agent message to this file
#   -a never             Zero approvals (alternative to --full-auto)
#   --skip-git-repo-check  Allow running outside a git repo
```

### Gemini CLI
```bash
gemini -p "Your task prompt" > /tmp/output.txt 2>&1

# Or with a file containing the prompt:
gemini < /tmp/prompt.txt > /tmp/output.txt 2>&1
```

### Claude CLI
```bash
# One-shot execution
claude -p "Your task prompt" > /tmp/output.txt 2>&1

# With JSON output (captures session_id)
claude -p "Your task prompt" --output-format json | jq -r '.session_id, .result'

# Resume previous session
claude -p "Continue from where we left off" --resume "<session-id>"

# Pre-specify session ID
claude -p "Your task" --session-id "<uuid>" --output-format json

# With specific tools allowed:
claude -p "Your task" --allowedTools "Bash,Read,Write" > /tmp/output.txt 2>&1
```

### OpenCode
```bash
opencode run "Your task prompt" > /tmp/output.txt 2>&1

# With a specific model:
opencode run --model anthropic/claude-sonnet-4-5 "Your task" > /tmp/output.txt 2>&1
```

## Core Pattern: Single Sub-Agent (Synchronous)

For a single delegated task, run synchronously — Claude blocks until the CLI
tool finishes, then immediately reads the result. No polling needed.

```bash
RUN_DIR=$(mktemp -d /tmp/cli-agent-run-XXXXXX)

# Step 1: Write the prompt to a file (avoids shell quoting issues for long prompts)
cat > "$RUN_DIR/task-prompt.txt" << EOF
Your detailed task description here.
Write any scratch output to $RUN_DIR/result.md.
Do not write the final deliverable anywhere else unless explicitly requested.
EOF

# Step 2: Run the CLI agent synchronously
codex exec --full-auto -C /path/to/workdir "$(cat "$RUN_DIR/task-prompt.txt")"

# Step 3: Read the process output, then decide what to deliver
cat "$RUN_DIR/result.md"
```

Claude naturally proceeds after the Bash call returns. No WORKER DONE signal,
no tmux window, no pane parsing.

## Core Pattern: Parallel Sub-Agents

For independent subtasks, run as background Bash tasks. Claude is notified
when each one completes. Fast workers are detected immediately — a 2-minute
worker doesn't wait for a 10-minute worker.

If workers may edit files, give each one its own worktree or workdir first.
Do not run parallel code-producing agents against the same checkout.

```bash
RUN_DIR=$(mktemp -d /tmp/cli-agent-run-XXXXXX)

# Example: create isolated worktrees for code-producing workers
WT_A=$(mktemp -d /tmp/cli-agent-wt-a-XXXXXX)
WT_B=$(mktemp -d /tmp/cli-agent-wt-b-XXXXXX)
git worktree add "$WT_A" HEAD
git worktree add "$WT_B" HEAD

# Launch all workers in parallel (each is a separate background Bash call)
# Claude tool call 1 (run_in_background: true):
codex exec --full-auto -C "$WT_A" \
  "Task A: implement X in this worktree. Save a short summary to $RUN_DIR/w1.md"

# Claude tool call 2 (run_in_background: true):
codex exec --full-auto -C "$WT_B" \
  "Task B: implement Y in this worktree. Save a short summary to $RUN_DIR/w2.md"

# Claude tool call 3 (run_in_background: true):
gemini -p "Task C: analyze Z. Save to $RUN_DIR/w3.md" > "$RUN_DIR/w3-gemini.log" 2>&1
```

Each background task fires a completion notification the moment its CLI process
exits. Claude processes each notification as it arrives and proceeds as soon as
all required tasks are done.

**To wait for all before continuing**, collect results after each notification:

```bash
# After receiving all background notifications, read results:
W1=$(cat "$RUN_DIR/w1.md" 2>/dev/null || echo "w1 missing")
W2=$(cat "$RUN_DIR/w2.md" 2>/dev/null || echo "w2 missing")
W3=$(cat "$RUN_DIR/w3.md" 2>/dev/null || echo "w3 missing")
echo "=== W1 ===" && echo "$W1"
echo "=== W2 ===" && echo "$W2"
echo "=== W3 ===" && echo "$W3"
```

## Core Pattern: Revision Loop (Multi-Round)

When output needs revision, you have two options:

### Option A: File Reference (Context carried by orchestrator)

Reference the previous output by file path and pass the critic feedback by file.
The CLI tool doesn't retain state between calls — context is carried by the
orchestrator and injected into each new prompt.

```bash
RUN_DIR=$(mktemp -d /tmp/cli-agent-run-XXXXXX)

# Round 1
codex exec --full-auto -C /workdir \
  "Write a report on X. Save the draft to $RUN_DIR/report.md."

# Round 2 — reference the previous output file and feedback file
cat > "$RUN_DIR/feedback.txt" << 'EOF'
Section 2 lacks citations. Add at least 3 sources.
EOF

codex exec --full-auto -C /workdir \
  "Read $RUN_DIR/report.md and $RUN_DIR/feedback.txt. Revise the report to address all feedback. Overwrite $RUN_DIR/report.md when done."
```

**Why reference by file path instead of embedding the content:**
Embedding `$(cat "$RUN_DIR/report.md")` inside a shell heredoc risks executing
`$(...)` expressions that appear in the agent's output. File references avoid
this entirely and work for any output size.

### Option B: Session Resume (Context preserved in session)

Use session resume to continue the same conversation. The agent remembers
everything from previous rounds without re-sending context.

```bash
RUN_DIR=$(mktemp -d /tmp/cli-agent-run-XXXXXX)

# Round 1: Create session
RESULT=$(claude -p "Write a report on X. Save to $RUN_DIR/report.md" \
    --output-format json)
SESSION_ID=$(echo "$RESULT" | jq -r '.session_id')
echo "$SESSION_ID" > "$RUN_DIR/session.id"
echo "$RESULT" | jq -r '.result'

# Round 2: Resume session (agent remembers Round 1 context)
claude -p "Section 2 lacks citations. Add at least 3 sources to your report." \
    --resume "$(cat "$RUN_DIR/session.id")" \
    --output-format json | jq -r '.result'
```

**When to use which:**
- **File reference**: When using tools without session persistence (Codex exec,
  Gemini), or when you want to curate what context to pass
- **Session resume**: When using Claude CLI and want full context continuity
  without re-sending large conversation histories

The same rule applies to feedback: avoid `${CRITIC_FEEDBACK}` or other shell
interpolation for model-generated text, because command substitutions and
backticks inside the feedback can execute locally before the CLI starts.

## Integrating with Critic Loop

Replace the tmux-based worker/critic infrastructure with CLI agent calls:

```
Phase 1: spawn workers (parallel background Bash calls)
  → codex exec "task A" -o <run-dir>/w1.md   [run_in_background: true]
  → codex exec "task B" -o <run-dir>/w2.md   [run_in_background: true]

Phase 2: wait for notifications, collect output
  → cat <run-dir>/w1.md && cat <run-dir>/w2.md

Phase 3: critic (synchronous — Claude itself, or another CLI agent)
  Option A: Claude evaluates directly (no sub-agent needed)
  Option B: codex exec "evaluate this output against rubric: ..." -o <run-dir>/verdict.txt

Phase 4: if FAIL → revision round (pass current output + feedback to new exec)
Phase 5: repeat until PASS or max iterations
```

### With Session Persistence

For iterative refinement with the same agent:

```bash
# Worker session
WORKER_SESSION=$(claude -p "Implement feature X" --output-format json | jq -r '.session_id')

# Critic feedback
FEEDBACK="Missing error handling in the main function"

# Revision round (same session, remembers original implementation)
claude -p "The reviewer says: $FEEDBACK. Please fix this issue." \
    --resume "$WORKER_SESSION" --output-format json | jq -r '.result'
```

## Orchestrator Rules

**Use output files, not stdout parsing.** Tell the agent to save results to a
specific path. Read that path after the call. Parsing terminal output is fragile.

**Separate process files from deliverables.** Create one run directory per
orchestration attempt, such as `/tmp/cli-agent-run-<timestamp>/`, and keep
prompts, logs, worker drafts, critic verdicts, and feedback files there. Only
copy or write the final accepted artifact to the user-requested destination.

**Write prompts to temp files for long tasks.** Shell quoting breaks on complex
multi-line prompts. `cat > /tmp/prompt.txt << 'EOF' ... EOF` then pass
`"$(cat /tmp/prompt.txt)"` to the CLI tool.

**One working directory per agent.** Use `-C /path` (codex) or `cd` to isolate
each agent's file operations. For parallel code edits, create one git worktree
or equivalent isolated checkout per worker. Agents writing to the same
directory concurrently can conflict and corrupt the shared state.

**Claude is the critic by default.** For the evaluation step, Claude can evaluate
worker output directly — no need to spawn a separate critic agent. Only spawn a
separate critic when you want genuine evaluator independence (different model,
different system prompt, no shared context with the workers).

**Leverage session persistence for multi-round work.** When using Claude CLI,
capture `session_id` and use `--resume` to continue conversations. This avoids
re-sending large context and maintains agent memory of previous interactions.
