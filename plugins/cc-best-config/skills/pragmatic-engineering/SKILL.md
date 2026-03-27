---
name: pragmatic-engineering
description: Help users plan and approach non-trivial coding tasks. Use this skill when a user needs to figure out how to tackle a coding challenge — planning a migration or refactor, choosing between architectural approaches, structuring a new project, reviewing whether their current engineering approach is sound, breaking down complex multi-file changes into safe steps, or deciding on implementation strategy for a significant feature. Triggers on explicit requests ("plan this", "break this down", "how should I approach", "design this feature", "review my approach", "帮我规划", "怎么分步骤做") and on implicit planning needs: when someone describes a complex engineering situation and asks for direction, weighs tradeoffs between approaches, or needs a step-by-step strategy for risky changes. Does NOT trigger for simple scripts, single-file fixes, data analysis, or questions needing only a direct answer.
---

# Pragmatic Engineering

Graded discipline, not absolute discipline. The right amount of process is the minimum that prevents mistakes at the current complexity level.

## Core Principle

**Default to speed; escalate only when justified.** A typo fix should never require a design doc. A new auth system should never skip one.

---

## 1. Task Triage

Every task enters here. Classify along two axes: **type** and **level**.

### Task Types

| Type | Description | Examples |
|------|-------------|----------|
| `question_only` | No code change needed | "How does the auth middleware work?" |
| `tiny_change` | ≤ 5 lines, single file, obvious fix | Typo, rename, config tweak |
| `scoped_change` | Clear scope, 1–3 files, well-understood domain | Add a validation rule, fix a bug with known root cause |
| `feature_work` | Multiple files, design choices, new behavior | Add user authentication, build a new API endpoint |
| `orchestration_work` | Large scope benefiting from parallel execution | Refactor entire API layer, multi-service migration |

### Complexity Levels

| Level | Process | When to use |
|-------|---------|-------------|
| **L0** | Direct execute | Task is unambiguous, low-risk, and isolated |
| **L1** | Lightweight design | 2+ reasonable approaches, or moderate coupling |
| **L2** | Full plan | Significant scope, multiple files, or architectural impact |
| **L3** | Subagent orchestration | Parallelizable work across independent boundaries |

### Decision Matrix

Score each dimension 0–2. Sum determines level.

| Dimension | 0 (Low) | 1 (Medium) | 2 (High) |
|-----------|---------|------------|----------|
| **Clarity** | Requirements are obvious | Some ambiguity | Needs clarification |
| **Scope** | 1 file, ≤ 10 lines | 2–5 files | 6+ files or new module |
| **Risk** | Easily reversible | Could break adjacent features | Data loss or security impact |
| **Coupling** | Isolated change | Touches shared code | Cross-cutting concern |
| **Alternatives** | One obvious approach | 2–3 reasonable options | Fundamental design choice |

| Total Score | Level |
|-------------|-------|
| 0–2 | L0 |
| 3–5 | L1 |
| 6–8 | L2 |
| 9–10 | L3 |

### Triage Output

State the triage result concisely:

```
Triage: [type] → L[level]
Rationale: [one sentence]
```

Then proceed to the corresponding section below.

> **Override rule**: If the user explicitly requests a level ("just do it" → L0, "plan this out" → L2), respect that over the matrix score.

---

## 2. L0: Execute Small Change

For `question_only` and `tiny_change` tasks, or any task scoring 0–2.

### Pre-Check (3 questions, internal only)

1. Am I sure this is the right file and location?
2. Could this break anything adjacent?
3. Is there an existing pattern I should follow?

If all three pass → execute directly. If any raises doubt → escalate to L1.

### Execution

- Make the change.
- Run relevant tests or linting if available.
- Report what was done in 1–2 sentences.

### Self-Check

After execution, verify:
- The change does what was asked
- No unintended side effects were introduced
- Existing tests still pass (if applicable)

---

## 3. L1: Lightweight Design

For `scoped_change` tasks or any task scoring 3–5.

### Steps

**1. Restate the goal** — One sentence. Confirm with the user only if ambiguous.

**2. Options** — Present 2 options (3 max) with a recommendation:

```
Option A: [approach] — [tradeoff]
Option B: [approach] — [tradeoff]
→ Recommendation: [A or B], because [reason]
```

**3. Confirm or proceed** — If one option is strictly better on every dimension, state your choice and proceed. If the tradeoff involves a genuine value judgment (e.g., speed vs. maintainability, scope vs. deadline), ask the user to pick.

**4. Execute** — Implement the chosen approach.

**5. Summary** — Brief design note (3–5 lines) covering what was done and why this approach was chosen.

> **One question at a time.** Never present a list of 5 clarifying questions. Pick the single most important unknown, resolve it, then continue.

