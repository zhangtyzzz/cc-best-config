# cc-best-config

[English](./README.md)

精选 Claude Code 插件市场 — 开箱即用的 skills、hooks、rules 和 agents，提升 AI 辅助开发效率。

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
| **dingtalk-bot** | 钉钉机器人 agent，通过 WebSocket 接收钉钉消息并智能回复，支持文本/图片/语音/视频/文件/富文本消息。 |

### Hooks

| 钩子 | 说明 |
|------|------|
| **doc-check-on-stop** | 会话结束时自动检查文档（README、CLAUDE.md 等）是否需要更新。 |

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
