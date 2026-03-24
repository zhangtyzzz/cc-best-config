# cc-best-config

[English](./README.md)

精选 Claude Code 插件市场 — 开箱即用的 skills、hooks、rules 和 agents，提升 AI 辅助开发效率。

## 特点

- 内置 `auto-research` 这类可度量迭代优化工作流，要求主 agent 保持监督职责，只有命中显式停止条件才允许结束。
- 包含内容与媒体相关技能，既能为文章配图，也能通过多家 API 批量生成图片。
- 以 marketplace 插件方式分发，放在 `plugins/cc-best-config/skills/` 下的新技能会随同插件一起安装。

## 安装

```bash
# 1. 添加插件市场
claude plugin marketplace add zhangtyzzz/cc-best-config

# 2. 安装插件
claude plugin install cc-best-config
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
| **tmux-orchestrator** | 通过 tmux 编排多个 CLI agent（Claude Code、Codex、Gemini 等）并行编程，使用 git worktree 隔离代码，自动分发任务、监控进度、合并结果。 |

## 使用说明

- `baoyu-image-gen` 依赖 `bun` 或 `npx -y bun` 运行脚本，并通过环境变量或 `EXTEND.md` 读取 provider 配置。
- `baoyu-article-illustrator` 会先生成文章对应的 prompt 文件，再交给图片生成流程执行，不建议直接跳过这些中间产物。
- `auto-research` 适合有明确、低成本、可重复评测的任务；如果指标主观或噪声太大，就不适合用它。
- `tmux-orchestrator` 需要安装 `tmux` 和至少一个 agent CLI。主 agent 作为监督者，负责审批每个 worker 的工具使用请求。

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
│   └── cc-best-config/       主插件
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
