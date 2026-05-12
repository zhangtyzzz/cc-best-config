# work-toolkit

[English](./README.md)

Claude Code 最佳配置集合 — 以 marketplace 形式分发开箱即用的 skills、hooks、rules 和 agents，面向日常研发、内容生产、图像生成和多 Agent 工作流。

## 亮点

- **Agent Bridge 内置化**：通过 `agent-task` 将任务委托给 Codex、OpenCode、QoderCLI，适合代码评审、解释、对抗式审查和通用外部 Agent 任务。
- **工程流程分级**：`pragmatic-engineering` 会按任务复杂度决定直接执行、先规划、还是组织子 Agent。
- **质量循环**：`critic-loop` 使用 Worker + Critic 模式，让重要输出经过明确 rubric 评估和修订。
- **自动迭代优化**：`auto-research` 面向可量化目标持续实验，主 Agent 必须监督 stop condition。
- **内容与图片工作流**：包含通用图像生成、Excalidraw 图表、本地图片转图床等技能。

## 安装

推荐在 Claude Code 内使用插件 UI 命令安装：

```text
/plugin marketplace add zhangtyzzz/cc-best-config
/plugin install work-toolkit@cc-best-config
/reload-plugins
```

等价 CLI 命令：

```bash
claude plugin marketplace add zhangtyzzz/cc-best-config
claude plugin install work-toolkit@cc-best-config
```

后续更新：

```bash
claude plugin update work-toolkit@cc-best-config
```

然后在当前 Claude Code 会话内重新加载：

```text
/reload-plugins
```

> 注意：插件通过版本号判断更新。发布变更时必须 bump `plugins/work-toolkit/.claude-plugin/plugin.json` 的 `version`。

## 外部 CLI Agent 委托

`agent-task` 是本插件内置的 Agent Bridge 入口，替代旧的 `cli-agents` 工作流。

### 支持的 Agent

| Agent | CLI | 擅长领域 |
|------|-----|---------|
| Codex | `codex` | 安全审计、边界条件、深度推理、TypeScript |
| OpenCode | `opencode` | 多模型切换、Python、低成本、本地模型 |
| QoderCLI | `qodercli` | 数据分析、SQL、业务逻辑 |

只需安装并登录对应 CLI。插件不会代替 CLI 做鉴权，具体认证由各 CLI 自己处理。

### 典型用法

用户可以直接自然语言触发，例如：

```text
用 codex review 这次改动
让 opencode 解释 src/main.ts
用 qodercli 看一下这段 SQL 逻辑
让 codex 和 opencode 都评审一下这个分支
```

