# cc-best-config

[中文版](./README_CN.md)

Curated Claude Code marketplace — production-ready skills, hooks, rules, and agents for AI-assisted development.

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

### Hooks

| Hook | Event | Description |
|------|-------|-------------|
| **protect-files** | PreToolUse | Blocks edits to sensitive files (.env, credentials, keys, etc.). |
| **notify-on-idle** | Notification | Desktop notification when Claude needs your input (macOS/Linux). |
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
