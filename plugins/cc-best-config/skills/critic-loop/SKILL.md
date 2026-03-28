---
name: critic-loop
description: >
  Orchestrate a multi-agent quality loop: N Worker agents execute subtasks while a
  dedicated Critic agent evaluates output against a rubric and drives iterative refinement
  until all criteria pass. Use this skill for any non-trivial task where output quality
  matters and a second-opinion review would improve results — research reports, technical
  specs, code with design decisions, runbooks, RFCs, competitive analyses, and similar
  deliverables. Trigger explicitly when the user mentions review, critic, or quality
  ("有 review 机制", "加一个审查", "critic agent", "reviewer agent", "let another agent
  review it", "让另一个 agent 来评估", "不要低估自己的输出", "quality gate",
  "have it reviewed before delivering", "make sure the quality is high"). Also trigger
  proactively when ALL of the following are true: (1) the task has multiple independent
  quality dimensions (e.g. coverage AND accuracy AND structure), (2) the user has
  indicated the output matters (deadline, stakeholder, integration), and (3) a missed gap
  would require non-trivial rework. Do NOT trigger on routine multi-step tasks that lack
  explicit quality stakes.
  Do NOT use for tiny one-liner changes or simple questions.
  Do NOT use when quality is measured by a scriptable numeric metric — use auto-research
  instead (auto-research already has its own evaluation loop).
---

# Critic Loop

LLMs overestimate their own output quality. When asked to self-review, they
disproportionately report "no issues" or "only minor issues." The architectural fix is to
separate the producer from the evaluator: give the evaluator a distinct identity, explicit
criteria, and no knowledge of who produced the output. Loop until the evaluator is
satisfied.

This skill layers on top of `tmux-orchestrator`. The tmux layer handles all infrastructure
(sessions, worktrees, sending/reading prompts, approving tool calls). This skill adds:
Critic definition, rubric-based evaluation, and a feedback bridge that turns rejection
into actionable revision instructions.

## When to use

| Use critic-loop | Use auto-research instead |
|---|---|
| Quality is judged by criteria (completeness, accuracy, depth, structure) | Quality is measured by a script (test pass rate, benchmark score, coverage %) |
| Output is research, documentation, code with design decisions, analysis | Output is an algorithm or config optimized against a numeric target |
| User wants a "second opinion" from a differently-prompted evaluator | User wants to keep iterating until a metric crosses a threshold |

## Architecture

```
You (Orchestrator)
    │
    ├─── Worker w1   ── executes subtask A ──┐
    ├─── Worker w2   ── executes subtask B ──┤ (all output combined)
    │    ...                                 │
    └─── Critic  ←──────────────────────────┘
              ── evaluates ALL worker output against rubric
                              ↓
                    PASS → deliver  |  FAIL → bridge feedback → Workers revise
```

You own the loop. Workers execute; Critic evaluates; you bridge feedback between them.

## Phase 0: Define the Task and Rubric

Before launching anything, clarify two things — and confirm with the user before proceeding.

**Task decomposition**: Break the user's request into subtasks. Each Worker gets one
self-contained subtask. Identify which can run in parallel vs. which must be sequential.

**Critic rubric**: Define what "good enough" looks like. Derive criteria from the task.
If the user hasn't specified criteria, propose a rubric and confirm it.

Example rubric for a research task:
```
1. Coverage — all major subtopics addressed with evidence
2. Depth — no surface-level summaries; claims are supported
3. Accuracy — no factual errors or unsupported assertions
4. Structure — clear sections, logical flow, actionable conclusions
5. Sources — authoritative sources cited where appropriate
```

The rubric is the Critic's contract. Make it explicit before any Worker starts.

## Pre-flight Checklist

Before running any infrastructure commands, verify these or they will fail silently:

