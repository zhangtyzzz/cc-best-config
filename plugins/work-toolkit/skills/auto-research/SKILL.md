---
name: auto-research
description: Set up an autonomous improvement loop for code, config, or content. The agent edits a target, runs an evaluation, and keeps iterating until a measurable metric improves or a stop condition is met. Use when the user wants repeated automatic attempts rather than one pass, especially for requests like "自动迭代优化", "keep trying until", "一轮一轮改到全部 pass", "auto-research", or "experiment loop". Trigger when the user provides both an editable target and a scriptable success metric such as test pass count, benchmark score, coverage, accuracy, bundle size, or validation loss.
---

# Auto Research

Anything with a cheap, automated verification mechanism can be iteratively improved by AI — indefinitely and without human intervention.

The core pattern: define what to improve, define how to measure improvement, then loop. The human's role is experimental designer — you set the direction, AI runs the experiments.

## When this works

This pattern requires two things:

1. **A single editable target** — a file, module, config, or content to iterate on
2. **A measurable standard** — a metric that objectively tells you "better" vs "worse"

The boundary of cheap verification is the boundary of this system. If you can script the evaluation, you can auto-research it.

**Good fits**: test pass rate, benchmark scores, validation loss, build time, code coverage, response accuracy, compression ratio, page load time — any numeric metric a script can produce.

**Poor fits**: subjective quality (prose style, visual design), metrics requiring human judgment, evaluations that take hours per run.

## Phase 0: Goal Contract (REQUIRED before any other work)

Vague goals are the #1 reason autonomous loops burn hours producing useless
work. Before touching code, fill in this five-item contract with the user.
If any item cannot be answered, the task is not yet ready for `auto-research`
— it is still in the prompt-design phase. Ask the user one question at a
time until all five are answered, or hand off to `pragmatic-engineering` to
shape the work first.

| # | Item | What it commits to |
|---|------|--------------------|
| 1 | **Measurable artifact** | The exact file or output that defines "done". Examples: `tests/auth pass count = 75/75`, `cargo build --release` produces zero warnings, `reports/eval.json score >= 0.85`. |
| 2 | **Verification command** | One shell command (or short pipeline) that produces the metric reproducibly. **Exit code semantics**: `0` = the command ran and produced a parseable metric, even when the metric misses the target; non-zero = catastrophic failure (compilation broke, harness crashed, output unparseable). The supervisor reads the metric from stdout, not from the exit code. Use `bash -o pipefail -c '...'` if your pipeline contains commands like `tee` whose exit code would otherwise mask earlier failures. |
| 3 | **Allowed write scope** | Exact paths the loop may modify, plus the loop's own bookkeeping (`iteration_log.md`, the experiment branch, any generated eval script). Everything else is read-only. The supervisor MUST run `git diff --name-only` after each worker checkpoint and revert any out-of-scope edits. Example user-supplied scope: `src/auth/**`, `tests/auth/**`. |
| 4 | **Stop signal** | A non-git marker that proves the supervisor's success check, distinct from "metric hit target" (which is necessary but not sufficient — the supervisor must still write the marker). Example: a final line in `iteration_log.md` of the form `AUTO-RESEARCH COMPLETE: <metric>=<value>`. Avoid using a commit message as the signal: in this repo commits only happen when the user explicitly asks. |
| 5 | **Pause condition** | What triggers a pause (state preserved, run can resume) **as opposed to** a stop. Stop = success was verified or the user cancelled. Pause = budget exhausted or external blocker hit. Examples: `iteration cap reached`, `wall-clock cap exceeded`, `N consecutive no-progress iterations`, `eval became too noisy`, `attempt requires paid action / approval`, `quota or API key exhausted`. The supervisor MUST classify each end state as stop vs pause; never report "complete" for a pause. |

> Persist the answered contract at the top of `iteration_log.md` (under a
> `## Goal Contract` heading) so a resumed run reads from the same source
> of truth instead of conversation context.

> This rubric is borrowed from the OpenAI Codex `/goal` experience. Any
> autonomous improvement loop — Codex's, ours, or anyone else's — fails the
> same way when run against a "loose list of unrelated work". The contract
> is the single highest-leverage thing you can get right.

