---
name: cli-agents
description: >
  Use any CLI-based AI agent (Codex, Gemini, Claude CLI, aider, etc.) as a
  sub-agent directly via Bash exec mode — no tmux, no polling, no WORKER DONE
  signals. The CLI tool runs to completion and exits; Claude reads the result
  and proceeds immediately. Multiple agents can run in parallel as background
  Bash tasks. Use this skill when the user wants to delegate subtasks to a
  specific AI CLI tool, or when building a multi-agent pipeline where different
  tools handle different steps. Trigger on: "用 Codex 来做", "让 Gemini 处理",
  "起几个子 Agent", "parallel agents", "delegate to codex", any request to
  orchestrate multiple AI CLI tools.
---

# CLI Agents — Any CLI Tool as a Sub-Agent

The simplest possible sub-agent pattern: run a CLI AI tool in non-interactive
(exec) mode via Bash. The process exits when done. No tmux, no polling, no
session management. Results go to a file; Claude reads the file and continues.

```
Main Claude (Orchestrator)
    │
    ├── Bash → codex exec "task A" → exits → /tmp/a.md     ← Codex sub-agent
    ├── Bash → gemini -p "task B" → exits → /tmp/b.md      ← Gemini sub-agent
    │         (parallel: both background tasks run at once)
    │
    └── Read /tmp/a.md + /tmp/b.md → continue orchestration
```

## CLI Adapter Reference

Each tool has an exec / non-interactive mode. Use these invocations:

### Codex
```bash
codex exec --full-auto \
  -C /path/to/workdir \
  -o /tmp/output.txt \
  "Your task prompt here"

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
claude -p "Your task prompt" > /tmp/output.txt 2>&1

# With specific tools allowed:
claude -p "Your task" --allowedTools "Bash,Read,Write" > /tmp/output.txt 2>&1
```

### aider
```bash
aider --message "Your task" \
  --yes-always \
  --no-pretty \
  --model gpt-4o \
  2>&1 | tee /tmp/output.txt
```

## Core Pattern: Single Sub-Agent (Synchronous)

For a single delegated task, run synchronously — Claude blocks until the CLI
tool finishes, then immediately reads the result. No polling needed.

```bash
# Step 1: Write the prompt to a file (avoids shell quoting issues for long prompts)
cat > /tmp/task-prompt.txt << 'EOF'
Your detailed task description here.
Save output to /tmp/result.md when done.
EOF

# Step 2: Run the CLI agent synchronously
codex exec --full-auto -C /path/to/workdir "$(cat /tmp/task-prompt.txt)"

# Step 3: Read the result
cat /tmp/result.md
```

Claude naturally proceeds after the Bash call returns. No WORKER DONE signal,
no tmux window, no pane parsing.

## Core Pattern: Parallel Sub-Agents

For independent subtasks, run as background Bash tasks. Claude is notified
when each one completes. Fast workers are detected immediately — a 2-minute
worker doesn't wait for a 10-minute worker.

```bash
# Launch all workers in parallel (each is a separate background Bash call)
# Claude tool call 1 (run_in_background: true):
codex exec --full-auto -C /workdir "Task A: research X. Save to /tmp/w1.md"

# Claude tool call 2 (run_in_background: true):
codex exec --full-auto -C /workdir "Task B: research Y. Save to /tmp/w2.md"

# Claude tool call 3 (run_in_background: true):
gemini -p "Task C: analyze Z. Save to /tmp/w3.md" > /dev/null 2>&1
```

Each background task fires a completion notification the moment its CLI process
exits. Claude processes each notification as it arrives and proceeds as soon as
all required tasks are done.

**To wait for all before continuing**, collect results after each notification:

```bash
# After receiving all background notifications, read results:
W1=$(cat /tmp/w1.md 2>/dev/null || echo "w1 missing")
W2=$(cat /tmp/w2.md 2>/dev/null || echo "w2 missing")
W3=$(cat /tmp/w3.md 2>/dev/null || echo "w3 missing")
echo "=== W1 ===" && echo "$W1"
echo "=== W2 ===" && echo "$W2"
echo "=== W3 ===" && echo "$W3"
```

## Core Pattern: Revision Loop (Multi-Round)

When output needs revision, pass the previous output explicitly in the new
prompt. The CLI tool doesn't retain state between calls — context is carried
by the orchestrator (Claude) and injected into each new prompt.

```bash
# Round 1
codex exec --full-auto -C /workdir \
  "Write a report on X. Save to /tmp/report.md."

# Read result + critic feedback (from Claude's own evaluation or another agent)
CURRENT_REPORT=$(cat /tmp/report.md)
CRITIC_FEEDBACK="Section 2 lacks citations. Add at least 3 sources."

# Round 2 — inject previous output + feedback into new prompt
cat > /tmp/revision-prompt.txt << EOF
Here is the current draft of the report:

--- CURRENT DRAFT ---
${CURRENT_REPORT}
--- END DRAFT ---

The following issues need to be fixed:
${CRITIC_FEEDBACK}

Rewrite the report addressing all issues. Save the revised version to /tmp/report.md.
EOF

codex exec --full-auto -C /workdir "$(cat /tmp/revision-prompt.txt)"
```

For large files, save the previous output to a known path and tell the agent
to read it: `"Read /tmp/report.md, then revise it to fix: [issues]. Overwrite the file."`

## Integrating with Critic Loop

Replace the tmux-based worker/critic infrastructure with CLI agent calls:

```
Phase 1: spawn workers (parallel background Bash calls)
  → codex exec "task A" -o /tmp/w1.md   [run_in_background: true]
  → codex exec "task B" -o /tmp/w2.md   [run_in_background: true]

Phase 2: wait for notifications, collect output
  → cat /tmp/w1.md && cat /tmp/w2.md

Phase 3: critic (synchronous — Claude itself, or another CLI agent)
  Option A: Claude evaluates directly (no sub-agent needed)
  Option B: codex exec "evaluate this output against rubric: ..." -o /tmp/verdict.txt

Phase 4: if FAIL → revision round (pass current output + feedback to new exec)
Phase 5: repeat until PASS or max iterations
```

## When to Use tmux Instead

The exec pattern covers most cases. Use tmux (via tmux-orchestrator skill)
only when:

1. **Session continuity matters**: the agent needs to remember its own tool call
   history across multiple revision rounds — not just the text output, but *what
   commands it ran and what it saw*. Passing large tool histories via prompt is
   impractical.

2. **Real-time user visibility**: the user explicitly wants to watch the agent
   work in a live terminal window.

3. **Interactive back-and-forth**: the task requires many small exchanges with
   the agent rather than one big prompt → result cycle.

For research, writing, code generation, and most automation tasks: exec mode
is simpler and sufficient.

## Orchestrator Rules

**Use output files, not stdout parsing.** Tell the agent to save results to a
specific path. Read that path after the call. Parsing terminal output is fragile.

**Write prompts to temp files for long tasks.** Shell quoting breaks on complex
multi-line prompts. `cat > /tmp/prompt.txt << 'EOF' ... EOF` then pass
`"$(cat /tmp/prompt.txt)"` to the CLI tool.

**One working directory per agent.** Use `-C /path` (codex) or `cd` to isolate
each agent's file operations. Agents writing to the same directory concurrently
can conflict.

**Claude is the critic by default.** For the evaluation step, Claude can evaluate
worker output directly — no need to spawn a separate critic agent. Only spawn a
separate critic when you want genuine evaluator independence (different model,
different system prompt, no shared context with the workers).