```bash
# 1. tmux installed? (orchestrator.sh will error clearly if not, but check early)
command -v tmux || { echo "Install: brew install tmux (Mac) or apt-get install tmux"; exit 1; }

# 2. Inside a git repo? (worker-setup.sh requires git for worktrees)
#    If not: pass --init-git flag and worker-setup.sh auto-initializes.
#    Or: pass --no-worktree to skip worktrees entirely (no isolation, but works anywhere).
git rev-parse --show-toplevel 2>/dev/null || echo "Not a git repo — use --init-git or --no-worktree"
```

## Phase 1: Launch via tmux-orchestrator

Use the `tmux-orchestrator` skill for all infrastructure. The Critic is just a special
worker window whose job is evaluation, not execution.

```bash
# Resolve the tmux-orchestrator scripts path (run this first)
TMUX_SCRIPTS=$(find ~/.claude -path "*/tmux-orchestrator/scripts" -type d 2>/dev/null | head -1)

# Create session AND open a viewer terminal window the user can watch (--attach)
"${TMUX_SCRIPTS}/orchestrator.sh" critic-<task-name> --attach

# Launch Worker(s)
# --init-git: auto-init git repo if none exists (needed for worktrees)
"${TMUX_SCRIPTS}/worker-setup.sh" critic-<task-name> w1 "claude" HEAD --init-git
# Add more workers for independent subtasks
"${TMUX_SCRIPTS}/worker-setup.sh" critic-<task-name> w2 "claude" HEAD --init-git

# Launch Critic as its own worker window
"${TMUX_SCRIPTS}/worker-setup.sh" critic-<task-name> critic "claude" HEAD --init-git
```

`${TMUX_SCRIPTS}` = the tmux-orchestrator skill's `scripts/` directory, typically at
`~/.claude/plugins/marketplaces/cc-best-config/plugins/cc-best-config/skills/tmux-orchestrator/scripts/`.
Use the `find` command above to resolve it automatically.

**Agent-specific launch tips:**

| Agent | Recommended launch command | Why |
|-------|---------------------------|-----|
| `codex` | `codex --full-auto` | Reduces per-command approval prompts; use `-a never` if you want zero interruptions |
| `claude` | `claude` | Default is fine; Claude Code handles approvals gracefully |
| `gemini` | `gemini` | Default is fine |

`worker-setup.sh` automatically handles codex startup prompts (update notice, directory
trust) — it polls the pane and dismisses them before returning.

## Phase 2: Send Tasks to Workers

Each Worker gets a prompt with task, scope, functional requirements, and a done signal.
**Do not tell Workers about the Critic or the rubric** — evaluator independence requires
the Worker to produce its best effort without gaming the criteria.

```
You are working in a git worktree at: <path>
Branch: <branch>

## Your task
<specific subtask description>

## Scope
<files / directories / boundaries>

## What success looks like
<functional requirements — what the output must do or contain>

## Instructions
- Stay within your assigned scope
- Commit your output with a descriptive message
- When your draft is complete, output "WORKER DONE" on its own line
- Do not self-evaluate quality — a separate reviewer will assess it
```

## Phase 3: Prime the Critic

Send the Critic its evaluation context **while Workers are still running** — there is no
need to wait for them. Priming the Critic in parallel means it is ready the moment Workers
finish, with no idle gap between Phase 2 and Phase 4.

```
You are an independent reviewer. Your job is to find gaps and weaknesses — not to be
encouraging. Assume the output can be significantly improved.

## Task context
<brief description of what was asked>

## Your evaluation rubric
<paste the full rubric from Phase 0>

## Evaluation format
You will receive Worker output in the next message. Evaluate it and respond ONLY in
this format:

VERDICT: PASS | FAIL

CRITERION SCORES:
- [criterion name]: PASS | FAIL — [one-sentence reason]
- [criterion name]: PASS | FAIL — [one-sentence reason]
...

REQUIRED IMPROVEMENTS (include only if FAIL):
- [specific, actionable improvement 1]
- [specific, actionable improvement 2]
...

A PASS means the output meets all criteria well enough to deliver.
If any single criterion fails, the overall verdict must be FAIL.
When in doubt, FAIL — erring toward quality is the point of this role.
```

