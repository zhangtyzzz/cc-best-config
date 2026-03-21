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
- **auto-research** — 万物皆可 auto-regressive — 设定可衡量标准后，AI 自动迭代优化代码/配置/内容，支持测试通过率、基准分数、覆盖率等任何可量化指标

## Hooks

- **protect-files** — 阻止修改 .env、密钥、凭证等敏感文件（PreToolUse）
- **notify-on-idle** — Claude 等待输入时发送桌面通知，支持 macOS/Linux（Notification）
- **stop-guard** — 会话结束前检查任务完成度 + 文档是否需要更新（Stop）

## 安装

```bash
# 1. 添加 marketplace
claude plugin marketplace add zhangtyzzz/cc-best-config

# 2. 安装插件
claude plugin install cc-best-config
```