## Phase 1: Setup

Phase 0 fixed the contract. Phase 1 turns each contract item into concrete
working materials. If you find yourself rewriting an item here, you didn't
finish Phase 0 — go back.

### Define the editable target (contract item 3)

What will the AI iterate on? Translate `Allowed write scope` into:
- Which file(s) can be modified
- What kinds of changes are in scope
- Any constraints (e.g., "don't change the public API", "keep it under 200 lines")

The tighter the scope, the more productive the loop. The loop must refuse
to touch anything outside this scope, even if it would help.

### Define the measurable standard (contract items 1 + 2)

`Measurable artifact` + `Verification command` together define "better":
- The exact metric (e.g., "test pass count", "val_bpb", "execution time in ms")
- Direction: lower is better, or higher is better?
- Does a test suite / benchmark already exist, or do we need to create one?
- The single command (or short pipeline) that produces the metric reproducibly

### Understand generalization vs memorization

**CRITICAL**: If the test set is meant to represent a general capability:
- The goal is to improve **general ability**, not to memorize specific test cases
- Adding case-specific rules to pass the test set is NOT the goal
- A change that generalizes to unseen data is always preferred over one that just passes more known cases

### Define the workspace strategy

Decide where the loop will run:
- Prefer an isolated branch or worktree such as `auto-research/<descriptive-name>`
- If the current working tree already has unrelated uncommitted changes, isolate the experiment before iterating
- Keep the experiment easy to pause, inspect, and resume later

## Phase 2: Generate the evaluation

