/**
 * Electron 主进程
 */

import { app, BrowserWindow, ipcMain, session, dialog, shell, Menu } from "electron";
import path from "path";
import net from "net";
import { fileURLToPath } from "url";
import { createTray, destroyTray } from "./tray.js";
import {
  initAutoLaunch,
  getAutoLaunchEnabled,
  setAutoLaunchEnabled,
} from "./autoLaunch.js";
import { checkForUpdates, getUpdateStatus, downloadUpdate, installUpdate } from "./updater.js";
import { initLogger, getLogDir, getLogFiles, readLogFile, cleanOldLogs, closeLogger } from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 设置应用名称和进程标题
process.title = 'OctoProxy';
if (process.platform === 'darwin') {
  app.setName('OctoProxy');
}

// 保持窗口引用，防止被垃圾回收
let mainWindow = null;
let logWindow = null;
let isQuitting = false;
let currentPort = null; // 当前使用的端口

// OAuth 无痕窗口管理
const oauthWindows = new Map();

/**
 * 检查端口是否被占用
 * @param {number} port 端口号
 * @returns {Promise<boolean>} true 表示端口可用，false 表示被占用
 */
function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", (err) => {
      if (err.code === "EADDRINUSE") {
        resolve(false); // 端口被占用
      } else {
        resolve(false); // 其他错误也视为不可用
      }
    });

    server.once("listening", () => {
      server.close();
      resolve(true); // 端口可用
    });

    server.listen(port, "0.0.0.0");
  });
}

/**
 * 查找可用端口
 * @param {number} startPort 起始端口
 * @param {number} maxAttempts 最大尝试次数
 * @returns {Promise<number|null>} 可用端口或 null
 */
async function findAvailablePort(startPort, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    const available = await checkPortAvailable(port);
    if (available) {
      return port;
    }
  }
  return null;
}

// 获取应用路径
export function getAppPaths() {
  const isPackaged = app.isPackaged;
  // 统一使用 userData 目录存储数据（开发和生产模式共享同一数据库）
  const userData = app.getPath("userData");

  if (isPackaged) {
    // 打包后: 资源文件从 resources 目录获取
    const resources = process.resourcesPath;

    return {
      configDir: path.join(userData, "configs"),
      dataDir: path.join(userData, "data"),
      staticDir: path.join(resources, "static"),
      migrationsDir: path.join(resources, "app", "lib", "db", "migrations"),
      isElectron: true,
      isPackaged: true,
    };
  } else {
    // 开发模式: 数据存储使用 userData 目录（与生产模式共享），其他资源从项目目录获取
    const projectRoot = path.resolve(__dirname, "..");
    return {
      configDir: path.join(userData, "configs"),
      dataDir: path.join(userData, "data"),
      staticDir: path.join(projectRoot, "static"),
      migrationsDir: path.join(projectRoot, "app", "lib", "db", "migrations"),
      isElectron: true,
      isPackaged: false,
    };
  }
}

// 设置环境变量，供后端使用
function setupEnvironment() {
  const paths = getAppPaths();
  process.env.ELECTRON_APP = "true";
  process.env.ELECTRON_CONFIG_DIR = paths.configDir;
  process.env.ELECTRON_DATA_DIR = paths.dataDir;
  process.env.ELECTRON_STATIC_DIR = paths.staticDir;
  process.env.ELECTRON_MIGRATIONS_DIR = paths.migrationsDir;
  process.env.ELECTRON_IS_PACKAGED = paths.isPackaged ? "true" : "false";
}

// 创建主窗口
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false, // 先隐藏，加载完成后再显示
    icon: path.join(__dirname, "../assets/icon.png"),
  });

  // 加载应用（使用当前端口）
  const port = currentPort || 12000;
  mainWindow.loadURL(`http://localhost:${port}`);

  // 窗口准备好后显示
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // 关闭窗口时隐藏到托盘而非退出
  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // 开发模式下打开开发者工具
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }
}

// 显示主窗口
export function showWindow() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
}

