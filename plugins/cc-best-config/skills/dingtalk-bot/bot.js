#!/usr/bin/env node
/**
 * 钉钉机器人服务
 * 使用 dingtalk-stream 的 Stream 模式接收消息并保存到文件
 * 消息处理由 agent（Claude Code / OpenCode）的定时任务驱动
 */

const { DWClient, TOPIC_ROBOT, TOPIC_CARD, EventAck } = require('dingtalk-stream');
const fs = require('fs');
const path = require('path');
const DingTalkAPI = require('./dingtalk-api');

const SKILL_DIR = __dirname;
const CONFIG_FILE = path.join(SKILL_DIR, 'config.json');

// 加载配置
if (!fs.existsSync(CONFIG_FILE)) {
  console.error('❌ 配置文件不存在:', CONFIG_FILE);
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
if (!config.clientId || !config.clientSecret) {
  console.error('❌ 配置文件缺少 clientId 或 clientSecret');
  process.exit(1);
}

const MESSAGES_FILE = path.resolve(SKILL_DIR, config.outputFile || './messages.json');

// DingTalk API 实例（用于卡片流式）
const api = new DingTalkAPI({ clientId: config.clientId, clientSecret: config.clientSecret });
const enableCardStreaming = config.enableCardStreaming === true && !!config.cardTemplateId;

// 确保消息文件存在
if (!fs.existsSync(MESSAGES_FILE)) {
  fs.writeFileSync(MESSAGES_FILE, '[]', 'utf8');
}

console.log('🤖 钉钉机器人服务启动中...');
console.log(`   Client ID: ${config.clientId}`);
console.log(`   消息文件：${MESSAGES_FILE}`);
console.log(`   消息处理：由 agent 定时任务驱动（非内置处理器）`);
console.log('');

// 从消息数据中提取内容和附件
function extractMessage(data) {
  const msgType = data.msgtype || 'text';
  let content = '';
  const attachments = [];

  switch (msgType) {
    case 'text':
      content = (data.text?.content || '').trim();
      break;

    case 'picture':
      content = '[图片]';
      if (data.content) {
        try {
          const picInfo = typeof data.content === 'string' ? JSON.parse(data.content) : data.content;
          if (picInfo.downloadCode) attachments.push({ type: 'picture', downloadCode: picInfo.downloadCode });
        } catch (_) {}
      }
      break;

    case 'audio':
      content = data.content ? (() => {
        try {
          const audioInfo = typeof data.content === 'string' ? JSON.parse(data.content) : data.content;
          attachments.push({
            type: 'audio',
            downloadCode: audioInfo.downloadCode,
            recognition: audioInfo.recognition || '',
            duration: audioInfo.duration,
          });
          return audioInfo.recognition || '[语音]';
        } catch (_) { return '[语音]'; }
      })() : '[语音]';
      break;

    case 'video':
      content = '[视频]';
      if (data.content) {
        try {
          const videoInfo = typeof data.content === 'string' ? JSON.parse(data.content) : data.content;
          attachments.push({
            type: 'video',
            downloadCode: videoInfo.downloadCode,
            videoType: videoInfo.videoType,
            duration: videoInfo.duration,
          });
        } catch (_) {}
      }
      break;

    case 'file':
      if (data.content) {
        try {
          const fileInfo = typeof data.content === 'string' ? JSON.parse(data.content) : data.content;
          content = `[文件:${fileInfo.fileName || '未知文件'}]`;
          attachments.push({
            type: 'file',
            downloadCode: fileInfo.downloadCode,
            fileName: fileInfo.fileName,
          });
        } catch (_) { content = '[文件]'; }
      } else {
        content = '[文件]';
      }
      break;

    case 'richText':
      if (data.content) {
        try {
          // data.content 可能是对象或 JSON 字符串
          const richContent = typeof data.content === 'string' ? JSON.parse(data.content) : data.content;
          const richTextArr = richContent.richText || [];
          // 提取文本部分和图片附件
          const textParts = [];
          for (const item of richTextArr) {
            if (item.text) textParts.push(item.text.trim());
            if (item.type === 'picture' && (item.downloadCode || item.pictureDownloadCode)) {
              attachments.push({
                type: 'picture',
                downloadCode: item.downloadCode || item.pictureDownloadCode,
                pictureDownloadCode: item.pictureDownloadCode,
              });
            }
          }
          content = textParts.filter(Boolean).join(' ') || '[富文本]';
          attachments.push({ type: 'richText', richText: richTextArr });
        } catch (_) { content = '[富文本]'; }
      } else {
        content = '[富文本]';
      }
      break;

    default:
      content = (data.text?.content || '').trim() || `[${msgType}消息]`;
      break;
  }

  return { msgType, content, attachments };
}

// 创建客户端
const client = new DWClient({
  clientId: config.clientId,
  clientSecret: config.clientSecret,
  debug: true
});

// 链式调用注册
client
  .registerCallbackListener(TOPIC_ROBOT, async (res) => {
    try {
      console.log('📨 收到消息回调');
      const data = JSON.parse(res.data);

      const { msgType, content, attachments } = extractMessage(data);

      const message = {
        messageId: data.msgId,
        senderStaffId: data.senderStaffId,
        senderNick: data.senderNick,
        msgType,
        content,
        attachments,
        conversationType: data.conversationType,
        conversationId: data.conversationId,
        conversationTitle: data.conversationTitle || '',
        sessionWebhook: data.sessionWebhook,
        robotCode: data.robotCode,
        createAt: data.createAt,
        receivedAt: new Date().toISOString(),
        raw: data
      };

      console.log(`📩 [${new Date().toLocaleString()}] 收到消息:`);
      console.log(`   来自：${message.senderNick} (${message.senderStaffId})`);
      console.log(`   类型：${msgType}`);
      console.log(`   内容：${message.content}`);

      // 保存到文件（追加到数组，去重）
      let messages = [];
      try {
        messages = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8') || '[]');
      } catch (_) {}

      // 检查消息是否已存在（根据 messageId 去重）
      const exists = messages.some(m => m.messageId === message.messageId);
      if (exists) {
        console.log(`   ⚠️ 消息已存在，跳过: ${message.messageId}`);
        client.socketCallBackResponse(res.headers.messageId, { status: 'SUCCESS' });
        return;
      }

      // 可选：创建 AI Card 即时响应
      if (enableCardStreaming) {
        try {
          const outTrackId = `msg_${message.messageId}_${Date.now()}`;
          message.outTrackId = outTrackId;
          await api.createAndDeliverCard({
            cardTemplateId: config.cardTemplateId,
            outTrackId,
            conversationType: data.conversationType,
            conversationId: data.conversationId,
            cardData: { cardParamMap: { content: '思考中...' } },
          });
          console.log(`   🃏 已创建 AI Card: ${outTrackId}`);
        } catch (cardErr) {
          console.error(`   ⚠️ 创建 AI Card 失败: ${cardErr.message}`);
        }
      }

      messages.push(message);
      fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2), 'utf8');
      console.log(`   💾 已保存到: ${MESSAGES_FILE}`);
      console.log(`   ⏳ 等待 agent 定时任务处理...\n`);

      // 返回 ACK
      client.socketCallBackResponse(res.headers.messageId, { status: 'SUCCESS' });
    } catch (err) {
      console.error(`❌ 处理消息出错: ${err.message}`);
      client.socketCallBackResponse(res.headers.messageId, { status: 'SUCCESS' });
    }
  })
  .registerAllEventListener((msg) => {
    return { status: EventAck.SUCCESS };
  });