---

## 4. L2: Full Plan

For `feature_work` tasks or any task scoring 6–8.

### Design Summary

Produce a concise design document covering:

```
## Design: [Feature Name]

**Goal**: What this achieves (1–2 sentences)
**Scope**: What's in / what's out
**Constraints**: Technical or business constraints
**Approach**: High-level strategy (1 paragraph)
**Risks**: What could go wrong + mitigation
**Success Criteria**: How we know it's done
```

Keep the design doc proportional to complexity — a 3-file feature gets half a page, not three pages.

### Implementation Plan

Break the work into ordered tasks:

```
Tasks:
1. [task] — [file(s) affected]
2. [task] — [file(s) affected]
3. [task] — [file(s) affected]
...
```

Each task should be independently verifiable. Group related changes; don't split artificially.

### Review Gate

Before starting implementation, present the design summary and task list to the user. Proceed only after confirmation.

If the user says "looks good" or equivalent → begin execution.
If the user has feedback → incorporate and re-present the affected section only.

### Execution

Work through tasks in order. After each task:
- Verify it works in isolation
- Note any deviations from the plan
- Continue to the next task without stopping to ask unless blocked

> **Continue rather than stop.** If a minor detail changes during implementation, adapt and note it. Only stop for fundamental plan changes.

---

## 5. L3: Orchestrate Subagents

For `orchestration_work` tasks or any task scoring 9–10.

### When to Use Subagents

Use subagents when:
- Work can be split into 2+ independent streams
- Each stream touches different files/modules
- Parallel execution provides real time savings
- The integration points between streams are well-defined

Do NOT use subagents when:
- Tasks have heavy interdependencies
- The "parallel" work would constantly conflict on the same files
- Coordination overhead exceeds the time saved
- The task is complex but inherently sequential

### Dispatch Template

For each subagent, define:

```
## Subagent: [name]
**Task**: [clear, self-contained description]
**Files**: [specific files/directories this agent owns]
**Boundary**: [what this agent must NOT touch]
**Success Criteria**: [how to verify completion]
**Integration Point**: [how this merges with other work]
```

### Orchestration Rules

1. **Clear ownership** — Each file belongs to exactly one subagent. No overlapping file ownership.
2. **Interface-first** — Define integration interfaces before dispatching agents.
3. **Review per subtask** — Each subagent's output gets reviewed before merging.
4. **Main agent stays supervisor** — The orchestrator reviews, does not implement.

### Integration

After all subagents complete:
1. Review each output against its success criteria
2. Resolve any integration conflicts
3. Run full test suite
4. Produce a unified summary

---

## 6. Review

Review depth matches the level.

### L0 Review

Internal self-check (do not output unless issues found):
1. Does the change match what was requested?
2. Did I introduce anything beyond the request?
3. Do existing tests pass?

### L1 Review

Check two things:
- **Goal compliance** — Does the result achieve the stated goal?
- **Over-engineering check** — Did I add anything unnecessary? If so, remove it.

### L2 Review

Structured review covering:
- **Spec compliance** — Does the implementation match the design summary?
- **Code quality** — Clean, consistent with existing patterns, no dead code
- **Risk review** — Were identified risks mitigated? Any new risks introduced?
- **Deviation log** — What changed from the plan and why?

### L3 Review

Everything in L2, plus:
- **Integration review** — Do subagent outputs compose correctly?
- **Boundary violations** — Did any agent modify files outside its ownership?
- **Consistency** — Naming, patterns, and conventions are uniform across outputs

---

## 7. Closeout

### L0 Closeout

State what was done in 1–2 sentences. No further ceremony needed.

### L1 Closeout

```
Done: [what was accomplished]
Approach: [which option was chosen and why]
```

### L2 Closeout

```
## Summary
[2–3 sentences on what was built]

## Deviations from Plan
[Any changes from the original design, or "None"]

## Open Items
[Anything remaining, or "None"]

## Suggested Next Steps
[Optional: follow-up work that may be relevant]
```

### L3 Closeout

Everything in L2 closeout, plus:

```
## Subagent Results
| Agent | Status | Notes |
|-------|--------|-------|
| [name] | Complete/Partial | [brief note] |

## Integration Notes
[How pieces were combined, any conflicts resolved]
```

---

## Quick Reference

```
User says "fix this typo"           → L0: just do it
User says "add input validation"    → L1: two options, pick one, go
User says "add authentication"      → L2: design doc, task list, review gate
User says "refactor with 3 agents"  → L3: dispatch template, orchestrate, integrate
User says "just do it"              → L0 override, regardless of complexity
User says "plan this"               → L2 minimum, regardless of simplicity
```