## Phase 4: Submit Output to Critic

### Polling strategy

Run the poll loop as a **background Bash task** (set `run_in_background: true` on the
Bash tool call). This lets Claude stop blocking and get notified when workers finish,
rather than sleeping in a loop.

```bash
# BACKGROUND TASK: poll all workers until each signals WORKER DONE
# Run this with run_in_background: true so Claude is notified on completion.
#
# IMPORTANT — notification timing:
#   The "task complete" notification appears in Claude's context on the NEXT
#   user message turn after the task finishes. For tasks > ~5 min, ask the user
#   to send a message like "done?" when they see the workers finish in tmux.
#   For tasks < 5 min, the notification usually fires within the same turn.
#
# WARNING: do NOT run a manual poll simultaneously — two concurrent pollers
#          will both send to the same tmux pane and corrupt the session.

POLL_STATUS_FILE="/tmp/critic-<task-name>-done.txt"
MAX_POLLS=120  # 120 × 15s = 30 min total timeout

for win in w1 w2; do
  polls=0
  echo "Polling ${win}..."
  while true; do
    output=$("${TMUX_SCRIPTS}/worker-read.sh" "critic-<task-name>:${win}" --lines 80)

    # WORKER DONE detection — must appear AFTER the codex separator line (────)
    # This avoids false positives from the prompt text itself containing "WORKER DONE".
    # The separator appears after the agent's final response block.
    after_separator=$(echo "${output}" | awk '/^────/{found=1} found{print}')
    if echo "${after_separator}" | grep -q "WORKER DONE"; then
      echo "${win}: DONE" | tee -a "$POLL_STATUS_FILE"
      break
    fi

    # Auto-approve tool confirmations — ONLY when NOT using codex --full-auto or -a never.
    # When using codex --full-auto, omit this block entirely; sending unsolicited
    # keys to a codex session causes the "y → WORKER DONE → y → WORKER DONE" loop.
    # if echo "${output}" | grep -qE "Do you want to allow|proceed\? \(y"; then
    #   "${TMUX_SCRIPTS}/worker-approve.sh" "critic-<task-name>:${win}" y
    #   sleep 2; continue
    # fi

    polls=$((polls + 1))
    if [ "${polls}" -ge "${MAX_POLLS}" ]; then
      echo "ERROR: worker ${win} timed out after $((MAX_POLLS * 15))s" | tee -a "$POLL_STATUS_FILE"
      break
    fi
    sleep 15
  done
done

echo "ALL_WORKERS_DONE" >> "$POLL_STATUS_FILE"
```

After launching the background task:
- For short tasks (< 5 min): Claude is notified automatically on the next turn.
- For long tasks (> 5 min): ask the user to send a message when they see workers finish
  in their tmux window. The background task status file at `$POLL_STATUS_FILE` always
  has the ground truth.

**Do not** run manual `worker-read.sh` checks while the background poll is running.

### Send output to Critic

Collect worker output from committed files (preferred) or pane output, then send to Critic.

**Important**: `worker-send.sh` accepts the prompt as `$2` argument OR via stdin. Both work:

```bash
# Option A: argument (works for any length)
CRITIC_INPUT="Here is the Worker output:\n\n$(cat /path/to/output.md)"
"${TMUX_SCRIPTS}/worker-send.sh" "critic-<task-name>:critic" "$CRITIC_INPUT"

# Option B: stdin pipe (also works)
printf 'Here is the Worker output:\n\n%s' "$(cat /path/to/output.md)" | \
  "${TMUX_SCRIPTS}/worker-send.sh" "critic-<task-name>:critic"
```

Read the Critic's verdict:

