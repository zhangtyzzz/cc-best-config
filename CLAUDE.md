# CLAUDE.md

Claude Code 最佳配置集合 — 以 marketplace 形式分发 skills, hooks, rules, agents。

## 项目结构

本仓库是一个 Claude Code **marketplace**，包含一个或多个 plugin。

```
├── .claude-plugin/
│   └── marketplace.json      — Marketplace 清单
├── plugins/
│   └── work-toolkit/         — 主插件
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
- **pragmatic-engineering** — 分级工程纪律，按任务复杂度自动匹配流程深度（L0 直接执行 → L3 子代理编排），避免简单任务被重流程拖慢
- **image-gen** — 通用 AI 图像生成，通过 OpenAI-compatible API 抽象层接入任意端点。支持参考图工作流（给一张或多张参考图保持风格/IP 一致性）、本地文件自动 base64、face 编辑、比例和分辨率控制
- **cli-agents** — 通过 exec 模式将任意 CLI AI 工具（Codex、Gemini CLI、Claude CLI 等）作为子 Agent 调用，进程退出即完成，结果写入文件直接读取，无需 tmux 或轮询
- **critic-loop** — 多 Agent 质量循环：N 个 Worker 执行子任务，一个 Critic 评估器按预定 rubric 评审产出；默认使用原生子 Agent，用户指定 CLI 工具时走 cli-agents 模式。适合用标准判断质量的场景（研究、文档、代码设计），而非数字指标场景（用 auto-research）
- **oss-image-hosting** — 将 Markdown 中的本地图片上传到阿里云 OSS，生成短效签名 URL 并替换路径。PreToolUse hook 自动检测环境（oss2 安装、.env 配置），上传文件 1 天后自动过期

## 版本管理

插件版本号在 `plugins/work-toolkit/.claude-plugin/plugin.json` 的 `version` 字段中维护，遵循 [semver](https://semver.org/) 规范：

- **patch**（0.2.0 → 0.2.1）：bug 修复、模板微调、文档修正
- **minor**（0.2.0 → 0.3.0）：新增 skill、现有 skill 功能增强、新增 hook
- **major**（0.x → 1.0）：破坏性变更、大规模重构

**每次发布更新时必须 bump 版本号。** Claude Code 通过版本号判断是否需要更新插件——如果改了代码但没 bump 版本号，用户不会收到更新（缓存机制）。用户可通过 `claude plugin update work-toolkit@cc-best-config` 拉取新版本，再执行 `/reload-plugins` 生效。注意：第三方 marketplace 的 auto-update 默认关闭，用户需在 `/plugin` 管理界面手动开启。

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
claude plugin install work-toolkit
```
