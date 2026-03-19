# CLAUDE.md

Claude Code 最佳配置集合 — 以 marketplace 形式分发 skills, hooks, rules, agents。

## 项目结构

本仓库是一个 Claude Code **marketplace**，包含一个或多个 plugin。

```
├── .claude-plugin/
│   └── marketplace.json      — Marketplace 清单
├── plugins/
│   └── cc-best-config/       — 主插件
│       ├── .claude-plugin/
│       │   └── plugin.json   — 插件清单
│       ├── skills/           — 技能定义
│       ├── hooks/            — 钩子脚本
│       ├── commands/         — 斜杠命令
│       ├── agents/           — 子代理定义
│       └── rules/            — 通用规则
├── CLAUDE.md
├── README.md
└── LICENSE
```

## Skills

每个 skill 目录包含：
- `SKILL.md` — 技能主文件，含 YAML frontmatter（name, description, hooks）
- `scripts/` — 附带脚本（hook 脚本等）
- `references/` — 参考文档

## 已有 Skills

- **data-analysis** — 数据分析与报告生成，支持 CSV/Excel/数据库协作分析
- **frontend-design** — 创建高质量、生产级前端界面，避免通用 AI 风格
- **skill-creator** — 创建、修改、优化 skills，支持 eval 测试和性能基准分析
- **excalidraw-diagram-generator** — 通过自然语言生成 Excalidraw 图表（流程图、架构图、思维导图等）
- **dingtalk-bot** — 钉钉机器人 agent，通过 WebSocket 接收钉钉消息并智能回复，支持多种消息格式

## Hooks

- **doc-check-on-stop** — 会话结束时自动检查文档是否需要更新（README、CLAUDE.md 等）

## 安装

```bash
# 1. 添加 marketplace
claude plugin marketplace add zhangtyzzz/cc-best-config

# 2. 安装插件
claude plugin install cc-best-config
```