// 启动后端服务
async function startBackendServer(port) {
  try {
    // 设置端口环境变量，供后端使用
    process.env.PORT = String(port);
    process.env.HOSTNAME = '0.0.0.0';
    currentPort = port;

    if (app.isPackaged) {
      // 生产模式：启动 Next.js standalone 服务器
      // 由于 outputFileTracingRoot 设置为项目根目录，standalone 输出结构为 standalone/app/server.js
      const standaloneDir = path.join(
        process.resourcesPath,
        'app',
        '.next',
        'standalone',
        'app'
      );
      const standaloneServerPath = path.join(standaloneDir, 'server.js');

      console.log(`[Electron] Starting Next.js standalone server from: ${standaloneServerPath}`);
      console.log(`[Electron] Standalone directory: ${standaloneDir}`);

      // 设置 Next.js 所需的环境变量
      process.env.NODE_ENV = 'production';

      // 切换到 standalone 目录，Next.js 需要正确的 cwd
      process.chdir(standaloneDir);
      console.log(`[Electron] Changed cwd to: ${process.cwd()}`);

      // 锁定 process.title，防止 Next.js 覆盖
      const originalTitle = 'OctoProxy';
      Object.defineProperty(process, 'title', {
        get: () => originalTitle,
        set: () => {}, // 忽略所有设置尝试
        configurable: false,
      });

      // 动态导入 standalone 服务器
      await import(standaloneServerPath);
      console.log(`[Electron] Next.js standalone server started on port ${port}`);
    } else {
      // 开发模式：启动 Next.js dev 服务器
      const { spawn } = await import('child_process');
      const appDir = path.join(__dirname, '..', 'app');

      console.log(`[Electron] Starting Next.js dev server in: ${appDir}`);

      // 启动 next dev 进程
      const nextProcess = spawn('npm', ['run', 'dev'], {
        cwd: appDir,
        env: {
          ...process.env,
          PORT: String(port),
          FORCE_COLOR: '1',
        },
        shell: true,
      });

      // 监听输出
      nextProcess.stdout.on('data', (data) => {
        console.log(`[Next.js] ${data.toString().trim()}`);
      });

      nextProcess.stderr.on('data', (data) => {
        console.error(`[Next.js Error] ${data.toString().trim()}`);
      });

      nextProcess.on('error', (error) => {
        console.error('[Electron] Failed to start Next.js dev server:', error);
      });

      nextProcess.on('close', (code) => {
        console.log(`[Electron] Next.js dev server exited with code ${code}`);
      });

      // 保存进程引用，以便退出时关闭
      global.nextProcess = nextProcess;

      console.log(`[Electron] Next.js dev server process started (PID: ${nextProcess.pid})`);
    }
  } catch (error) {
    console.error("[Electron] Failed to start backend server:", error);
    throw error;
  }
}

/**
 * 检查端口并处理占用情况
 * @param {number} configPort 配置的端口
 * @returns {Promise<number|null>} 返回可用端口，或 null 表示用户取消
 */
async function checkAndResolvePort(configPort) {
  const isAvailable = await checkPortAvailable(configPort);

  if (isAvailable) {
    return configPort;
  }

  // 端口被占用，查找新的可用端口
  const newPort = await findAvailablePort(configPort + 1);

  if (!newPort) {
    // 找不到可用端口
    const result = await dialog.showMessageBox({
      type: "error",
      title: "端口不可用",
      message: `端口 ${configPort} 已被占用，且无法找到其他可用端口。`,
      detail: "请关闭占用端口的程序后重试。",
      buttons: ["退出"],
      defaultId: 0,
    });
    return null;
  }

  // 询问用户是否使用新端口
  const result = await dialog.showMessageBox({
    type: "warning",
    title: "端口被占用",
    message: `端口 ${configPort} 已被占用`,
    detail: `是否使用新端口 ${newPort} 启动？\n\n如果选择"否"，应用将退出。`,
    buttons: ["是，使用新端口", "否，退出"],
    defaultId: 0,
    cancelId: 1,
  });

  if (result.response === 0) {
    return newPort;
  }

  return null;
}

