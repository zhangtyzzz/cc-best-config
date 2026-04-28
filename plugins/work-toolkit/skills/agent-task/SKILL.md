---
name: agent-task
description: "Delegate tasks to external CLI coding agents (Codex, OpenCode, QoderCLI) via Agent Bridge. Replaces cli-agents for external-agent work. Use when the user wants to send work to Codex, OpenCode, or QoderCLI for code review, adversarial review, explanation, implementation assistance, or general task delegation. Supports multi-agent execution with --agents for comparing results. Trigger on: 'use codex to review', '让 opencode 处理', 'delegate to qoder', 'external agent', 'agent review', 'review with codex and opencode', 'explain with opencode', 'let codex handle this', any mention of codex, opencode, qoder, or qodercli, or review/explain/delegation requests that explicitly involve external CLI agents."
---

# Agent Task Bridge

Delegate a task to external CLI coding agents through the vendored Agent Bridge runtime. This skill is the single user-facing bridge interface in `work-toolkit`; it replaces the old `cli-agents` exec workflow.

## Supported agents

- `codex`
- `opencode`
- `qoder` / `qodercli`

The bridge handles routing, agent selection, task execution, and result formatting.

## Common usage

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/agent-task/scripts/bridge/bridge.js" --task review
node "${CLAUDE_PLUGIN_ROOT}/skills/agent-task/scripts/bridge/bridge.js" --task review --agent codex
node "${CLAUDE_PLUGIN_ROOT}/skills/agent-task/scripts/bridge/bridge.js" --task review --agents codex,opencode
node "${CLAUDE_PLUGIN_ROOT}/skills/agent-task/scripts/bridge/bridge.js" --task adversarial-review --focus security
node "${CLAUDE_PLUGIN_ROOT}/skills/agent-task/scripts/bridge/bridge.js" --task explain src/main.ts --agent opencode
node "${CLAUDE_PLUGIN_ROOT}/skills/agent-task/scripts/bridge/bridge.js" fix the login bug --agent codex
```

## Arguments

| Argument | What it does |
|----------|-------------|
| First word | Task type keyword: `review`, `adversarial-review`, `explain`. Anything else becomes a generic task prompt. |
| `--task <name>` | Bridge utility task, such as `list` or `health`. |
| `--agent <name>` | Pin to one agent: `codex`, `opencode`, `qoder`. |
| `--agents <a,b>` | Run the same task with multiple agents, e.g. `--agents codex,opencode`. |
| `--scope auto\|working-tree\|branch` | Review scope. `auto` chooses dirty tree or branch diff. |
| `--base <ref>` | Base branch for branch-scope review. |
| `--focus <area>` | Focus area for reviews, such as `security` or `performance`. |

## Execution rules

When this skill triggers:

1. If the user did not supply any task details, ask once what to delegate.
2. Do not investigate, edit code, run tests, or do the delegated work yourself.
3. Prefer foreground execution for simplicity.
4. Use exactly one Bash invocation:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/agent-task/scripts/bridge/bridge.js" $ARGUMENTS
```

5. Pass the user's arguments through verbatim as `$ARGUMENTS`.
6. Return bridge stdout verbatim. Do not paraphrase, summarize, or add commentary before or after.
