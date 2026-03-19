#!/usr/bin/env node
/**
 * 钉钉机器人消息发送工具
 * 支持 text/markdown/actionCard/link 通过 webhook 发送
 * 支持图片/文件/链接通过 Robot API 发送（需要 config.json）
 *
 * Webhook 模式（文本类）:
 *   node send-message.js --webhook=<url> --user=<staffId> --message="内容"
 *   node send-message.js --webhook=<url> --user=<staffId> --type=markdown --title="标题" --message="# Hello"
 *
 * Robot API 模式（富媒体）:
 *   node send-message.js --user=<staffId> --image=<图片路径或URL>
 *   node send-message.js --user=<staffId> --send-file=<文件路径或URL> [--file-name=名称]
 *   node send-message.js --user=<staffId> --link-url=<URL> --title="标题" --message="描述"
 *   node send-message.js --conversation-id=<id> --image=<图片>  (群聊)
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const DingTalkAPI = require('./dingtalk-api');

const SKILL_DIR = __dirname;
const CONFIG_FILE = path.join(SKILL_DIR, 'config.json');

program
  // 通用参数
  .option('-w, --webhook <url>', '会话 webhook URL（文本消息必填）')
  .option('-u, --user <staffId>', '接收者 StaffId')
  .option('-m, --message <content>', '消息内容/描述')
  .option('-f, --file <path>', '从文件读取消息内容')
  .option('-t, --type <type>', '消息类型: text, markdown, actionCard, link (默认 text)', 'text')
  .option('--title <title>', 'markdown/actionCard/link 标题')
  // 富媒体参数（通过 Robot API）
  .option('--image <source>', '发送图片（本地路径或 URL）')
  .option('--send-file <source>', '发送文件（本地路径或 URL）')
  .option('--file-name <name>', '文件显示名称')
  .option('--link-url <url>', '链接地址（type=link 或 Robot API）')
  .option('--pic-url <url>', '链接封面图 URL')
  .option('--conversation-id <id>', '群聊会话 ID（群聊时使用）')
  // 流式参数
  .option('-s, --stream', '启用流式发送（长消息分段发送）', false)
  .option('-d, --delay <ms>', '流式发送时每段延迟（毫秒）', '1000')
  .option('--chunk-size <size>', '流式发送时每段最大字符数', '500')
  .option('--at-all', '@所有人', false)
  .option('--silent', '静默模式（不输出日志）', false)
  .parse();

const options = program.opts();

// 日志输出
function log(...args) {
  if (!options.silent) console.log(...args);
}
function error(...args) {
  console.error(...args);
}

// 判断是否为富媒体模式（需要 Robot API）
const isRichMediaMode = !!(options.image || options.sendFile || (options.linkUrl && !options.webhook));

// 验证参数
if (!isRichMediaMode) {
  // Webhook 模式
  if (!options.webhook) {
    error('❌ 错误: 缺少 --webhook 参数（文本消息必填，或使用 --image/--send-file/--link-url 走 Robot API）');
    process.exit(1);
  }
  if (!options.user) {
    error('❌ 错误: 缺少 --user 参数');
    process.exit(1);
  }
  if (!options.message && !options.file) {
    error('❌ 错误: 缺少 --message 或 --file 参数');
    process.exit(1);
  }
} else {
  // Robot API 模式
  if (!options.user && !options.conversationId) {
    error('❌ 错误: 需要 --user（单聊）或 --conversation-id（群聊）');
    process.exit(1);
  }
}

// 获取消息内容（文本模式）
let messageContent = '';
if (options.file) {
  try {
    messageContent = fs.readFileSync(options.file, 'utf8');
  } catch (err) {
    error(`❌ 读取文件失败: ${err.message}`);
    process.exit(1);
  }
} else if (options.message) {
  messageContent = options.message;
}

// 加载 DingTalk API（富媒体模式需要）
function loadApi() {
  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (_) {
    error('❌ 错误: 富媒体发送需要 config.json（含 clientId/clientSecret）');
    process.exit(1);
  }
  if (!config.clientId || !config.clientSecret) {
    error('❌ 错误: config.json 缺少 clientId 或 clientSecret');
    process.exit(1);
  }
  return new DingTalkAPI({ clientId: config.clientId, clientSecret: config.clientSecret });
}

// ==================== Webhook 发送 ====================

async function sendSingleMessage(webhook, staffId, content, atAll = false, msgtype = 'text', title = '') {
  const body = DingTalkAPI.buildMessageBody({
    msgtype,
    content,
    title: title || '消息',
    senderStaffId: staffId,
    atAll,
    linkUrl: options.linkUrl,
    picUrl: options.picUrl,
  });

  try {
    const response = await axios.post(webhook, body, {
      timeout: 10000,
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.data && response.data.errcode === 0) {
      return { success: true };
    } else {
      return { success: false, error: response.data?.errmsg || '未知错误', code: response.data?.errcode };
    }
  } catch (err) {
    return { success: false, error: err.message, code: err.response?.data?.errcode };
  }
}

// 将长消息分段
function splitMessage(content, chunkSize) {
  const chunks = [];
  let currentChunk = '';
  const lines = content.split('\n');

  for (const line of lines) {
    if ((currentChunk + line).length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = line + '\n';
    } else {
      currentChunk += line + '\n';
    }
  }
  if (currentChunk.trim()) chunks.push(currentChunk.trim());

  const finalChunks = [];
  for (const chunk of chunks) {
    if (chunk.length > chunkSize) {
      for (let i = 0; i < chunk.length; i += chunkSize) {
        finalChunks.push(chunk.slice(i, i + chunkSize));
      }
    } else {
      finalChunks.push(chunk);
    }
  }
  return finalChunks;
}

// 流式发送消息
async function sendStreamMessage(webhook, staffId, content, delayMs, chunkSize) {
  const chunks = splitMessage(content, chunkSize);
  const results = [];
  log(`📨 开始流式发送，共 ${chunks.length} 段消息...\n`);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const prefix = chunks.length > 1 ? `[${i + 1}/${chunks.length}] ` : '';
    const fullContent = prefix + chunk;
    log(`📝 发送第 ${i + 1}/${chunks.length} 段...`);

    const result = await sendSingleMessage(webhook, staffId, fullContent, options.atAll, options.type, options.title);
    results.push(result);

    if (!result.success) {
      error(`❌ 第 ${i + 1} 段发送失败: ${result.error}`);
    } else {
      log(`✅ 第 ${i + 1} 段发送成功`);
    }
    if (i < chunks.length - 1 && delayMs > 0) {
      log(`⏳ 等待 ${delayMs}ms...\n`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  return results;
}

// ==================== Robot API 发送（富媒体） ====================

async function sendRichMedia() {
  const api = loadApi();
  const userIds = options.user ? [options.user] : undefined;
  const openConversationId = options.conversationId || undefined;

  try {
    if (options.image) {
      log(`🖼️ 发送图片: ${options.image}`);
      await api.sendImage({ imageSource: options.image, userIds, openConversationId });
      log('✅ 图片发送成功');
    } else if (options.sendFile) {
      log(`📎 发送文件: ${options.sendFile}`);
      await api.sendFile({
        fileSource: options.sendFile,
        fileName: options.fileName,
        userIds,
        openConversationId,
      });
      log('✅ 文件发送成功');
    } else if (options.linkUrl) {
      log(`🔗 发送链接: ${options.linkUrl}`);
      await api.sendLink({
        title: options.title || '链接',
        text: messageContent || '',
        messageUrl: options.linkUrl,
        picUrl: options.picUrl,
        userIds,
        openConversationId,
      });
      log('✅ 链接发送成功');
    }
  } catch (err) {
    error(`❌ 发送失败: ${err.message}`);
    if (err.response?.data) error(`   详情: ${JSON.stringify(err.response.data)}`);
    process.exit(1);
  }
}

// ==================== 主函数 ====================

async function main() {
  log('🤖 钉钉机器人消息发送工具\n');

  if (isRichMediaMode) {
    // Robot API 模式
    log(`📡 模式: Robot API（富媒体）`);
    if (options.user) log(`👤 接收者: ${options.user}`);
    if (options.conversationId) log(`💬 群聊: ${options.conversationId}`);
    log('');
    await sendRichMedia();
    return;
  }

  // Webhook 模式
  log(`📍 Webhook: ${options.webhook.slice(0, 50)}...`);
  log(`👤 接收者: ${options.user}`);
  log(`📊 消息长度: ${messageContent.length} 字符`);
  log(`📋 消息类型: ${options.type}`);
  log(`🔄 流式模式: ${options.stream ? '开启' : '关闭'}`);
  if (options.title) log(`📌 标题: ${options.title}`);
  if (options.stream) {
    log(`⏱️  延迟: ${options.delay}ms`);
    log(`📏 分段大小: ${options.chunkSize} 字符`);
  }
  log('');

  let results;

  if (options.stream) {
    results = await sendStreamMessage(
      options.webhook, options.user, messageContent,
      parseInt(options.delay), parseInt(options.chunkSize)
    );
  } else {
    const result = await sendSingleMessage(
      options.webhook, options.user, messageContent,
      options.atAll, options.type, options.title
    );
    results = [result];
    if (result.success) {
      log('✅ 消息发送成功');
    } else {
      error(`❌ 消息发送失败: ${result.error}`);
    }
  }

  const successCount = results.filter(r => r.success).length;
  const failCount = results.length - successCount;
  log('\n📊 发送结果统计:');
  log(`   成功: ${successCount}`);
  log(`   失败: ${failCount}`);
  if (failCount > 0) process.exit(1);
}

main().catch(err => {
  error(`❌ 程序错误: ${err.message}`);
  process.exit(1);
});
