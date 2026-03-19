---
name: dingtalk-bot
description: 钉钉机器人 agent 技能。启动后通过 WebSocket 长连接接收钉钉消息，由 agent 自身的 AI 能力（MCP、联网搜索、其他 skill 等）智能处理并回复。支持文本/图片/语音/视频/文件/富文本消息接收，支持 text/markdown/actionCard/图片/文件/链接多格式回复。当用户提到"钉钉机器人"、"DingTalk bot"、"钉钉消息"或想要连接、启动、开启钉钉机器人对话时触发本技能。
triggers:
  - 开启钉钉机器人对话
  - 启动钉钉机器人
  - 连接钉钉机器人
  - 打开钉钉机器人
  - 钉钉机器人
  - 钉钉消息
  - DingTalk bot
  - start dingtalk
---

# 钉钉机器人 Agent

## 核心理念

你（agent）就是这个钉钉机器人的大脑。bot.js 只是耳朵（接收消息），send-message.js 只是嘴巴（发送回复）。你负责理解消息、思考、并生成有价值的回复 — 利用你所有的能力：AI 推理、MCP 工具、联网搜索、其他 skill 等。

```
钉钉用户 ──WebSocket──→ bot.js ──→ messages.json ──→ 你（agent 定时轮询）──→ 智能回复
                                                                              │
                          钉钉用户 ←──webhook / Robot API──← send-message.js ←┘
```

## 触发后执行步骤

### 第一步：记录 SKILL_DIR

本技能所有文件位于此 SKILL.md 同目录下，记录为 `SKILL_DIR`。

### 第二步：检查配置

读取 `SKILL_DIR/config.json`，确认 `clientId` 和 `clientSecret` 有效：

```json
{
  "clientId": "你的AppKey",
  "clientSecret": "你的AppSecret",
  "outputFile": "./messages.json",
  "cardTemplateId": "",
  "enableCardStreaming": false
}
```

