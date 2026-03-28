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

## Phase 1: Launch via tmux-orchestrator

Use the `tmux-orchestrator` skill for all infrastructure. The Critic is just a special
worker window whose job is evaluation, not execution.

```bash
# Resolve the tmux-orchestrator scripts path (run this first)
TMUX_SCRIPTS=$(find ~/.claude -path "*/tmux-orchestrator/scripts" -type d 2>/dev/null | head -1)
# If the above returns empty, try the plugin install path directly:
# TMUX_SCRIPTS=~/.claude/plugins/cc-best-config/skills/tmux-orchestrator/scripts

# Create session (opens a viewer terminal the user can watch)
"${TMUX_SCRIPTS}/orchestrator.sh" critic-<task-name> --attach

# Launch Worker(s)
"${TMUX_SCRIPTS}/worker-setup.sh" critic-<task-name> w1 "claude"
# Add more workers for independent subtasks
"${TMUX_SCRIPTS}/worker-setup.sh" critic-<task-name> w2 "claude"

# Launch Critic as its own worker window
"${TMUX_SCRIPTS}/worker-setup.sh" critic-<task-name> critic "claude"
```

`${TMUX_SCRIPTS}` = the tmux-orchestrator skill's `scripts/` directory, typically at
`~/.claude/plugins/cc-best-config/skills/tmux-orchestrator/scripts/`. Use the `find`
command above to resolve it automatically.

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

Wait for **all** Workers to signal `WORKER DONE` before submitting to the Critic. Poll
each window in a loop:

```bash
# Poll all worker windows until each prints WORKER DONE
# Adjust the window list to match your actual workers (e.g., "w1" for one, "w1 w2 w3" for three)
MAX_POLLS=60  # 60 × 10s = 10 min timeout per worker; adjust as needed
for win in w1 w2; do
  polls=0
  while true; do
    output=$("${TMUX_SCRIPTS}/worker-read.sh" "critic-<task-name>:${win}" --lines 50)
    echo "${output}" | grep -q "WORKER DONE" && break
    polls=$((polls + 1))
    if [ "${polls}" -ge "${MAX_POLLS}" ]; then
      echo "ERROR: worker ${win} timed out — escalate to user before continuing"
      exit 1
    fi
    sleep 10
  done
done
```

Only after all Workers are done, collect their output (read committed files or tmux pane
output) and send the combined result to the Critic:

```bash
# Note: worker-send.sh passes the string as-is to tmux; use printf for reliable newlines
printf 'Here is the Worker output for evaluation:\n\n%s' "<worker output>" | \
  "${TMUX_SCRIPTS}/worker-send.sh" "critic-<task-name>:critic"
```

Read the Critic's verdict:

```bash
"${TMUX_SCRIPTS}/worker-read.sh" critic-<task-name>:critic --lines 80
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
| Max iterations reached (default: 3) | Report to user; ask whether to continue or accept current best. Then teardown: `"${TMUX_SCRIPTS}/worker-teardown.sh" critic-<task-name>` |
| Same criterion fails 2+ consecutive rounds | Escalate — likely a scope or rubric mismatch, not an execution problem |
| Worker blocked on a specific issue | Escalate to user for clarification |

Do not stop because a single iteration failed. Diagnose the specific block, send sharper
instructions, or escalate. The loop ends only when the Critic passes or a declared stop
condition fires.

## Phase 6: Aggregate and Deliver

When all Workers pass the Critic:

1. Merge Worker branches using tmux-orchestrator's Phase 5 merge strategy
2. Run any available verification (tests, linting)
3. Clean up workers and worktrees: `"${TMUX_SCRIPTS}/worker-teardown.sh" critic-<task-name>`
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
