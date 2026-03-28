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
- **External CLI agents** (Codex, Gemini CLI, Claude CLI, OpenCode) via the `cli-agents` skill

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
    ├── Worker 1 [native sub-agent or CLI exec] → output A  ┐
    ├── Worker 2 [native sub-agent or CLI exec] → output B  ┘ (parallel)
    │
    └── Critic [self-evaluate or separate agent/model]
              ↓
        PASS → deliver  |  FAIL → inject previous output + feedback → re-run workers
```

**Native sub-agent**: use your orchestrator's built-in sub-agent capability
(e.g., Agent tool in Claude Code, sub-session in Codex). Output is returned
directly — no files, no polling.

**CLI exec**: run any AI CLI tool via `codex exec`, `gemini -p`, `claude -p`, etc.
Output goes to a file; orchestrator reads it after the process exits.

Keep process files separate from deliverables. Worker drafts, prompts, critic
verdicts, and feedback notes should live in a dedicated run directory. Only the
final accepted deliverable should be written to the user-facing destination.

You own the loop. Workers execute; Critic evaluates; you bridge feedback between them.

## Phase 0: Define the Task and Rubric

Before starting, clarify two things. For tasks where the scope isn't fully
specified, propose the decomposition and rubric to the user before launching
workers — it's cheap to adjust before work starts, expensive after.

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

### Option A — Native sub-agents (default)

Use your orchestrator's built-in sub-agent capability. In Claude Code, this is
the `Agent` tool; in Codex, start a sub-session. The sub-agent completes and
returns output directly — no Bash, no files, no polling.

```
Sub-agent call:
  prompt: "Your task: <subtask>. Requirements: <...>. Return your complete output."
  run_in_background: true  ← for parallel workers
```

For parallel workers, spawn multiple sub-agent calls simultaneously. Each
result arrives as the corresponding sub-agent completes.

### Option B — External CLI agents (when user specifies: "用 Codex", "让 Gemini 跑")

Use the `cli-agents` skill pattern. Write the prompt to a temp file, invoke the CLI tool,
read the output file.

```bash
RUN_DIR=$(mktemp -d /tmp/critic-loop-run-XXXXXX)

cat > "$RUN_DIR/w1-prompt.txt" << EOF
Your task: <specific subtask>
Requirements: <...>
Save output to $RUN_DIR/w1-output.md when complete.
Treat that file as a working draft, not the final user delivery artifact.
EOF

codex exec --full-auto -C /path/to/worker-1-worktree "$(cat "$RUN_DIR/w1-prompt.txt")"
# run_in_background: true  ← for parallel workers
```

For code-producing parallel workers, give each CLI agent its own worktree or
isolated checkout. See `cli-agents` skill for Codex, Gemini CLI, Claude CLI,
and OpenCode syntax.

Independent workers run in parallel (background calls); sequential workers run one after
another (synchronous calls).

## Phase 2: Prepare the Critic

The Critic is:

- **Self-evaluation** (default): after workers finish, evaluate output directly
  using the rubric. No extra agent needed. Skip the template below.
- **A separate CLI agent** (when user specifies: "用 Codex 评审", "让 Gemini 来判断"):
  run `codex exec` / `gemini` with the critic prompt. This provides the strongest
  evaluator independence (different model, different context entirely).

For the CLI agent path, prepare the critic prompt template in advance:

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

Wait for all worker tasks to complete, then evaluate against the rubric.

### Option A — self-evaluation (default)

For native sub-agents: results are in the tool responses. Read them and apply
the rubric directly. No file I/O needed.

For CLI workers: read the output files, then evaluate:

```bash
W1=$(cat "$RUN_DIR/w1-output.md" 2>/dev/null || echo "ERROR: w1 output missing")
W2=$(cat "$RUN_DIR/w2-output.md" 2>/dev/null || echo "ERROR: w2 output missing")
echo "W1 length: ${#W1} chars"
echo "W2 length: ${#W2} chars"
```

Apply the rubric yourself and produce the VERDICT format from Phase 2.

### Option B — separate critic agent

Reference worker output files by path — don't embed their content inline to
avoid shell expansion issues:

```bash
cat > "$RUN_DIR/critic-prompt.txt" << 'EOF'
[paste critic prompt template here]
EOF
# Append worker outputs by file reference in the prompt, or tell the agent to read them:
# "Read $RUN_DIR/w1-output.md and $RUN_DIR/w2-output.md, then evaluate against the rubric."

codex exec --full-auto -o "$RUN_DIR/verdict.txt" "$(cat "$RUN_DIR/critic-prompt.txt")"
cat "$RUN_DIR/verdict.txt"
```

## Phase 4: Feedback Bridge (on FAIL)

Never send the raw critic verdict to workers. Translate it into clean revision prompts.
Workers need direction, not judgment.

**Map failing criteria to responsible workers.** Only send revision prompts to workers
whose subtask has failing criteria. Workers whose subtasks fully passed are done.

Revision prompt — reference previous output by file path to avoid shell
expansion issues with agent-generated content:

```bash
# Write the feedback to a file
cat > "$RUN_DIR/w1-feedback.txt" << 'EOF'
- <specific improvement 1 from critic>
- <specific improvement 2 from critic>
EOF

# Tell the worker to read its own previous output and the feedback
codex exec --full-auto -C /path/to/workdir \
  "Read $RUN_DIR/w1-output.md (your previous draft) and $RUN_DIR/w1-feedback.txt (what needs to change). Revise the draft to address all feedback. Preserve everything that already works. Overwrite $RUN_DIR/w1-output.md when done."
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

**Keep run artifacts contained.** Use a dedicated run directory such as
`/tmp/critic-loop-run-<timestamp>/` for prompts, draft outputs, verdicts, and
feedback. Do not scatter process files through the project root. Only publish
the final accepted artifact to the destination the user asked for.

**Carry context explicitly.** Neither CLI agents nor native sub-agents retain state between
calls. Always inject the previous output into revision prompts.

**Escalate early.** Two consecutive rounds with the same failing criterion → it's a scope
or rubric problem. Ask the user before iterating further.

**Track iteration count.** Maintain a counter (e.g., "Iteration 1/3"). Enforce the
max-iterations stop condition yourself.
