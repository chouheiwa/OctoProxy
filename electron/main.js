/**
 * Electron 主进程
 */

import { app, BrowserWindow, ipcMain, session, dialog } from "electron";
import path from "path";
import net from "net";
import { fileURLToPath } from "url";
import { createTray, destroyTray } from "./tray.js";
import {
  initAutoLaunch,
  getAutoLaunchEnabled,
  setAutoLaunchEnabled,
} from "./autoLaunch.js";
import { checkForUpdates, getUpdateStatus } from "./updater.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 保持窗口引用，防止被垃圾回收
let mainWindow = null;
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

  if (isPackaged) {
    // 打包后: 使用 userData 目录存储数据
    const userData = app.getPath("userData");
    const resources = process.resourcesPath;

    return {
      configDir: path.join(userData, "configs"),
      dataDir: path.join(userData, "data"),
      staticDir: path.join(resources, "static"),
      migrationsDir: path.join(resources, "migrations"),
      isElectron: true,
      isPackaged: true,
    };
  } else {
    // 开发模式: 使用项目目录
    const projectRoot = path.resolve(__dirname, "..");
    return {
      configDir: path.join(projectRoot, "configs"),
      dataDir: path.join(projectRoot, "data"),
      staticDir: path.join(projectRoot, "static"),
      migrationsDir: path.join(projectRoot, "src", "db", "migrations"),
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
    currentPort = port;

    // 动态导入后端入口
    const backend = await import("../src/index.js");
    console.log(`[Electron] Backend server started on port ${port}`);
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

  // 等待后端启动
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // 创建窗口
  createWindow();

  // 创建系统托盘
  createTray(showWindow, () => {
    isQuitting = true;
    app.quit();
  });

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
