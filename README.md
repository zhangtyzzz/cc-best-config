# cc-best-config

[中文版](./README_CN.md)

Curated Claude Code plugin — production-ready skills, hooks, rules, and agents for AI-assisted development.

## Install

```bash
claude plugin add zhangtyzzz/cc-best-config
```

## What's Included

### Skills

| Skill | Description |
|-------|-------------|
| **data-analysis** | Analyze CSV/Excel/database data and produce professional reports with Python. Supports database-assisted analysis by coordinating with query tools (ODPS, BigQuery, etc.). Includes auto environment detection via PreToolUse hook. |

### Coming Soon

- **hooks/** — Reusable hook scripts
- **commands/** — Slash commands
- **agents/** — Specialized subagents
- **rules/** — Best-practice rulesets

## Project Structure

```
├── skills/           Skill definitions (one directory per skill)
├── hooks/            Hook scripts
├── commands/         Slash commands
├── agents/           Subagent definitions
├── rules/            Shared rules
└── .claude-plugin/
    └── plugin.json   Plugin manifest
```

Each skill directory contains:

- `SKILL.md` — Main skill file with YAML frontmatter (name, description, hooks)
- `scripts/` — Bundled scripts (hook scripts, utilities)
- `references/` — Reference documents

## License

[Apache-2.0](./LICENSE)
