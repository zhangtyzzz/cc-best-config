#!/usr/bin/env node
/**
 * 钉钉机器人自动启动模块
 * 使用 shell 后台运行 (&) 而不是 detached 子进程
 */

const { exec, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SKILL_DIR = path.dirname(__filename);
const PID_FILE = path.join(SKILL_DIR, '.bot.pid');
const LOG_FILE = path.join(SKILL_DIR, '.bot.log');

// 检查机器人是否已在运行
function isRunning() {
  if (!fs.existsSync(PID_FILE)) {
    return false;
  }
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'));
    process.kill(pid, 0);
    return true;
  } catch (e) {
    fs.unlinkSync(PID_FILE);
    return false;
  }
}

// 启动机器人 - 使用 shell 的 & 后台运行
function startBot() {
  if (isRunning()) {
    console.log('🤖 钉钉机器人已在运行');
    return { success: true, alreadyRunning: true };
  }

  const configPath = path.join(SKILL_DIR, 'config.json');
  if (!fs.existsSync(configPath)) {
    return { success: false, message: '配置文件不存在' };
  }

  const botPath = path.join(SKILL_DIR, 'bot.js');
  
  // 使用 shell 的 & 让进程在后台运行
  // 这样 WebSocket 事件循环能正常工作
  const cmd = `cd "${SKILL_DIR}" && node "${botPath}" > "${LOG_FILE}" 2>&1 & echo $!`;
  
  try {
    const pid = parseInt(execSync(cmd, { 
      encoding: 'utf8', 
      shell: '/bin/bash',
      detached: false  // 关键：不用 detached
    }).trim());
    
    // 等待确认进程存活
    execSync(`sleep 2 && kill -0 ${pid} 2>/dev/null`);
    
    fs.writeFileSync(PID_FILE, pid.toString());
    console.log(`🤖 钉钉机器人已启动 (PID: ${pid})`);
    return { success: true, pid };
  } catch (e) {
    return { success: false, message: '启动失败: ' + e.message };
  }
}

// 停止机器人
function stopBot() {
  if (!fs.existsSync(PID_FILE)) {
    try {
      execSync(`pkill -f "node.*bot\.js" 2>/dev/null || true`);
      console.log('🛑 已停止');
      return { success: true };
    } catch (e) {
      return { success: false, message: '未运行' };
    }
  }

  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'));
    process.kill(pid, 'SIGTERM');
    fs.unlinkSync(PID_FILE);
    console.log('🛑 钉钉机器人已停止');
    return { success: true };
  } catch (e) {
    fs.unlinkSync(PID_FILE);
    return { success: false, message: '停止失败' };
  }
}

// 获取状态
function getStatus() {
  const running = isRunning();
  return {
    running,
    pid: running ? parseInt(fs.readFileSync(PID_FILE, 'utf8')) : null,
    logFile: LOG_FILE
  };
}

// 查看日志
function getLogs(lines = 50) {
  if (!fs.existsSync(LOG_FILE)) return '暂无日志';
  const content = fs.readFileSync(LOG_FILE, 'utf8');
  return content.split('\n').slice(-lines).join('\n');
}

// 自动启动
function autoStart() {
  if (isRunning()) {
    console.log('🤖 钉钉机器人已在运行');
    return { success: true, alreadyRunning: true };
  }
  console.log('🤖 正在启动钉钉机器人...');
  return startBot();
}

// CLI
if (require.main === module) {
  const cmd = process.argv[2] || 'status';
  switch (cmd) {
    case 'start': startBot(); break;
    case 'stop': stopBot(); break;
    case 'restart': stopBot(); setTimeout(startBot, 1000); break;
    case 'status': {
      const s = getStatus();
      console.log(s.running ? `✅ 运行中 (PID: ${s.pid})` : '❌ 未运行');
      break;
    }
    case 'logs': console.log(getLogs(parseInt(process.argv[3]) || 50)); break;
    case 'autostart': autoStart(); break;
    default: console.log('用法: node auto-start.js [start|stop|restart|status|logs|autostart]');
  }
}

module.exports = { startBot, stopBot, getStatus, getLogs, autoStart, isRunning };
