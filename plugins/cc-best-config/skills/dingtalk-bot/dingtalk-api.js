/**
 * DingTalk REST API 封装
 * 集中管理 token、文件下载/上传、AI 卡片流式、多类型消息发送
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const OAPI_BASE = 'https://oapi.dingtalk.com';
const API_BASE = 'https://api.dingtalk.com';

class DingTalkAPI {
  constructor({ clientId, clientSecret }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.robotCode = clientId; // robotCode 等于 clientId
    this._token = null;
    this._tokenExpiresAt = 0;
  }

  // ==================== Token 管理 ====================

  async getAccessToken() {
    const now = Date.now();
    if (this._token && now < this._tokenExpiresAt) {
      return this._token;
    }

    const url = `${OAPI_BASE}/gettoken?appkey=${this.clientId}&appsecret=${this.clientSecret}`;
    const res = await axios.get(url, { timeout: 10000 });

    if (res.data.errcode !== 0) {
      throw new Error(`获取 access_token 失败: ${res.data.errmsg}`);
    }

    this._token = res.data.access_token;
    // TTL 6000 秒，提前 60 秒刷新
    this._tokenExpiresAt = now + (6000 - 60) * 1000;
    return this._token;
  }

  // ==================== 文件下载 ====================

  async getFileDownloadUrl(downloadCode) {
    const token = await this.getAccessToken();
    const url = `${API_BASE}/v1.0/robot/messageFiles/download`;
    const res = await axios.post(url, {
      downloadCode,
      robotCode: this.robotCode,
    }, {
      headers: {
        'x-acs-dingtalk-access-token': token,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
    return res.data.downloadUrl;
  }

  async downloadFile(downloadCode, destDir, fileName) {
    const downloadUrl = await this.getFileDownloadUrl(downloadCode);

    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const finalName = fileName || `file_${Date.now()}`;
    const destPath = path.join(destDir, finalName);

    const res = await axios.get(downloadUrl, {
      responseType: 'stream',
      timeout: 60000,
    });

    const writer = fs.createWriteStream(destPath);
    res.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(destPath));
      writer.on('error', reject);
    });
  }

  // ==================== AI 卡片流式 ====================

  async createAndDeliverCard({ cardTemplateId, outTrackId, conversationType, conversationId, cardData }) {
    const token = await this.getAccessToken();
    const url = `${API_BASE}/v1.0/card/instances/createAndDeliver`;

    // conversationType: 0=单聊, 1=群聊
    const openConversationId = conversationType === '1' ? conversationId : undefined;

    const body = {
      cardTemplateId,
      outTrackId,
      cardData: cardData || { cardParamMap: {} },
      robotCode: this.robotCode,
    };

    if (openConversationId) {
      body.openConversationId = openConversationId;
    }

    const res = await axios.post(url, body, {
      headers: {
        'x-acs-dingtalk-access-token': token,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
    return res.data;
  }

  async streamCardUpdate({ outTrackId, key, content, isFull, isFinalize }) {
    const token = await this.getAccessToken();
    const url = `${API_BASE}/v1.0/card/streaming`;

    const body = {
      outTrackId,
      key: key || 'content',
      content: content || '',
      isFull: isFull !== undefined ? isFull : true, // markdown 必须全量替换
      isFinalize: isFinalize || false,
    };

    const res = await axios.put(url, body, {
      headers: {
        'x-acs-dingtalk-access-token': token,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
    return res.data;
  }

  // ==================== 媒体上传 ====================

  /**
   * 上传本地文件到钉钉媒体存储
   * @param {string} filePath - 本地文件路径
   * @param {string} type - 媒体类型: image, voice, video, file
   * @returns {{ media_id: string, type: string, created_at: number }}
   */
  async uploadMedia(filePath, type = 'file') {
    const token = await this.getAccessToken();
    const form = new FormData();
    form.append('media', fs.createReadStream(filePath));
    form.append('type', type);

    const res = await axios.post(
      `${OAPI_BASE}/media/upload?access_token=${token}&type=${type}`,
      form,
      { headers: form.getHeaders(), timeout: 60000 }
    );

    if (res.data.errcode !== 0) {
      throw new Error(`媒体上传失败: ${res.data.errmsg}`);
    }
    return res.data; // { media_id, type, created_at }
  }

  // ==================== Robot API 消息发送 ====================

  /**
   * 通过 Robot API 发送富媒体消息（支持图片、文件、链接等）
   * 单聊用 userIds，群聊用 openConversationId
   *
   * 常用 msgKey:
   *   sampleText      → { content }
   *   sampleMarkdown  → { title, text }
   *   sampleImageMsg  → { photoURL }
   *   sampleLink      → { text, title, picUrl, messageUrl }
   *   sampleFile      → { fileName, fileURL, fileType }
   *   sampleAudio     → { mediaId, duration }
   *   sampleVideo     → { videoMediaId, videoType, picMediaId }
   */
  async sendRobotMessage({ userIds, openConversationId, msgKey, msgParam }) {
    const token = await this.getAccessToken();
    const paramStr = typeof msgParam === 'string' ? msgParam : JSON.stringify(msgParam);

    if (openConversationId) {
      // 群聊消息
      const res = await axios.post(`${API_BASE}/v1.0/robot/groupMessages/send`, {
        robotCode: this.robotCode,
        openConversationId,
        msgKey,
        msgParam: paramStr,
      }, {
        headers: {
          'x-acs-dingtalk-access-token': token,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });
      return res.data;
    } else {
      // 单聊消息
      const res = await axios.post(`${API_BASE}/v1.0/robot/oToMessages/batchSend`, {
        robotCode: this.robotCode,
        userIds: Array.isArray(userIds) ? userIds : [userIds],
        msgKey,
        msgParam: paramStr,
      }, {
        headers: {
          'x-acs-dingtalk-access-token': token,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });
      return res.data;
    }
  }

  /**
   * 便捷方法：发送图片消息
   * @param {string} imageSource - 图片 URL 或本地文件路径
   */
  async sendImage({ imageSource, userIds, openConversationId }) {
    let photoURL = imageSource;
    // 本地文件 → 先上传
    if (!imageSource.startsWith('http')) {
      const uploaded = await this.uploadMedia(imageSource, 'image');
      photoURL = uploaded.media_id;
    }
    return this.sendRobotMessage({
      userIds,
      openConversationId,
      msgKey: 'sampleImageMsg',
      msgParam: { photoURL },
    });
  }

  /**
   * 便捷方法：发送文件消息
   * @param {string} fileSource - 文件 URL 或本地文件路径
   */
  async sendFile({ fileSource, fileName, userIds, openConversationId }) {
    let fileURL = fileSource;
    // 本地文件 → 先上传
    if (!fileSource.startsWith('http')) {
      const uploaded = await this.uploadMedia(fileSource, 'file');
      fileURL = uploaded.media_id;
      if (!fileName) fileName = path.basename(fileSource);
    }
    const name = fileName || path.basename(fileSource);
    const ext = path.extname(name).replace('.', '') || 'file';
    return this.sendRobotMessage({
      userIds,
      openConversationId,
      msgKey: 'sampleFile',
      msgParam: { fileName: name, fileURL, fileType: ext },
    });
  }

  /**
   * 便捷方法：发送链接消息
   */
  async sendLink({ title, text, messageUrl, picUrl, userIds, openConversationId }) {
    return this.sendRobotMessage({
      userIds,
      openConversationId,
      msgKey: 'sampleLink',
      msgParam: {
        title: title || '链接',
        text: text || '',
        messageUrl,
        picUrl: picUrl || '',
      },
    });
  }

  // ==================== Webhook 消息体构建（静态） ====================

  static buildMessageBody({ msgtype, content, title, senderStaffId, atAll, linkUrl, picUrl }) {
    const at = {
      atUserIds: atAll ? [] : (senderStaffId ? [senderStaffId] : []),
      isAtAll: !!atAll,
    };

    switch (msgtype) {
      case 'markdown':
        return {
          msgtype: 'markdown',
          markdown: {
            title: title || '消息',
            text: content,
          },
          at,
        };

      case 'actionCard':
        return {
          msgtype: 'actionCard',
          actionCard: {
            title: title || '消息',
            text: content,
          },
        };

      case 'link':
        return {
          msgtype: 'link',
          link: {
            title: title || '链接',
            text: content || '',
            messageUrl: linkUrl || '',
            picUrl: picUrl || '',
          },
        };

      case 'text':
      default:
        return {
          msgtype: 'text',
          text: { content },
          at,
        };
    }
  }
}

module.exports = DingTalkAPI;
