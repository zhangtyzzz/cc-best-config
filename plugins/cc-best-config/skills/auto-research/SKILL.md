---
name: auto-research
description: Set up an autonomous loop that repeatedly modifies code/config/content, runs an evaluation, and keeps improvements automatically. Use this skill when the user wants you to keep iterating on something until a metric improves — phrases like "自动迭代优化", "keep trying until", "一轮一轮改到全部 pass", "autoresearch", "auto-research", "自动跑实验", "experiment loop", "self-improvement loop", or any request where the user provides a target file AND a measurable goal (test pass count, benchmark time, coverage %, accuracy score, bundle size, validation loss) and wants you to loop autonomously rather than make a single attempt. If the user describes both what to change and how to measure success, and wants autonomous iteration, this is the skill to use.
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

## Phase 1: Setup

Before writing any code, clarify two things with the user.

### Define the editable target

What will the AI iterate on? Clarify:
- Which file(s) can be modified
- What kinds of changes are in scope
- Any constraints (e.g., "don't change the public API", "keep it under 200 lines")

The tighter the scope, the more productive the loop.

### Define the measurable standard

What number defines "better"? Clarify:
- The exact metric (e.g., "test pass count", "val_bpb", "execution time in ms")
- Direction: lower is better, or higher is better?
- Does a test suite / benchmark already exist, or do we need to create one?

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
  run eval -> record baseline metric
  record explicit stop conditions

supervisor loop:
  1. launch or resume a worker subagent with the current goal and context
  2. wait for a meaningful checkpoint or completion
  3. inspect what actually happened:
     - did the metric improve?
     - did the worker update the log and commit history correctly?
     - did it stop because a true stop condition was met, or just because it gave up / timed out / declared itself done too early?
  4. if the objective is not yet satisfied and no valid stop condition has fired:
     - send corrective instructions or spawn a fresh worker
     - continue from the latest accepted state
  5. only report final completion when the supervisor verifies a real stop condition
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

### Stop conditions

End the loop when:
- The user-specified iteration count is reached (default: 50)
- N consecutive iterations show no meaningful progress under the task's evaluation criteria (default: 10)
- The metric hits a user-defined target
- The evaluation is too noisy to support decisions
- The user interrupts

Do **not** end the loop for any other reason. In particular, these are **not** valid completion conditions by themselves:
- The subagent returned control
- The subagent said it was done
- One experiment failed
- The current idea seems weak
- The worker hit a soft timeout or context boundary

If a worker stops without a valid stop condition, the main agent must treat that as an incomplete run, inspect the blocker, and then either:
- send the worker back with sharper instructions, or
- start a new worker from the latest accepted state

Default bias: continue rather than stop. The only acceptable reason to stop is that a declared stop condition has been verified by the main agent.

## Reporting

After the loop ends (or when the user checks in), provide:

1. **Metric trajectory**: starting → best, with key milestones
2. **Experiment stats**: total iterations, improvements, reverts
3. **Key discoveries**: the most impactful changes
4. **What didn't work**: patterns in failed experiments, so the user learns too
5. **Git log**: the relevant experiment history for reproducibility

If the user wants to continue, the loop can resume from where it stopped — all context is preserved in git history and the iteration log.
