/**
 * Electron 日志模块
 * 将日志写入文件并提供查看接口
 */

import { app } from 'electron';
import fs from 'fs';
import path from 'path';

// 日志目录
let logDir = null;

// 日志文件路径
let mainLogPath = null;
let errorLogPath = null;

// 日志流
let mainLogStream = null;
let errorLogStream = null;

// 保存原始 console 方法
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
};

/**
 * 初始化日志系统
 */
export function initLogger() {
  // 设置日志目录
  logDir = path.join(app.getPath('userData'), 'logs');

  // 确保日志目录存在
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // 生成日志文件名（按日期）
  const date = new Date().toISOString().split('T')[0];
  mainLogPath = path.join(logDir, `main-${date}.log`);
  errorLogPath = path.join(logDir, `error-${date}.log`);

  // 创建写入流（追加模式）
  mainLogStream = fs.createWriteStream(mainLogPath, { flags: 'a' });
  errorLogStream = fs.createWriteStream(errorLogPath, { flags: 'a' });

  // 写入启动分隔符
  const startMsg = `\n${'='.repeat(60)}\n[${new Date().toISOString()}] Application started\n${'='.repeat(60)}\n`;
  mainLogStream.write(startMsg);
  errorLogStream.write(startMsg);

  // 重写 console 方法
  console.log = (...args) => {
    const message = formatMessage('LOG', args);
    mainLogStream.write(message + '\n');
    originalConsole.log(...args);
  };

  console.info = (...args) => {
    const message = formatMessage('INFO', args);
    mainLogStream.write(message + '\n');
    originalConsole.info(...args);
  };

  console.warn = (...args) => {
    const message = formatMessage('WARN', args);
    mainLogStream.write(message + '\n');
    errorLogStream.write(message + '\n');
    originalConsole.warn(...args);
  };

  console.error = (...args) => {
    const message = formatMessage('ERROR', args);
    mainLogStream.write(message + '\n');
    errorLogStream.write(message + '\n');
    originalConsole.error(...args);
  };

  // 捕获未处理的异常
  process.on('uncaughtException', (error) => {
    const message = formatMessage('UNCAUGHT', [error.stack || error.message || error]);
    errorLogStream.write(message + '\n');
    originalConsole.error('Uncaught Exception:', error);
  });

  process.on('unhandledRejection', (reason) => {
    const message = formatMessage('UNHANDLED', [reason]);
    errorLogStream.write(message + '\n');
    originalConsole.error('Unhandled Rejection:', reason);
  });

  console.log('[Logger] Log system initialized');
  console.log(`[Logger] Main log: ${mainLogPath}`);
  console.log(`[Logger] Error log: ${errorLogPath}`);
}

/**
 * 格式化日志消息
 */
function formatMessage(level, args) {
  const timestamp = new Date().toISOString();
  const content = args.map(arg => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 2);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');

  return `[${timestamp}] [${level}] ${content}`;
}

/**
 * 获取日志目录路径
 */
export function getLogDir() {
  return logDir;
}

/**
 * 获取日志文件列表
 */
export function getLogFiles() {
  if (!logDir || !fs.existsSync(logDir)) {
    return [];
  }

  return fs.readdirSync(logDir)
    .filter(file => file.endsWith('.log'))
    .map(file => ({
      name: file,
      path: path.join(logDir, file),
      size: fs.statSync(path.join(logDir, file)).size,
      modified: fs.statSync(path.join(logDir, file)).mtime,
    }))
    .sort((a, b) => b.modified - a.modified);
}

/**
 * 读取日志文件内容
 * @param {string} filename 文件名
 * @param {number} lines 读取的行数（从末尾开始）
 */
export function readLogFile(filename, lines = 200) {
  const filePath = path.join(logDir, filename);

  if (!fs.existsSync(filePath)) {
    return { error: 'File not found' };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const allLines = content.split('\n');
    const lastLines = allLines.slice(-lines);

    return {
      filename,
      totalLines: allLines.length,
      lines: lastLines,
      content: lastLines.join('\n'),
    };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * 清理旧日志（保留最近 N 天）
 */
export function cleanOldLogs(daysToKeep = 7) {
  if (!logDir || !fs.existsSync(logDir)) {
    return;
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  const files = fs.readdirSync(logDir);
  let deletedCount = 0;

  for (const file of files) {
    const filePath = path.join(logDir, file);
    const stat = fs.statSync(filePath);

    if (stat.mtime < cutoffDate) {
      fs.unlinkSync(filePath);
      deletedCount++;
    }
  }

  if (deletedCount > 0) {
    console.log(`[Logger] Cleaned ${deletedCount} old log files`);
  }
}

/**
 * 关闭日志流
 */
export function closeLogger() {
  if (mainLogStream) {
    mainLogStream.end();
  }
  if (errorLogStream) {
    errorLogStream.end();
  }
}

export default {
  initLogger,
  getLogDir,
  getLogFiles,
  readLogFile,
  cleanOldLogs,
  closeLogger,
};