Generate an evaluation script that:
- Runs the evaluation and outputs a clearly comparable primary metric
- Returns a non-zero exit code on catastrophic failure (code doesn't compile, tests crash)
- Is deterministic enough to compare across iterations

If the evaluation naturally produces multiple metrics, explicitly choose one as the optimization target and treat the others as supporting context.

This script is generated fresh each time — because every scenario is different. Examples:

| Scenario               | Eval script does                                          |
| ---------------------- | --------------------------------------------------------- |
| Optimize an algorithm  | Benchmark execution time on test data, output median ms   |
| Make tests pass        | Run pytest, parse and output passing test count           |
| Improve model training | Run short training loop, output validation loss           |
| Tune a config          | Run the app with config, measure and output target metric |
| Improve a prompt       | Run LLM-as-judge on test set, output accuracy score       |

**Confirm with the user** that the script correctly captures their intent before starting the loop.

Before starting the loop, run the evaluation enough times to establish a trustworthy baseline. If the baseline fluctuates so much that you cannot tell whether a typical iteration helped or hurt, stop and stabilize the evaluation first instead of optimizing against noise.

## Phase 3: The Loop

Once setup is confirmed, use the Agent tool to run the iteration loop. Keep the main conversation responsive, but do **not** delegate ownership of the objective away from the main agent.

### Main agent = supervisor, always

The main agent is the experiment supervisor and is accountable for the outcome. A subagent is only an execution worker for one stretch of the loop.

That means the main agent must:
- Own the success criteria, stop conditions, and current best-known metric
- Check whether the subagent actually reached the requested milestone before accepting that run as "done"
- Read the subagent's result, compare it against the explicit goal, and decide whether to continue, redirect, or stop
- Re-launch or redirect the subagent if it stopped early, drifted off task, or ended without satisfying the stop conditions

Never treat "the subagent returned" as equivalent to "the task is complete". Completion is defined only by the metric and stop conditions.

### Subagent contract

When launching a subagent, give it an explicit contract:
- The target files it may edit
- The evaluation command and the primary metric to optimize
- The current baseline and current best result
- The concrete milestone for this run, such as "continue iterating until you hit one of the allowed stop conditions"
- A requirement to leave behind updated artifacts such as `iteration_log.md`, commits, and any evaluation outputs

State plainly that the subagent should not stop just because one attempt failed or because it found a small improvement. It should continue iterating until it hits a real stop condition or a hard blocker it cannot resolve.

### Supervision loop

The supervision loop belongs to the main agent:

```
initialize:
  create branch: auto-research/<descriptive-name>
  write Phase 0 contract to iteration_log.md
  run eval -> record baseline metric

supervisor loop:
  1. launch or resume a worker subagent with the current goal and contract
  2. wait for a meaningful checkpoint or completion
  3. enforce write scope:
     - run `git diff --name-only` since the last accepted state
     - revert any files outside the contract's `Allowed write scope`
     - if the worker repeatedly violates scope, treat as a hard blocker
  4. inspect what actually happened:
     - did the metric improve?
     - did the worker update iteration_log.md and commits correctly?
     - is the run in a STOP state (verified target + stop signal written)
       or a PAUSE state (cap hit, blocker, noisy eval, resource exhaustion)
       or neither (worker just gave up / declared itself done early)?
  5. if neither STOP nor PAUSE has fired:
     - send corrective instructions or spawn a fresh worker
     - continue from the latest accepted state
  6. only report the run as COMPLETE when STOP fires and the stop signal
     from contract item 4 is verified. PAUSE is reported as PAUSED with
     the reason and resume instructions, never as COMPLETE.
```

### Workflow

```
initialize:
  create branch: auto-research/<descriptive-name>
  run eval → record baseline metric

loop:
  1. read target file + review history of past attempts
  2. decide what to change and why
  3. make the modification
  4. git add + git commit (see commit format below)
  5. run eval → get new metric
  6. append outcome to iteration_log.md
  7. analyze: keep, build on it, or revert
  8. check stop conditions, then repeat
```

If you hand this workflow to a worker subagent, the main agent must still supervise it from outside the loop and restart it when needed. The loop is complete only when the supervisor says it is complete.

### Recording discipline

**Every commit message MUST include the evaluation result or key metric summary.**

```
experiment #5: improve brand name detection with fuzzy matching accuracy=0.8532
experiment #6: simplify prompt structure passed=184/200
experiment #7: reduce bundle parsing overhead median_ms=143
```

Reverted experiments stay in git log — this is the experiment journal.

Maintain an `iteration_log.md` throughout the run. Each iteration should record:
- Iteration number
- What you tried and why
- Exact change made
- Resulting metric
- Keep / revert / paused decision
- Short takeaway for the next iteration

### End states (contract items 4 + 5)

The loop has two terminal states. The supervisor MUST classify which one
fired and report accordingly.

**STOP** — success was verified or the user cancelled. Report as COMPLETE.
- The stop signal from contract item 4 is produced AND the supervisor
  reads/verifies it
- The metric hits the user-defined target AND the supervisor writes the
  stop signal to confirm
- The user explicitly cancels

**PAUSE** — budget exhausted or external blocker hit. Report as PAUSED with
reason and resume instructions; never as COMPLETE.
- The user-specified iteration cap is reached (default: 50)
- The wall-clock cap is reached
- N consecutive iterations show no meaningful progress (default: 10) — by
  default a pause; the user may downgrade this to STOP in contract item 5
- The evaluation is too noisy to support decisions
- Resource exhaustion (quota, API key, disk)
- An attempt requires paid action or external approval
- The worker reports a blocker the supervisor cannot resolve from current
  context (including repeated scope violations from §Supervision loop step 3)

A pause leaves the branch, iteration log, and last accepted state intact.
The user resumes by re-launching the supervisor pointed at the same branch
and `iteration_log.md` (the contract lives at the top of that file).

These are **not** valid terminal states by themselves:
- The subagent returned control
- The subagent said it was done
- One experiment failed
- The current idea seems weak
- The worker hit a soft timeout or context boundary

If a worker stops without firing STOP or PAUSE, the main agent must treat that as an incomplete run, inspect the blocker, and then either:
- send the worker back with sharper instructions, or
- start a new worker from the latest accepted state

Default bias: continue rather than stop. The only acceptable reason to
report COMPLETE is that the STOP state has been verified by the supervisor.

## Reporting

After the loop ends (or when the user checks in), provide:

1. **Metric trajectory**: starting → best, with key milestones
2. **Experiment stats**: total iterations, improvements, reverts
3. **Key discoveries**: the most impactful changes
4. **What didn't work**: patterns in failed experiments, so the user learns too
5. **Git log**: the relevant experiment history for reproducibility

If the user wants to continue, the loop can resume from where it stopped — all context is preserved in git history and the iteration log.