如果为空或为占位值，询问用户提供 AppKey/AppSecret（从[钉钉开放平台](https://open-dev.dingtalk.com)获取）。

### 第三步：检查依赖并启动

```bash
cd "${SKILL_DIR}" && [ -d node_modules ] || npm install
```

检查 bot.js 是否已运行：
```bash
pgrep -f "bot\.js" 2>/dev/null
```

未运行则**后台启动**（`run_in_background: true`）：
```bash
cd "${SKILL_DIR}" && node bot.js
```

等待 3-5 秒确认 "connect success" 日志。

### 第四步：设置消息处理定时任务

参见 [定时调度器](#定时调度器) 章节，设置每分钟轮询。

### 第五步：告知用户

告诉用户机器人已启动、定时任务已设置，可以在钉钉上发消息测试。

---

## 定时调度器

### 轮询 Prompt

将 `SKILL_DIR` 替换为实际路径后，设为定时任务的 prompt：

```
检查钉钉新消息。执行以下步骤：

1. 运行: cd "SKILL_DIR" && node message-processor.js pending
   如果输出为空数组 []，则无新消息，直接结束。

2. 如果有消息，先下载附件:
   cd "SKILL_DIR" && node message-processor.js download

3. 重新读取 SKILL_DIR/messages.json 获取更新后的消息列表（含附件本地路径）。

4. 对每条消息，根据内容生成智能回复：
   - 理解用户意图，给出有帮助的回答
   - 如果有附件，告知已收到并描述
   - 如果语音消息有 recognition 字段，基于识别文本回复
   - 可以用 markdown 格式让回复更美观
   - 可以利用 MCP、联网搜索、其他 skill 等所有能力

5. 发送每条回复:
   cd "SKILL_DIR" && node send-message.js --webhook="<msg.sessionWebhook>" --user="<msg.senderStaffId>" --message="<回复内容>" --silent
   如果回复含格式化内容，加 --type=markdown --title="<回复内容前20个字>"
   如果需要发送图片: --user="<staffId>" --image=<路径或URL>
   如果需要发送文件: --user="<staffId>" --send-file=<路径或URL>
   群聊时加 --conversation-id="<msg.conversationId>"

6. 全部回复完成后归档:
   cd "SKILL_DIR" && node message-processor.js archive
```

> **关于 markdown 标题**：钉钉消息列表中 markdown 消息显示标题作为预览摘要。用回复内容的前 20 个字（去掉 # 等 markdown 符号）作为标题，这样用户在消息列表里就能看到回复内容的预览，更符合聊天直觉。

### 平台适配

**Claude Code** — 使用 CronCreate：
```
CronCreate({ cron: "* * * * *", prompt: "<轮询 Prompt>" })
```

**OpenCode** — 使用 /loop：
```
/loop 1m <轮询 Prompt>
```

**其他平台**（Codex / Gemini CLI / iFlow 等）— 使用其原生定时机制，或系统 crontab 触发。

**通用后备** — shell watch：
```bash
watch -n 60 'cd "SKILL_DIR" && node message-processor.js pending'
```

---

## CLI 工具参考

### message-processor.js

纯消息管理工具，不含任何回复逻辑。

```bash
node message-processor.js pending                    # 查看待处理消息（JSON → stdout）
node message-processor.js download                   # 下载附件到 downloads/
node message-processor.js archive                    # 归档所有待处理消息
node message-processor.js archive --replies '<json>' # 归档并记录回复
```

### send-message.js

两种模式：

**Webhook 模式**（文本类，需要 --webhook）：
```bash
# 文本
node send-message.js --webhook=<url> --user=<id> --message="内容"
# Markdown（--title 用回复内容前20字做摘要）
node send-message.js --webhook=<url> --user=<id> --type=markdown --title="你好我是AI助手" --message="# Hello\n详细内容..."
# ActionCard
node send-message.js --webhook=<url> --user=<id> --type=actionCard --title="标题" --message="内容"
# 长消息流式发送
node send-message.js --webhook=<url> --user=<id> --message="很长的内容" --stream
```

**Robot API 模式**（富媒体，需要 config.json 中的凭证）：
```bash
# 发送图片
node send-message.js --user=<id> --image=/path/to/pic.png
# 发送文件
node send-message.js --user=<id> --send-file=/path/to/doc.pdf --file-name="报告.pdf"
# 发送链接
node send-message.js --user=<id> --link-url="https://..." --title="标题" --message="描述"
# 群聊发送
node send-message.js --conversation-id=<id> --image=/path/to/pic.png
```

| 参数 | 说明 |
|------|------|
| `--webhook` | 会话 webhook URL（Webhook 模式必填） |
| `--user` | 接收者 StaffId（单聊必填） |
| `--conversation-id` | 群聊会话 ID |
| `--message` | 消息内容 |
| `--file` | 从文件读取消息内容 |
| `--type` | text / markdown / actionCard / link |
| `--title` | 标题（markdown 建议用回复前20字） |
| `--image` | 发送图片（走 Robot API） |
| `--send-file` | 发送文件（走 Robot API） |
| `--file-name` | 文件显示名称 |
| `--link-url` | 链接地址 |
| `--pic-url` | 链接封面图 URL |
| `--stream` | 流式分段发送 |
| `--delay` | 流式每段延迟毫秒（默认 1000） |
| `--chunk-size` | 流式每段字符数（默认 500） |
| `--at-all` | @所有人 |
| `--silent` | 静默模式 |

---

## 消息对象 Schema

```json
{
  "messageId": "消息唯一ID",
  "senderStaffId": "发送者员工ID",
  "senderNick": "发送者昵称",
  "msgType": "text|picture|audio|video|file|richText",
  "content": "文本内容或描述（如 [图片]、[文件:report.pdf]）",
  "attachments": [
    {
      "type": "picture|audio|video|file|richText",
      "downloadCode": "下载码（用于 download 命令）",
      "localPath": "下载后的本地路径",
      "fileName": "文件名（file 类型）",
      "recognition": "语音识别文本（audio 类型）",
      "duration": "时长秒数（audio/video 类型）"
    }
  ],
  "conversationType": "1=单聊, 2=群聊",
  "conversationId": "会话ID",
  "conversationTitle": "群标题（群聊时）",
  "sessionWebhook": "回复用 webhook URL",
  "robotCode": "机器人 code",
  "createAt": 1234567890000,
  "receivedAt": "2026-01-01T00:00:00.000Z"
}
```

---

## 运维

**查看消息**：
- 待处理：`SKILL_DIR/messages.json`
- 历史：`SKILL_DIR/message_history.json`
- 附件：`SKILL_DIR/downloads/`

**停止机器人**：
1. `pkill -f "bot\.js"`
2. 取消定时任务（CronDelete / 停止 /loop）

**获取 Webhook 和 StaffId**：从 messages.json 中任意消息的 `sessionWebhook` 和 `senderStaffId` 字段获取。

**Robot API 权限**：发送图片/文件需要在[钉钉开放平台](https://open-dev.dingtalk.com)启用"单聊主动发送消息"权限。

---

## AI Card 流式响应（可选）

在 config.json 中设置 `cardTemplateId` 和 `enableCardStreaming: true`，bot.js 收到消息后会立即创建 AI 卡片（显示"思考中..."），agent 处理完后可通过卡片流式更新回复。需要先在钉钉开放平台创建 AI 卡片模板。默认关闭。

---

## 目录结构

```
qoder-dingding-msg/
├── bot.js                 # WebSocket 接收器（纯接收，不处理）
├── message-processor.js   # CLI：pending / download / archive
├── send-message.js        # CLI：发送消息（webhook + Robot API）
├── dingtalk-api.js        # DingTalk REST API 封装
├── config.json            # 配置（clientId/clientSecret）
├── messages.json          # 待处理消息队列
├── message_history.json   # 已处理消息归档
└── downloads/             # 附件下载目录
```
