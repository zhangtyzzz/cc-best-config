# cc-best-config

[English](./README.md)

精选 Claude Code 插件 — 开箱即用的 skills、hooks、rules 和 agents，提升 AI 辅助开发效率。

## 安装

```bash
claude plugin add zhangtyzzz/cc-best-config
```

## 已有内容

### Skills

| 技能 | 说明 |
|------|------|
| **data-analysis** | 分析 CSV/Excel/数据库数据，生成专业报告（含 Python 图表）。支持数据库协作分析模式，通过协调查询工具（ODPS、BigQuery 等）完成端到端分析流程。内置 PreToolUse hook 自动检测并配置 Python 环境。 |

### 即将推出

- **hooks/** — 可复用钩子脚本
- **commands/** — 斜杠命令
- **agents/** — 专用子代理
- **rules/** — 最佳实践规则集

## 项目结构

```
├── skills/           技能定义（每个技能一个目录）
├── hooks/            钩子脚本
├── commands/         斜杠命令
├── agents/           子代理定义
├── rules/            通用规则
└── .claude-plugin/
    └── plugin.json   插件清单
```

每个 skill 目录包含：

- `SKILL.md` — 技能主文件，含 YAML frontmatter（name, description, hooks）
- `scripts/` — 附带脚本（hook 脚本、工具等）
- `references/` — 参考文档

## 许可证

[Apache-2.0](./LICENSE)