`agent-task` 会通过 vendored bridge runtime 执行：

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/agent-task/scripts/bridge/bridge.js" --task review --agent codex
node "${CLAUDE_PLUGIN_ROOT}/skills/agent-task/scripts/bridge/bridge.js" --task review --agents codex,opencode
node "${CLAUDE_PLUGIN_ROOT}/skills/agent-task/scripts/bridge/bridge.js" --task adversarial-review --focus security
node "${CLAUDE_PLUGIN_ROOT}/skills/agent-task/scripts/bridge/bridge.js" --task explain src/main.ts --agent opencode
```

### CLI 可用性提示

插件带有一个 `PreToolUse` hook（matcher: `Skill`），仅在 `agent-task` 技能被触发时才汇报已安装的外部 CLI：

```text
Available external CLI agents: codex,opencode,qodercli. Missing: none.
```

它只做快速 `command -v` 检查，不登录、不配置、不阻塞，结果通过 `hookSpecificOutput.additionalContext` 注入给模型。

> 调度脚本 `hooks/skill-prerun.sh` 会读取 `tool_input.skill`，命中目标 skill 才执行真正的 hook，其他 skill 静默退出。同一个调度器还接管了 `hf-papers` 和 `data-analysis` 的 skill 级 hook。早期写在 `SKILL.md` frontmatter 里的 `hooks:` 块在当前 Claude Code 上不会触发（[#39468](https://github.com/anthropics/claude-code/issues/39468)），已统一迁移。

## Skills

| 技能 | 说明 |
|------|------|
| **agent-task** | 通过内置 Agent Bridge 委托外部 CLI Agent。支持 Codex、OpenCode、QoderCLI，可用于代码评审、对抗式评审、代码解释、通用任务委托和多 Agent 对比。 |
| **critic-loop** | 多 Agent 质量循环：Worker 产出，Critic 按 rubric 评审并驱动修订。默认使用原生子 Agent，用户指定 Codex/OpenCode/QoderCLI 时走 Agent Bridge。 |
| **auto-research** | 面向可量化目标的自动迭代优化。主 Agent 负责监督，必须核验 stop condition，未达标就继续推进或重启 worker。 |
| **pragmatic-engineering** | 分级工程纪律，按任务复杂度自动选择 L0 直接执行、L1 简要检查、L2 规划、L3 子 Agent 编排。 |
| **data-analysis** | 分析 CSV、Excel、数据库结果和业务指标，使用 Python 生成证据充分的报告。 |
| **frontend-design** | 创建高质量、生产级前端界面，避免通用 AI 风格。 |
| **skill-creator** | 创建、修改、优化 skills，支持 eval 测试和性能基准分析。 |
| **excalidraw-diagram-generator** | 通过自然语言生成 Excalidraw 图表：流程图、架构图、思维导图等。 |
| **image-gen** | 通用 AI 图像生成，支持 OpenAI-compatible API、参考图、本地文件 base64、face 编辑、比例和分辨率控制。 |
| **hf-papers** | 通过 Hugging Face CLI 搜索、浏览和阅读学术论文，支持搜索、每日/趋势论文、论文详情和全文阅读。 |
| **piclist-image-hosting** | 将 Markdown 中的本地图片通过 PicList 上传到用户配置的图床，并替换为在线 URL。 |

## Hooks

| Hook | Event | 说明 |
|------|------|------|
| **agent-cli-context** | PreToolUse（matcher: `Skill`） | 通过 `skill-prerun.sh` 调度，仅在 `agent-task` 触发时报告 Codex / OpenCode / QoderCLI 是否已安装。 |
| **ensure-hf-cli** | PreToolUse（matcher: `Skill`） | 仅在 `hf-papers` 触发时检查并自动安装 `huggingface_hub[cli]`。同样走 `skill-prerun.sh`。 |
| **ensure-python-env** | PreToolUse（matcher: `Skill`） | 仅在 `data-analysis` 触发时检查并自动把 pandas/matplotlib/seaborn 装到项目 `.venv`。同样走 `skill-prerun.sh`。 |
| **protect-files** | PreToolUse（matcher: `Edit\|Write`） | 阻止修改 `.env`、密钥、凭证等敏感文件。始终生效。 |
| **notify-push** | Notification + Stop | 带任务上下文的推送通知，支持 Bark 等 webhook，并 fallback 到桌面通知。设置 `NOTIFY_URL` 启用移动端推送。 |
| **stop-guard** | Stop | 会话结束前检查任务完成度，并提示是否需要同步文档。 |

## 验证与本地开发

本仓库提供标准验证脚本：

```bash
# 静态验证 + runtime smoke test
scripts/verify-plugin.sh

# 端到端验证：创建临时本地 marketplace，安装插件，再检查安装缓存内容
scripts/verify-plugin.sh --e2e
```

脚本会执行：

- `claude plugin validate .`
- `claude plugin validate plugins/work-toolkit`
- 检查关键 skill、hook、bridge runtime 文件存在
- 确认旧 `cli-agents` 目录不存在
- 运行 bridge `--task list` 和 `--task health`
- 运行 `agent-cli-context.sh`
- 搜索非预期的 `cli-agents` 旧引用
- `--e2e` 模式会创建临时 local marketplace，通过 `claude plugin install --scope local` 安装并验证安装结果，然后自动清理

## 项目结构

```text
├── .claude-plugin/
│   └── marketplace.json      Marketplace 清单
├── plugins/
│   └── work-toolkit/         主插件
│       ├── .claude-plugin/
│       │   └── plugin.json   插件清单
│       ├── skills/           技能定义
│       ├── hooks/            钩子脚本
│       ├── commands/         斜杠命令
│       ├── agents/           子代理定义
│       └── rules/            通用规则
├── scripts/
│   └── verify-plugin.sh      本地与端到端验证脚本
├── CLAUDE.md
├── README.md
└── LICENSE
```

## License

[Apache-2.0](./LICENSE)
