# work-toolkit

[English](./README.md)

精选 Claude Code 插件市场 — 开箱即用的 skills、hooks、rules 和 agents，提升 AI 辅助开发效率。

## 特点

- 内置 `auto-research` 这类可度量迭代优化工作流，要求主 agent 保持监督职责，只有命中显式停止条件才允许结束。
- 包含内容与媒体相关技能，既能为文章配图，也能通过多家 API 批量生成图片。
- 以 marketplace 插件方式分发，放在 `plugins/work-toolkit/skills/` 下的新技能会随同插件一起安装。

## 安装

```bash
# 1. 添加插件市场
claude plugin marketplace add zhangtyzzz/cc-best-config

# 2. 安装插件
claude plugin install work-toolkit
```

## 已有内容

### Skills

| 技能 | 说明 |
|------|------|
| **data-analysis** | 分析 CSV/Excel/数据库数据，生成专业报告。支持数据库协作分析模式（ODPS、BigQuery 等）。 |
| **frontend-design** | 创建高质量、生产级前端界面，避免通用 AI 风格。 |
| **skill-creator** | 创建、修改、优化 skills，支持 eval 测试和性能基准分析。 |
| **excalidraw-diagram-generator** | 通过自然语言生成 Excalidraw 图表（流程图、架构图、思维导图等）。 |
| **auto-research** | 面向可量化目标的自动迭代优化技能。设定目标文件与评测指标后，AI 会持续实验；主 agent 负责监督，如果子 agent 提前停下，需要继续推进直到满足显式 stop condition。 |
| **baoyu-article-illustrator** | 分析文章结构，判断配图位置，并以 Type × Style 的方式生成风格统一的插图。 |
| **baoyu-image-gen** | 通过 OpenAI、Google、OpenRouter、DashScope、ModelScope、即梦、豆包、Replicate 等 API 生成图片，支持参考图、比例和批量模式。 |
| **pragmatic-engineering** | 分级工程纪律，按任务复杂度自动匹配流程深度（L0 直接执行 → L3 子代理编排），简单任务快速完成，复杂特性获得完整的设计与评审流程。 |
| **image-gen** | 通用 AI 图像生成，通过 OpenAI-compatible API 抽象层接入任意端点。支持参考图工作流（给一张或多张参考图保持风格/IP 一致性）、本地文件自动 base64 编码、face 编辑、比例和分辨率控制。 |
| **cli-agents** | 通过 exec 模式将任意 CLI AI 工具（Codex、Gemini CLI、Claude CLI 等）作为子 Agent 调用，进程退出即完成，结果写入文件直接读取，无需 tmux 或轮询。支持并行后台调用和多轮修订循环。 |
| **critic-loop** | 多 Agent 质量循环：N 个 Worker 执行子任务，一个 Critic 评估器按预定 rubric 评审产出；默认使用原生子 Agent，用户指定 CLI 工具时走 cli-agents 模式，循环直到所有标准通过。适合用标准判断质量的任务（调研报告、技术文档、有设计决策的代码），而非使用数字指标衡量的任务。 |
| **piclist-image-hosting** | 将 Markdown 中的本地图片通过 PicList 上传到用户配置的图床，用在线 URL 替换本地路径。依赖本地运行的 PicList App，无需额外 API key 配置。 |

## 使用说明

- `baoyu-image-gen` 依赖 `bun` 或 `npx -y bun` 运行脚本，并通过环境变量或 `EXTEND.md` 读取 provider 配置。
- `baoyu-article-illustrator` 会先生成文章对应的 prompt 文件，再交给图片生成流程执行，不建议直接跳过这些中间产物。
- `auto-research` 适合有明确、低成本、可重复评测的任务；如果指标主观或噪声太大，就不适合用它。
- `cli-agents` 需要目标 CLI 工具已安装并完成认证。每次调用都是全新 session，上下文由编排者维护并在每次调用时注入，而非由 agent 自动保留。
- `piclist-image-hosting` 需要本地运行 PicList App（HTTP API 在 `127.0.0.1:36677`）并已配置好图床。本仓库无需额外 API key 或 `.env` 配置。

### Hooks

| 钩子 | 事件 | 说明 |
|------|------|------|
| **protect-files** | PreToolUse | 阻止修改 .env、密钥、凭证等敏感文件。 |
| **notify-push** | Notification + Stop | 带任务上下文的推送通知，支持 Bark 等 webhook 推送 + 桌面通知 fallback。设置 `NOTIFY_URL` 环境变量启用移动端推送。 |
| **stop-guard** | Stop | 会话结束前检查任务完成度，并检查文档是否需要更新。 |

## 项目结构

```
├── .claude-plugin/
│   └── marketplace.json      Marketplace 清单
├── plugins/
│   └── work-toolkit/         主插件
│       ├── .claude-plugin/
│       │   └── plugin.json   插件清单
│       ├── skills/           技能定义（每个技能一个目录）
│       ├── hooks/            钩子脚本
│       ├── commands/         斜杠命令
│       ├── agents/           子代理定义
│       └── rules/            通用规则
├── CLAUDE.md
├── README.md
└── LICENSE
```

## 许可证

[Apache-2.0](./LICENSE)