// 注册卡片交互事件回调（如果启用了卡片流式）
if (enableCardStreaming) {
  client.registerCallbackListener(TOPIC_CARD, async (res) => {
    try {
      console.log('🃏 收到卡片交互事件');
      const data = JSON.parse(res.data);
      console.log(`   卡片ID: ${data.outTrackId || 'unknown'}`);
      console.log(`   操作: ${JSON.stringify(data)}`);
      client.socketCallBackResponse(res.headers.messageId, { status: 'SUCCESS' });
    } catch (err) {
      console.error(`❌ 处理卡片事件出错: ${err.message}`);
      client.socketCallBackResponse(res.headers.messageId, { status: 'SUCCESS' });
    }
  });
}

client.connect();

console.log('🌐 正在连接钉钉 Stream 服务...');

// 保持进程运行 - 使用长定时器保持事件循环
setTimeout(() => {}, 2147483647);

console.log('✅ 钉钉机器人已启动并保持运行');
console.log('📡 等待消息中...（消息处理由 agent 定时任务驱动）\n');

// 心跳
const heartbeatInterval = setInterval(() => {
  const now = new Date().toISOString();
  console.log(`[${now}] 💓 心跳 - 连接正常`);
}, 30000);

// 确保进程不会因为 stdin 而退出
if (process.stdin.isTTY) {
  process.stdin.setEncoding('utf8');
  process.stdin.resume();
}

// 监听可能的 uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error(`\n❌ [${new Date().toISOString()}] Uncaught Exception:`, err.message);
  // 不退出，继续运行
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(`\n❌ [${new Date().toISOString()}] Unhandled Rejection:`, reason);
  // 不退出，继续运行
});

// 优雅退出处理
process.on('SIGTERM', () => {
  console.log('\n🛑 收到停止信号，正在退出...');
  clearInterval(heartbeatInterval);
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n🛑 收到中断信号，正在退出...');
  clearInterval(heartbeatInterval);
  process.exit(0);
});
