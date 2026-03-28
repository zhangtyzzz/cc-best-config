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

Workers and Critic are either:
- **Native Claude sub-agents** (via the `Agent` tool) — default, simplest
- **External CLI agents** (Codex, Gemini, Claude CLI, aider) via the `cli-agents` skill

Use CLI agents when the user explicitly specifies one ("用 Codex 来跑", "让 Gemini 评审").
Otherwise, use Claude sub-agents or evaluate directly — no extra process needed.

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
    ├── Bash → CLI agent exec "task A" → /tmp/w1.md   (background, parallel)
    ├── Bash → CLI agent exec "task B" → /tmp/w2.md   (background, parallel)
    │         Each process exits when done; Claude notified immediately.
    │
    └── Critic evaluation (Claude itself, or another CLI agent exec)
              ↓
        PASS → deliver  |  FAIL → inject output + feedback → re-run workers
```

You own the loop. Workers execute; Critic evaluates; you bridge feedback between them.

## Phase 0: Define the Task and Rubric

Before starting, clarify two things.

**Task decomposition**: Break the request into subtasks. Identify which can run in
parallel (independent outputs) vs. sequential (B depends on A's output).

**Critic rubric**: Define what "good enough" looks like. Make it explicit.

```
Example rubric for a research task:
1. Coverage — all major subtopics addressed with evidence
2. Depth — no surface-level summaries; claims are supported
3. Accuracy — no factual errors or unsupported assertions
4. Structure — clear sections, logical flow, actionable conclusions
5. Sources — authoritative sources cited where appropriate
```

## Phase 1: Launch Workers

**Do not tell workers about the Critic or the rubric** — evaluator independence requires
workers to produce their best effort without gaming the criteria.

### Option A — Native Claude sub-agents (default)

Use the `Agent` tool. Claude blocks until the sub-agent completes and returns the result
directly — no Bash, no files, no polling.

```
Agent tool call:
  prompt: "Your task: <subtask>. Requirements: <...>. Return your complete output."
  run_in_background: true  ← for parallel workers
```

Results are returned in the Agent tool response. For parallel workers, spawn multiple
Agent calls simultaneously; Claude receives each result as it completes.

### Option B — External CLI agents (when user specifies: "用 Codex", "让 Gemini 跑")

Use the `cli-agents` skill pattern. Write the prompt to a temp file, invoke the CLI tool,
read the output file.

```bash
cat > /tmp/w1-prompt.txt << 'EOF'
Your task: <specific subtask>
Requirements: <...>
Save output to /tmp/w1-output.md when complete.
EOF

codex exec --full-auto -C /path/to/workdir "$(cat /tmp/w1-prompt.txt)"
# run_in_background: true  ← for parallel workers
```

See `cli-agents` skill for Gemini, Claude CLI, and aider syntax.

Independent workers run in parallel (background calls); sequential workers run one after
another (synchronous calls).

## Phase 2: Prime the Critic

Prime the Critic **while workers are running** — no need to wait. The Critic is:

- **Claude itself** (default): evaluate worker output directly. Most efficient.
- **A separate CLI agent** (when user specifies: "用 Codex 评审", "让 Gemini 来判断"):
  run `codex exec` / `gemini` with the critic prompt after workers finish. This provides
  the strongest evaluator independence (different model, different context entirely).

Critic prompt template (used in Phase 3):

```
You are an independent reviewer. Your job is to find gaps and weaknesses — not to be
encouraging. Assume the output can be significantly improved.

## Task context
<brief description of what was asked>

## Your evaluation rubric
<paste the full rubric from Phase 0>

## Worker output
<paste combined worker output here>

## Evaluation format
Respond ONLY in this exact format:

VERDICT: PASS | FAIL

CRITERION SCORES:
- [criterion name]: PASS | FAIL — [one-sentence reason]
...

REQUIRED IMPROVEMENTS (only if FAIL):
- [specific, actionable improvement 1]
...

If any single criterion fails, overall verdict must be FAIL. When in doubt, FAIL.
```

## Phase 3: Collect Output and Evaluate

Wait for all background worker tasks to complete (Claude is notified as each finishes),
then read their output files and run the critic.

```bash
# Read all worker outputs
W1=$(cat /tmp/w1-output.md 2>/dev/null || echo "ERROR: w1 output missing")
W2=$(cat /tmp/w2-output.md 2>/dev/null || echo "ERROR: w2 output missing")

echo "W1 length: ${#W1} chars"
echo "W2 length: ${#W2} chars"
```

**Option A — Claude evaluates directly** (default):
Read the worker outputs and apply the rubric yourself. Produce the VERDICT format above.

**Option B — separate critic agent**:
```bash
cat > /tmp/critic-prompt.txt << EOF
[paste critic prompt template with worker outputs injected]
EOF

codex exec --full-auto "$(cat /tmp/critic-prompt.txt)" -o /tmp/verdict.txt
cat /tmp/verdict.txt
```

## Phase 4: Feedback Bridge (on FAIL)

Never send the raw critic verdict to workers. Translate it into clean revision prompts.
Workers need direction, not judgment.

**Map failing criteria to responsible workers.** Only send revision prompts to workers
whose subtask has failing criteria. Workers whose subtasks fully passed are done.

Revision prompt template:

```bash
CURRENT_OUTPUT=$(cat /tmp/w1-output.md)

cat > /tmp/w1-revision.txt << EOF
Your previous draft needs revision.

Here is what you wrote:
--- PREVIOUS OUTPUT ---
${CURRENT_OUTPUT}
--- END ---

What needs to change:
- <specific improvement 1 from critic>
- <specific improvement 2 from critic>

What to preserve (do not change):
- <criteria that passed>

Save the revised output to /tmp/w1-output.md (overwrite).
EOF

codex exec --full-auto -C /path/to/workdir "$(cat /tmp/w1-revision.txt)"
```

Then repeat Phase 3 (collect + evaluate) for the revised output.

## Stop Conditions

| Condition | Action |
|---|---|
| Critic returns `VERDICT: PASS` | Proceed to Phase 5 |
| Max iterations reached (default: 3) | Report to user; ask whether to continue or accept current best |
| Same criterion fails 2+ consecutive rounds | Escalate — likely a scope or rubric mismatch |
| Worker output file missing or empty | Check CLI agent exit code; re-run or escalate |

## Phase 5: Deliver

When all criteria pass:

1. Read final output files
2. Assemble and deliver to user
3. Include a quality summary:

```
## Quality Summary

Task: <name>
Iterations: <N>

Final rubric scores:
- [criterion]: PASS — [reason]
...

Key improvements across iterations:
- Iteration 1→2: <what changed and why>
```

## Orchestrator Rules

**You own the loop.** Workers execute; you decide when to accept and when to revise.

**Critic is adversarial by design.** If the Critic seems too lenient, add: "When in
doubt, FAIL — erring toward quality is the point of this role."

**Workers don't know about the Critic.** Evaluator independence is the whole point.

**Bridge, don't relay.** Never dump raw critic output into the worker prompt. Translate
criticism into specific, actionable directives. Workers should feel instructed, not judged.

**Carry context explicitly.** Neither CLI agents nor native sub-agents retain state between
calls. Always inject the previous output into revision prompts.

**Escalate early.** Two consecutive rounds with the same failing criterion → it's a scope
or rubric problem. Ask the user before iterating further.

**Track iteration count.** Maintain a counter (e.g., "Iteration 1/3"). Enforce the
max-iterations stop condition yourself.