/**
 * 打开日志查看窗口
 */
function openLogWindow() {
  if (logWindow && !logWindow.isDestroyed()) {
    logWindow.focus();
    return;
  }

  logWindow = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 600,
    minHeight: 400,
    parent: mainWindow,
    modal: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: "OctoProxy Logs",
    icon: path.join(__dirname, "../assets/icon.png"),
  });

  // 加载日志页面
  const logPageUrl = `data:text/html;charset=utf-8,${encodeURIComponent(getLogViewerHTML())}`;
  logWindow.loadURL(logPageUrl);

  logWindow.on("closed", () => {
    logWindow = null;
  });
}

/**
 * 获取日志查看器 HTML
 */
function getLogViewerHTML() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>OctoProxy Logs</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1e1e1e;
      color: #d4d4d4;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .toolbar {
      background: #2d2d2d;
      padding: 10px 15px;
      display: flex;
      gap: 10px;
      align-items: center;
      border-bottom: 1px solid #404040;
    }
    .toolbar select, .toolbar button {
      padding: 6px 12px;
      border: 1px solid #404040;
      border-radius: 4px;
      background: #3c3c3c;
      color: #d4d4d4;
      cursor: pointer;
    }
    .toolbar select:hover, .toolbar button:hover {
      background: #4a4a4a;
    }
    .toolbar button.primary {
      background: #0e639c;
      border-color: #1177bb;
    }
    .toolbar button.primary:hover {
      background: #1177bb;
    }
    .log-content {
      flex: 1;
      overflow: auto;
      padding: 10px;
      font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
      font-size: 12px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .log-line { padding: 2px 0; }
    .log-line.error { color: #f48771; }
    .log-line.warn { color: #cca700; }
    .log-line.info { color: #3794ff; }
    .status-bar {
      background: #007acc;
      padding: 4px 10px;
      font-size: 12px;
      color: white;
    }
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #888;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <select id="fileSelect">
      <option value="">Select log file...</option>
    </select>
    <button onclick="refreshLogs()">Refresh</button>
    <button onclick="openLogDir()" class="primary">Open Log Folder</button>
    <span style="flex:1"></span>
    <span id="fileInfo" style="color:#888;font-size:12px;"></span>
  </div>
  <div class="log-content" id="logContent">
    <div class="loading">Select a log file to view</div>
  </div>
  <div class="status-bar" id="statusBar">Ready</div>

  <script>
    let currentFile = '';

    async function loadFileList() {
      try {
        const files = await window.electronAPI.getLogFiles();
        const select = document.getElementById('fileSelect');
        select.innerHTML = '<option value="">Select log file...</option>';
        files.forEach(f => {
          const opt = document.createElement('option');
          opt.value = f.name;
          opt.textContent = f.name + ' (' + formatSize(f.size) + ')';
          select.appendChild(opt);
        });
        if (files.length > 0 && !currentFile) {
          // Auto-select the latest error log or main log
          const errorLog = files.find(f => f.name.includes('error'));
          const mainLog = files.find(f => f.name.includes('main'));
          if (errorLog) {
            select.value = errorLog.name;
            loadLogFile(errorLog.name);
          } else if (mainLog) {
            select.value = mainLog.name;
            loadLogFile(mainLog.name);
          }
        }
      } catch (e) {
        console.error('Failed to load file list:', e);
      }
    }

    async function loadLogFile(filename) {
      if (!filename) return;
      currentFile = filename;
      document.getElementById('statusBar').textContent = 'Loading...';
      try {
        const result = await window.electronAPI.readLogFile({ filename, lines: 500 });
        if (result.error) {
          document.getElementById('logContent').innerHTML = '<div class="loading">Error: ' + result.error + '</div>';
        } else {
          const html = result.lines.map(line => {
            let cls = 'log-line';
            if (line.includes('[ERROR]') || line.includes('[UNCAUGHT]')) cls += ' error';
            else if (line.includes('[WARN]')) cls += ' warn';
            else if (line.includes('[INFO]')) cls += ' info';
            return '<div class="' + cls + '">' + escapeHtml(line) + '</div>';
          }).join('');
          document.getElementById('logContent').innerHTML = html;
          document.getElementById('fileInfo').textContent = 'Lines: ' + result.totalLines;
          // Scroll to bottom
          const content = document.getElementById('logContent');
          content.scrollTop = content.scrollHeight;
        }
        document.getElementById('statusBar').textContent = 'Loaded: ' + filename;
      } catch (e) {
        document.getElementById('logContent').innerHTML = '<div class="loading">Error: ' + e.message + '</div>';
        document.getElementById('statusBar').textContent = 'Error loading file';
      }
    }

    function refreshLogs() {
      loadFileList();
      if (currentFile) {
        loadLogFile(currentFile);
      }
    }

    async function openLogDir() {
      await window.electronAPI.openLogDir();
    }

    function formatSize(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    document.getElementById('fileSelect').addEventListener('change', (e) => {
      loadLogFile(e.target.value);
    });

    // Initial load
    loadFileList();

    // Auto-refresh every 5 seconds
    setInterval(() => {
      if (currentFile) {
        loadLogFile(currentFile);
      }
    }, 5000);
  </script>
</body>
</html>`;
}

/**
 * 创建 macOS 应用菜单
 */
function createAppMenu() {
  if (process.platform !== 'darwin') return;

  const appName = 'OctoProxy';
  const template = [
    {
      label: appName,
      submenu: [
        { label: `About ${appName}`, role: 'about' },
        { type: 'separator' },
        { label: 'Services', role: 'services', submenu: [] },
        { type: 'separator' },
        { label: `Hide ${appName}`, role: 'hide' },
        { label: 'Hide Others', role: 'hideOthers' },
        { label: 'Show All', role: 'unhide' },
        { type: 'separator' },
        { label: `Quit ${appName}`, role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', role: 'undo' },
        { label: 'Redo', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', role: 'cut' },
        { label: 'Copy', role: 'copy' },
        { label: 'Paste', role: 'paste' },
        { label: 'Select All', role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', role: 'reload' },
        { label: 'Force Reload', role: 'forceReload' },
        { label: 'Toggle Developer Tools', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Actual Size', role: 'resetZoom' },
        { label: 'Zoom In', role: 'zoomIn' },
        { label: 'Zoom Out', role: 'zoomOut' },
        { type: 'separator' },
        { label: 'Toggle Fullscreen', role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { label: 'Minimize', role: 'minimize' },
        { label: 'Zoom', role: 'zoom' },
        { type: 'separator' },
        { label: 'Close', role: 'close' },
        { type: 'separator' },
        { label: 'Bring All to Front', role: 'front' },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// 注册 IPC 处理器
function registerIpcHandlers() {
  // 检查更新
  ipcMain.handle("check-for-updates", async () => {
    return await checkForUpdates();
  });

  // 获取更新状态
  ipcMain.handle("get-update-status", () => {
    return getUpdateStatus();
  });

  // 下载更新
  ipcMain.handle("download-update", async () => {
    return await downloadUpdate();
  });

  // 安装更新
  ipcMain.handle("install-update", () => {
    installUpdate();
  });

  // 获取开机自启状态
  ipcMain.handle("get-auto-launch", async () => {
    return await getAutoLaunchEnabled();
  });

  // 设置开机自启
  ipcMain.handle("set-auto-launch", async (event, enabled) => {
    return await setAutoLaunchEnabled(enabled);
  });

  // 获取应用版本
  ipcMain.handle("get-app-version", () => {
    return app.getVersion();
  });

  // 检查是否在 Electron 环境
  ipcMain.handle("is-electron", () => {
    return true;
  });

  // 退出应用
  ipcMain.handle("quit-app", () => {
    isQuitting = true;
    app.quit();
  });

  // 打开 OAuth 无痕窗口
  ipcMain.handle("open-oauth-window", async (event, { sessionId, authUrl }) => {
    return openOAuthWindow(sessionId, authUrl);
  });

  // 关闭 OAuth 窗口
  ipcMain.handle("close-oauth-window", async (event, sessionId) => {
    return closeOAuthWindow(sessionId);
  });

  // 扫描 Kiro tokens
  ipcMain.handle("scan-kiro-tokens", async () => {
    try {
      const { scanAllTokens } = await import("./utils/token-scanner.js");
      const result = await scanAllTokens();
      return result;
    } catch (error) {
      console.error("[Electron] Failed to scan tokens:", error);
      return {
        success: false,
        tokens: [],
        errors: [{ path: "scan", error: error.message }]
      };
    }
  });

  // 日志相关 IPC
  ipcMain.handle("get-log-dir", () => {
    return getLogDir();
  });

  ipcMain.handle("get-log-files", () => {
    return getLogFiles();
  });

  ipcMain.handle("read-log-file", (event, { filename, lines }) => {
    return readLogFile(filename, lines || 200);
  });

  ipcMain.handle("open-log-window", () => {
    openLogWindow();
    return true;
  });

  ipcMain.handle("open-log-dir", () => {
    const dir = getLogDir();
    if (dir) {
      shell.openPath(dir);
    }
    return true;
  });
}

/**
 * 打开 OAuth 无痕窗口
 * @param {string} sessionId 会话 ID
 * @param {string} authUrl 授权 URL
 * @returns {Promise<boolean>}
 */
function openOAuthWindow(sessionId, authUrl) {
  return new Promise((resolve, reject) => {
    // 如果已存在该会话的窗口，先关闭
    if (oauthWindows.has(sessionId)) {
      const existingWindow = oauthWindows.get(sessionId);
      if (existingWindow && !existingWindow.isDestroyed()) {
        existingWindow.close();
      }
      oauthWindows.delete(sessionId);
    }

    // 创建无痕 session（不持久化任何数据）
    const partition = `oauth-${sessionId}`;
    const oauthSession = session.fromPartition(partition, { cache: true });

    // 清除该 session 的所有数据
    oauthSession.clearStorageData();

    // 创建无痕窗口
    const oauthWindow = new BrowserWindow({
      width: 800,
      height: 700,
      parent: mainWindow,
      modal: false,
      show: false,
      webPreferences: {
        session: oauthSession,
        nodeIntegration: false,
        contextIsolation: true,
        // 不加载 preload，保持纯净的浏览器环境
      },
      title: "Kiro OAuth Login",
      icon: path.join(__dirname, "../assets/icon.png"),
    });

    // 保存窗口引用
    oauthWindows.set(sessionId, oauthWindow);

    // 监听页面导航，检测回调 URL
    oauthWindow.webContents.on("will-navigate", (event, url) => {
      console.log(`[OAuth Window] will-navigate: ${url}`);
      checkOAuthCallback(sessionId, url, oauthWindow);
    });

    oauthWindow.webContents.on("will-redirect", (event, url) => {
      console.log(`[OAuth Window] will-redirect: ${url}`);
      checkOAuthCallback(sessionId, url, oauthWindow);
    });

    oauthWindow.webContents.on("did-navigate", (event, url) => {
      console.log(`[OAuth Window] did-navigate: ${url}`);
      checkOAuthCallback(sessionId, url, oauthWindow);
    });

    // 监听新窗口请求（某些 OAuth 提供商可能会打开新窗口）
    oauthWindow.webContents.setWindowOpenHandler(({ url }) => {
      checkOAuthCallback(sessionId, url, oauthWindow);
      return { action: "deny" };
    });

    // 窗口关闭时清理
    oauthWindow.on("closed", () => {
      oauthWindows.delete(sessionId);
      // 清除 session 数据
      oauthSession.clearStorageData();
    });

    // 加载授权 URL
    oauthWindow.loadURL(authUrl);

    // 窗口准备好后显示
    oauthWindow.once("ready-to-show", () => {
      oauthWindow.show();
      // 开发模式下打开 DevTools
      if (process.env.NODE_ENV === "development") {
        oauthWindow.webContents.openDevTools({ mode: "detach" });
      }
      resolve(true);
    });

    // 加载失败处理
    oauthWindow.webContents.on(
      "did-fail-load",
      (event, errorCode, errorDescription) => {
        console.error(
          `[OAuth Window] Load failed: ${errorCode} - ${errorDescription}`,
        );
        // 不关闭窗口，让用户看到错误
      },
    );
  });
}

/**
 * 检查是否是 OAuth 回调 URL
 * @param {string} sessionId
 * @param {string} url
 * @param {BrowserWindow} window
 */
function checkOAuthCallback(sessionId, url, window) {
  try {
    const urlObj = new URL(url);

    console.log(`[OAuth Window] Navigation: ${url}`);

    // 检查是否是本地回调 URL
    if (
      urlObj.hostname === "127.0.0.1" &&
      urlObj.pathname === "/oauth/callback"
    ) {
      console.log(`[OAuth Window] Callback detected for session: ${sessionId}`);

      // 延迟关闭，让回调服务器有时间处理
      setTimeout(() => {
        if (window && !window.isDestroyed()) {
          window.close();
        }
      }, 1500);
    }
  } catch (e) {
    // URL 解析失败，忽略
  }
}

/**
 * 关闭 OAuth 窗口
 * @param {string} sessionId
 * @returns {boolean}
 */
function closeOAuthWindow(sessionId) {
  const window = oauthWindows.get(sessionId);
  if (window && !window.isDestroyed()) {
    window.close();
    oauthWindows.delete(sessionId);
    return true;
  }
  return false;
}

// 应用准备就绪
app.whenReady().then(async () => {
  // 初始化日志系统（必须在其他操作之前）
  initLogger();
  cleanOldLogs(7); // 清理7天前的日志

  // 创建 macOS 应用菜单（设置正确的应用名称）
  createAppMenu();

  // 设置环境变量
  setupEnvironment();

  // 获取配置的端口（默认 12000）
  const configPort = parseInt(process.env.PORT) || 12000;

  // 检查端口是否可用
  const resolvedPort = await checkAndResolvePort(configPort);

  if (resolvedPort === null) {
    // 用户选择退出
    app.quit();
    return;
  }

  // 启动后端服务
  await startBackendServer(resolvedPort);

  // 等待后端启动（Next.js 需要更长的启动时间）
  const startupWaitTime = app.isPackaged ? 2000 : 5000; // 生产2秒，开发5秒
  console.log(`[Electron] Waiting ${startupWaitTime}ms for server to start...`);
  await new Promise((resolve) => setTimeout(resolve, startupWaitTime));

  // 创建窗口
  createWindow();

  // 创建系统托盘
  createTray(
    showWindow,
    () => {
      isQuitting = true;
      app.quit();
    },
    openLogWindow
  );

  // 初始化开机自启
  await initAutoLaunch();

  // 注册 IPC 处理器
  registerIpcHandlers();

  // macOS: 点击 dock 图标时重新创建窗口
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      showWindow();
    }
  });
});

// 所有窗口关闭时的处理
app.on("window-all-closed", () => {
  // macOS 上保持应用运行
  if (process.platform !== "darwin") {
    // Windows/Linux 上也保持运行（托盘模式）
    // 不调用 app.quit()
  }
});

// 应用退出前
app.on("before-quit", () => {
  isQuitting = true;
  destroyTray();

  // 关闭 Next.js dev 进程（开发模式）
  if (global.nextProcess && !global.nextProcess.killed) {
    console.log('[Electron] Shutting down Next.js dev server...');
    global.nextProcess.kill();
  }

  // 关闭日志流
  closeLogger();
});

// 防止多实例
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    // 当运行第二个实例时，聚焦到主窗口
    showWindow();
  });
}
