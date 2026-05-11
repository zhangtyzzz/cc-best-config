# work-toolkit

[中文版](./README_CN.md)

A curated Claude Code marketplace for day-to-day engineering, content work, image generation, and multi-agent workflows. It ships production-ready skills, hooks, rules, and agents as one installable plugin.

## Highlights

- **Built-in Agent Bridge**: `agent-task` delegates work to Codex, OpenCode, and QoderCLI for reviews, explanations, adversarial checks, and general external-agent tasks.
- **Right-sized engineering process**: `pragmatic-engineering` matches workflow depth to task complexity.
- **Quality loops**: `critic-loop` uses Worker + Critic passes with explicit rubrics for important deliverables.
- **Metric-driven iteration**: `auto-research` keeps improving measurable targets until a verified stop condition is reached.
- **Content and media workflows**: image generation, Excalidraw diagrams, and Markdown image hosting.

## Install

Recommended: install from inside Claude Code with the plugin UI commands:

```text
/plugin marketplace add zhangtyzzz/cc-best-config
/plugin install work-toolkit@cc-best-config
/reload-plugins
```

CLI equivalent:

```bash
claude plugin marketplace add zhangtyzzz/cc-best-config
claude plugin install work-toolkit@cc-best-config
```

Update later with:

```bash
claude plugin update work-toolkit@cc-best-config
```

Then reload the current Claude Code session:

```text
/reload-plugins
```

> Plugin updates are version-gated. Every release must bump `plugins/work-toolkit/.claude-plugin/plugin.json`.

## External CLI agent delegation

`agent-task` is the built-in Agent Bridge entry point for this toolkit. It replaces the old `cli-agents` workflow.

### Supported agents

| Agent | CLI | Strengths |
|-------|-----|-----------|
| Codex | `codex` | Security review, edge cases, deep reasoning, TypeScript |
| OpenCode | `opencode` | Multi-model workflows, Python, cost efficiency, local models |
| QoderCLI | `qodercli` | Data analysis, SQL, business logic |

Install and authenticate the CLIs you want to use. Authentication stays with each CLI; the plugin does not manage API keys.

### Typical prompts

Use natural language:

```text
Use codex to review this change
Ask opencode to explain src/main.ts
Use qodercli to inspect this SQL logic
Have codex and opencode both review this branch
```

The skill calls the vendored bridge runtime:

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/agent-task/scripts/bridge/bridge.js" --task review --agent codex
node "${CLAUDE_PLUGIN_ROOT}/skills/agent-task/scripts/bridge/bridge.js" --task review --agents codex,opencode
node "${CLAUDE_PLUGIN_ROOT}/skills/agent-task/scripts/bridge/bridge.js" --task adversarial-review --focus security
node "${CLAUDE_PLUGIN_ROOT}/skills/agent-task/scripts/bridge/bridge.js" --task explain src/main.ts --agent opencode
```

### CLI availability context

A lightweight `UserPromptSubmit` hook reports which supported CLIs are installed:

```text
Available external CLI agents: codex,opencode,qodercli. Missing: none.
```

It only runs fast `command -v` checks. It does not log in, mutate config, or block prompts when a CLI is missing.

## Skills

| Skill | Description |
|-------|-------------|
| **agent-task** | Delegate work to external CLI agents through the built-in Agent Bridge. Supports Codex, OpenCode, and QoderCLI for review, adversarial review, explanation, generic task delegation, and multi-agent comparison. |
| **critic-loop** | Worker + Critic quality loop. Native sub-agents are the default; when the user requests Codex/OpenCode/QoderCLI, it uses Agent Bridge. |
| **auto-research** | Autonomous improvement loop for measurable targets. The main agent supervises and must verify the stop condition before ending. |
| **pragmatic-engineering** | Graded engineering discipline that chooses direct execution, lightweight review, planning, or sub-agent orchestration based on task complexity. |
| **data-analysis** | Analyze CSV, Excel, database outputs, KPIs, and other tabular data with Python-backed reports. |
| **frontend-design** | Create distinctive, production-grade frontend interfaces that avoid generic AI aesthetics. |
| **skill-creator** | Create, modify, benchmark, and optimize skills. |
| **excalidraw-diagram-generator** | Generate Excalidraw flowcharts, architecture diagrams, mind maps, and related visuals from natural language. |
| **image-gen** | Universal OpenAI-compatible image generation with references, local file base64, face editing, aspect ratio, and resolution controls. |
| **piclist-image-hosting** | Upload local Markdown images through PicList and replace local paths with public URLs. |

## Hooks

| Hook | Event | Description |
|------|-------|-------------|
| **agent-cli-context** | UserPromptSubmit | Reports whether Codex, OpenCode, and QoderCLI are installed for `agent-task` context. |
| **protect-files** | PreToolUse | Blocks edits to sensitive files such as `.env`, credentials, and keys. |
| **notify-push** | Notification + Stop | Sends task-context notifications via webhook, with desktop notification fallback. Set `NOTIFY_URL` to enable mobile push. |
| **stop-guard** | Stop | Checks task completion and whether docs need updates before the session ends. |

## Verification and local development

Use the verifier script:

```bash
# Static validation + runtime smoke tests
scripts/verify-plugin.sh

# End-to-end validation: create a temporary local marketplace, install the plugin,
# inspect the installed cache, run runtime checks, then clean up
scripts/verify-plugin.sh --e2e
```

The script runs:

- `claude plugin validate .`
- `claude plugin validate plugins/work-toolkit`
- required skill, hook, and bridge runtime file checks
- removal check for the old `cli-agents` directory
- bridge `--task list` and `--task health` smoke checks
- `agent-cli-context.sh` hook smoke check
- stale `cli-agents` reference scan
- in `--e2e` mode: temporary local marketplace creation, `claude plugin install --scope local`, installed-cache validation, and automatic cleanup

## Project structure

```text
├── .claude-plugin/
│   └── marketplace.json      Marketplace manifest
├── plugins/
│   └── work-toolkit/         Main plugin
│       ├── .claude-plugin/
│       │   └── plugin.json   Plugin manifest
│       ├── skills/           Skill definitions
│       ├── hooks/            Hook scripts
│       ├── commands/         Slash commands
│       ├── agents/           Subagent definitions
│       └── rules/            Shared rules
├── scripts/
│   └── verify-plugin.sh      Local and E2E verifier
├── CLAUDE.md
├── README.md
└── LICENSE
```

## License

[Apache-2.0](./LICENSE)
