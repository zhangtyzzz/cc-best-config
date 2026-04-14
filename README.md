# work-toolkit

[中文版](./README_CN.md)

Curated Claude Code marketplace — production-ready skills, hooks, rules, and agents for AI-assisted development.

## Highlights

- Includes iterative optimization workflows such as `auto-research`, where the main agent stays responsible for supervision and must keep workers running until a real stop condition is met.
- Bundles specialized content and media skills, including article illustration and API-based image generation.
- Ships as a marketplace plugin, so new skills added under `plugins/work-toolkit/skills/` are installable through the same package.

## Install

```bash
# 1. Add marketplace
claude plugin marketplace add zhangtyzzz/cc-best-config

# 2. Install plugin
claude plugin install work-toolkit
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
| **pragmatic-engineering** | Graded engineering discipline that right-sizes process to task complexity. Triages tasks into four levels (L0 direct execute → L3 subagent orchestration) so simple changes stay fast while complex features get proper design and review gates. |
| **image-gen** | Universal AI image generation via any OpenAI-compatible API endpoint. First-class reference-image workflow: provide one or more reference images to generate new content that preserves the same visual style, character design, and IP consistency. Supports local files, face editing, aspect ratios, and resolutions up to 4K. |
| **cli-agents** | Use any CLI AI tool (Codex, Gemini CLI, Claude CLI, etc.) as a sub-agent via exec mode. The process exits when done; results go to a file; no tmux, no polling. Supports parallel background calls and multi-round revision loops. |
| **critic-loop** | Multi-agent quality loop: N Worker agents execute subtasks while a dedicated Critic evaluates output against a rubric and drives iterative refinement until all criteria pass. Uses native sub-agents by default; falls back to CLI exec when the user specifies a tool. Use when quality is judged by criteria (research, docs, code with design tradeoffs) rather than a numeric metric. |
| **piclist-image-hosting** | Upload local images in Markdown to the user's configured image host via PicList and replace paths with online URLs. Relies on the locally running PicList App — no extra API key configuration needed in this repo. |

## Notes

- `baoyu-image-gen` uses `bun` or `npx -y bun` to run its script and expects provider credentials via env vars and/or `EXTEND.md`.
- `baoyu-article-illustrator` depends on article-specific prompt files and is designed to work with `baoyu-image-gen` for final rendering.
- `auto-research` is for tasks with a cheap, objective evaluation loop. If the metric is noisy or subjective, it is the wrong tool.
- `cli-agents` requires the target CLI tool to be installed and authenticated. Each invocation starts a fresh session — context is carried by the orchestrator, not retained by the agent.
- `piclist-image-hosting` requires the PicList App running locally (HTTP API on `127.0.0.1:36677`) with an image host already configured. No additional API keys or `.env` needed in this repo.

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
│   └── work-toolkit/         Main plugin
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