```bash
# Poll for verdict (also run as background task if critic may take a while)
MAX_POLLS=30
polls=0
while true; do
  output=$("${TMUX_SCRIPTS}/worker-read.sh" critic-<task-name>:critic --lines 80)
  if echo "${output}" | grep -q "VERDICT:"; then
    echo "${output}" | grep -A 20 "VERDICT:"
    break
  fi
  polls=$((polls + 1))
  [ "${polls}" -ge "${MAX_POLLS}" ] && { echo "Critic timed out"; break; }
  sleep 15
done
```

## Phase 5: Feedback Bridge (on FAIL)

Never forward the Critic's raw verdict to Workers. Translate it into clean revision
prompts. Workers need concrete direction, not a judgment.

**Multi-worker routing**: When multiple Workers each own a distinct subtask, map each
failing criterion back to the Worker responsible for it. Only that Worker receives a
revision prompt; Workers whose subtasks fully passed are not disturbed.

```
# For each Worker whose subtask has failing criteria:
Worker <wN> is responsible for: <subtask description>
Failing criteria that fall within their scope: <list>
→ send them a targeted revision prompt

# For Workers whose subtask fully passed:
→ no action; they are done
```

Revision prompt template (one per affected Worker):

```
Your previous draft was reviewed and did not pass quality review.

## What needs to change
<translate each REQUIRED IMPROVEMENT that falls within your scope into a specific,
actionable directive>

## What to preserve
<list the criteria that PASSED within your scope — do not change these>

## Instructions
- Address every issue listed above
- Do not touch sections that already passed review
- Commit your revised output and output "WORKER DONE" again
```

Then repeat from Phase 4 (polling only the Workers that were asked to revise).

## Stop Conditions

| Condition | Action |
|---|---|
| Critic returns `VERDICT: PASS` | Proceed to Phase 6 |
| Max iterations reached (default: 3) | Report to user; ask whether to continue or accept current best. Then teardown each window: `for win in w1 w2 critic; do "${TMUX_SCRIPTS}/worker-teardown.sh" critic-<task-name> "$win"; done` |
| Same criterion fails 2+ consecutive rounds | Escalate — likely a scope or rubric mismatch, not an execution problem |
| Worker blocked on a specific issue | Escalate to user for clarification |

Do not stop because a single iteration failed. Diagnose the specific block, send sharper
instructions, or escalate. The loop ends only when the Critic passes or a declared stop
condition fires.

## Phase 6: Aggregate and Deliver

When all Workers pass the Critic:

1. Merge Worker branches using tmux-orchestrator's Phase 5 merge strategy
2. Run any available verification (tests, linting)
3. Clean up workers and worktrees (teardown takes session + window name — call once per worker):
   ```bash
   for win in w1 w2 critic; do
     "${TMUX_SCRIPTS}/worker-teardown.sh" critic-<task-name> "$win"
   done
   ```
4. Deliver final output with a quality summary:

```
## Quality Summary

Task: <name>
Iterations: <N>

Final rubric scores:
- [criterion]: PASS
- ...

Key improvements across iterations:
- Iteration 1→2: <what changed and why>
```

## Orchestrator Rules

**You own the loop.** "The Critic returned" ≠ "done." You decide whether to loop again.

**Critic is adversarial by design.** A Critic that keeps passing everything is failing
its job. If the Critic seems too lenient, add to its prompt: "If in doubt, FAIL."

**Workers don't know about the Critic.** Evaluator independence is the whole point.
Workers produce their best against functional requirements, not against the rubric.

**Bridge, don't relay.** Never dump the raw Critic verdict into the Worker's prompt.
Translate criticism into actionable direction — the Worker should feel instructed, not judged.

**Escalate early.** Two consecutive rounds with the same failing criterion → it's a scope
or rubric problem. Ask the user before iterating further.

**Track iteration count.** Maintain a counter in your working notes (e.g., "Iteration 1/3").
Increment it every time you send Workers back for revision. Enforce the max-iterations stop
condition yourself — do not rely on memory across a long session.
