# CLAUDE.md

Claude Code 最佳配置集合 — skills, hooks, rules, agents 等。

## 项目结构

```
├── skills/       — 技能定义，每个技能一个目录
├── hooks/        — 钩子脚本
├── commands/     — 斜杠命令
├── agents/       — 子代理定义
├── rules/        — 通用规则
└── .claude-plugin/
    └── plugin.json  — 插件清单
```

## Skills

每个 skill 目录包含：
- `SKILL.md` — 技能主文件，含 YAML frontmatter（name, description, hooks）
- `scripts/` — 附带脚本（hook 脚本等）
- `references/` — 参考文档

## 已有 Skills

- **data-analysis** — 数据分析与报告生成，支持 CSV/Excel/数据库协作分析

## 安装

```bash
claude plugin add zhangtyzzz/cc-best-config
```
