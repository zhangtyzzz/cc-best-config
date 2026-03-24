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
- `SKILL.md` — 技能主文件，含 YAML frontmatter（至少 `name` 和 `description`）
- `scripts/` — 附带脚本（hook 脚本等）
- `references/` — 参考文档

## 已有 Skills

- **data-analysis** — 数据分析与报告生成，支持 CSV/Excel/数据库协作分析
- **frontend-design** — 创建高质量、生产级前端界面，避免通用 AI 风格
- **skill-creator** — 创建、修改、优化 skills，支持 eval 测试和性能基准分析
- **excalidraw-diagram-generator** — 通过自然语言生成 Excalidraw 图表（流程图、架构图、思维导图等）
- **auto-research** — 面向可量化目标的自动迭代优化。主 agent 是监督者，必须核验 stop condition；如果子 agent 没达标就停下，主 agent 需要继续驱动它或重启新的 worker
- **baoyu-article-illustrator** — 面向文章配图的工作流技能，先分析结构和配图位置，再用 Type × Style 模型产出一致风格的插图
- **baoyu-image-gen** — 基于多家图像 API 的图片生成技能，支持参考图、比例控制、批量生成和基于保存 prompt 文件的稳定执行
- **tmux-orchestrator** — 通过 tmux 编排多个 CLI agent（Claude Code、Codex、Gemini 等）并行编程，使用 git worktree 隔离代码，自动分发任务、监控进度、合并结果

## 文档同步约定

- 新增 skill 后，同时更新 `README.md`、`README_CN.md` 和本文件中的技能清单。
- 如果 skill 的核心行为发生变化，优先在 `SKILL.md` 中写清楚执行约束，再在总览文档里补一句高层说明。
- 对带脚本或外部依赖的 skill，文档至少说明运行方式、关键依赖和基本配置入口。

## Hooks

- **protect-files** — 阻止修改 .env、密钥、凭证等敏感文件（PreToolUse）
- **notify-push** — 带任务上下文的推送通知，支持 Bark 等 webhook 推送 + 桌面通知 fallback（Notification + Stop）。设置 `NOTIFY_URL` 环境变量启用移动端推送
- **stop-guard** — 会话结束前检查任务完成度 + 文档是否需要更新（Stop）

## 安装

```bash
# 1. 添加 marketplace
claude plugin marketplace add zhangtyzzz/cc-best-config

# 2. 安装插件
claude plugin install cc-best-config
```
