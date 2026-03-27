# cc-best-config

[中文版](./README_CN.md)

Curated Claude Code marketplace — production-ready skills, hooks, rules, and agents for AI-assisted development.

## Highlights

- Includes iterative optimization workflows such as `auto-research`, where the main agent stays responsible for supervision and must keep workers running until a real stop condition is met.
- Bundles specialized content and media skills, including article illustration and API-based image generation.
- Ships as a marketplace plugin, so new skills added under `plugins/cc-best-config/skills/` are installable through the same package.

## Install

```bash
# 1. Add marketplace
claude plugin marketplace add zhangtyzzz/cc-best-config

# 2. Install plugin
claude plugin install cc-best-config
```

## What's Included

### Skills

| Skill | Description |
|-------|-------------|
| **data-analysis** | Analyze CSV/Excel/database data and produce professional reports with Python. Supports database-assisted analysis by coordinating with query tools (ODPS, BigQuery, etc.). |
| **frontend-design** | Create distinctive, production-grade frontend interfaces with high design quality. Avoids generic AI aesthetics. |
| **skill-creator** | Create, modify, and optimize skills. Run evals, benchmark performance, and improve triggering accuracy. |
| **excalidraw-diagram-generator** | Generate Excalidraw diagrams from natural language — flowcharts, architecture diagrams, mind maps, and more. |
| **auto-research** | Anything with a measurable metric can be iteratively improved by AI — set a target file and a metric, then let AI loop autonomously to improve it. The main agent acts as supervisor and must continue or relaunch worker agents until an explicit stop condition is verified. |
| **baoyu-article-illustrator** | Analyze an article, decide where visuals are needed, and generate consistent illustrations using a Type × Style workflow. |
| **baoyu-image-gen** | Generate images through OpenAI, Google, OpenRouter, DashScope, ModelScope, Jimeng, Seedream, or Replicate APIs. Supports saved prompt files, references, aspect ratios, and batch mode. |
| **tmux-orchestrator** | Orchestrate multiple CLI agents (Claude Code, Codex, Gemini, etc.) in parallel via tmux. Uses git worktrees for code isolation, distributes tasks, monitors progress, and merges results. |
| **pragmatic-engineering** | Graded engineering discipline that right-sizes process to task complexity. Triages tasks into four levels (L0 direct execute → L3 subagent orchestration) so simple changes stay fast while complex features get proper design and review gates. |

## Notes

- `baoyu-image-gen` uses `bun` or `npx -y bun` to run its script and expects provider credentials via env vars and/or `EXTEND.md`.
- `baoyu-article-illustrator` depends on article-specific prompt files and is designed to work with `baoyu-image-gen` for final rendering.
- `auto-research` is for tasks with a cheap, objective evaluation loop. If the metric is noisy or subjective, it is the wrong tool.
- `tmux-orchestrator` requires `tmux` and at least one agent CLI installed. The orchestrator acts as supervisor, reviewing and approving each worker's tool-use requests within task scope.

### Hooks

| Hook | Event | Description |
|------|-------|-------------|
| **protect-files** | PreToolUse | Blocks edits to sensitive files (.env, credentials, keys, etc.). |
| **notify-push** | Notification + Stop | Push notification with task context via HTTP webhook (Bark by default). Falls back to desktop notification. Set `NOTIFY_URL` env var to enable mobile push. |
| **stop-guard** | Stop | Verifies task completion and checks if docs need updating before session ends. |

## Project Structure

```
├── .claude-plugin/
│   └── marketplace.json      Marketplace manifest
├── plugins/
│   └── cc-best-config/       Main plugin
│       ├── .claude-plugin/
│       │   └── plugin.json   Plugin manifest
│       ├── skills/           Skill definitions (one per directory)
│       ├── hooks/            Hook scripts
│       ├── commands/         Slash commands
│       ├── agents/           Subagent definitions
│       └── rules/            Shared rules
├── CLAUDE.md
├── README.md
└── LICENSE
```

## License

[Apache-2.0](./LICENSE)
