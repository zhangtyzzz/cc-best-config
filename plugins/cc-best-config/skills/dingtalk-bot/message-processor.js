#!/usr/bin/env node
/**
 * 钉钉消息处理器 — CLI 工具
 * 供 agent（Claude Code / OpenCode）调用，不包含任何回复逻辑
 * 回复内容由 agent 的 AI 能力生成
 *
 * 用法:
 *   node message-processor.js pending                              输出待处理消息（JSON）
 *   node message-processor.js download                             下载所有待处理消息的附件
 *   node message-processor.js archive                              归档所有待处理消息
 *   node message-processor.js archive --replies '{"msgId":{"content":"...","type":"text"}}'
 *   node message-processor.js archive --replies-file replies.json  归档并记录回复信息
 */

const fs = require('fs');
const path = require('path');
const DingTalkAPI = require('./dingtalk-api');

const SKILL_DIR = __dirname;
const MESSAGES_FILE = path.join(SKILL_DIR, 'messages.json');
const HISTORY_FILE = path.join(SKILL_DIR, 'message_history.json');
const DOWNLOADS_DIR = path.join(SKILL_DIR, 'downloads');
const CONFIG_FILE = path.join(SKILL_DIR, 'config.json');
const MAX_HISTORY_SIZE = 104857600; // 100MB

// 加载配置
let config = {};
try {
  config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
} catch (_) {}

const api = new DingTalkAPI({ clientId: config.clientId, clientSecret: config.clientSecret });

// ==================== 工具函数 ====================

function readMessages() {
  if (!fs.existsSync(MESSAGES_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8') || '[]');
  } catch (_) {
    return [];
  }
}

// ==================== 子命令 ====================

/**
 * pending — 输出待处理消息到 stdout（JSON 格式）
 * agent 读取此输出来了解有哪些消息需要处理
 */
function pending() {
  const messages = readMessages();
  // 输出精简版（去掉 raw 字段以减少噪音）
  const clean = messages.map(m => {
    const { raw, ...rest } = m;
    return rest;
  });
  console.log(JSON.stringify(clean, null, 2));
}

/**
 * download — 下载所有待处理消息中的附件
 * 下载到 downloads/ 目录，并更新 messages.json 中的 localPath
 */
async function download() {
  const messages = readMessages();
  let downloadCount = 0;

  for (const msg of messages) {
    if (!msg.attachments || msg.attachments.length === 0) continue;
    for (const att of msg.attachments) {
      if (!att.downloadCode || att.localPath) continue;
      try {
        const fileName = att.fileName || `${att.type}_${Date.now()}`;
        const localPath = await api.downloadFile(att.downloadCode, DOWNLOADS_DIR, fileName);
        att.localPath = localPath;
        downloadCount++;
        console.error(`📥 已下载: ${localPath}`);
      } catch (err) {
        console.error(`⚠️ 下载失败 (${att.type}): ${err.message}`);
      }
    }
  }

  // 写回更新后的 messages.json（含 localPath）
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2), 'utf8');
  console.error(`✅ 下载完成，共 ${downloadCount} 个附件`);
}

/**
 * archive — 将所有待处理消息归档到 message_history.json
 * 可选：通过 --replies JSON 或 --replies-file 记录回复信息
 *
 * replies 格式: { "messageId": { "content": "回复内容", "type": "text|markdown" } }
 */
function archive() {
  // 解析 --replies / --replies-file 参数
  let repliesMap = {};
  const args = process.argv.slice(3);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--replies' && args[i + 1]) {
      try { repliesMap = JSON.parse(args[i + 1]); } catch (_) {
        console.error('⚠️ --replies JSON 解析失败');
      }
      i++;
    } else if (args[i] === '--replies-file' && args[i + 1]) {
      try { repliesMap = JSON.parse(fs.readFileSync(args[i + 1], 'utf8')); } catch (_) {
        console.error('⚠️ --replies-file 读取失败');
      }
      i++;
    }
  }

  const messages = readMessages();
  if (messages.length === 0) {
    console.error('📭 没有待归档的消息');
    return;
  }

  // 合并回复信息
  for (const msg of messages) {
    const reply = repliesMap[msg.messageId];
    if (reply) {
      msg.replyContent = reply.content || '';
      msg.replyType = reply.type || 'text';
    }
    msg.processedAt = new Date().toISOString();
  }

  // 追加到历史文件
  let history = [];
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8') || '[]');
    }
  } catch (_) {}

  history.push(...messages);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');

  // 清空待处理消息
  fs.writeFileSync(MESSAGES_FILE, '[]', 'utf8');

  // 检查历史文件大小，超过 100MB 自动备份
  const stats = fs.statSync(HISTORY_FILE);
  if (stats.size > MAX_HISTORY_SIZE) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
    const backupFile = path.join(SKILL_DIR, `message_history_${timestamp}.json`);
    fs.renameSync(HISTORY_FILE, backupFile);
    fs.writeFileSync(HISTORY_FILE, '[]', 'utf8');
    console.error(`📦 历史文件超过 100MB，已备份到: ${backupFile}`);
  }

  console.error(`✅ 已归档 ${messages.length} 条消息`);
}

// ==================== 主入口 ====================

const command = process.argv[2];

switch (command) {
  case 'pending':
    pending();
    break;
  case 'download':
    download().catch(err => {
      console.error(`❌ 下载失败: ${err.message}`);
      process.exit(1);
    });
    break;
  case 'archive':
    archive();
    break;
  default:
    console.log(`钉钉消息处理器 — CLI 工具

用法: node message-processor.js <command>

命令:
  pending     输出待处理消息（JSON 到 stdout）
  download    下载所有待处理消息的附件到 downloads/
  archive     归档所有待处理消息到 message_history.json
              --replies '<json>'         附带回复信息（JSON 字符串）
              --replies-file <path>      附带回复信息（JSON 文件）

回复信息格式:
  { "messageId": { "content": "回复内容", "type": "text|markdown" } }

注意: 此工具不生成回复内容。回复由 agent (Claude Code / OpenCode) 的 AI 能力生成。`);
    process.exit(0);
}
