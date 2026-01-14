/**
 * Electron 预加载脚本
 * 在渲染进程中暴露安全的 API
 */

const { contextBridge, ipcRenderer } = require("electron");

// 暴露给渲染进程的 API
contextBridge.exposeInMainWorld("electronAPI", {
  // 检查是否在 Electron 环境
  isElectron: () => true,

  // 获取应用版本
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),

  // 检查更新
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),

  // 获取更新状态
  getUpdateStatus: () => ipcRenderer.invoke("get-update-status"),

  // 获取开机自启状态
  getAutoLaunch: () => ipcRenderer.invoke("get-auto-launch"),

  // 设置开机自启
  setAutoLaunch: (enabled) => ipcRenderer.invoke("set-auto-launch", enabled),

  // 退出应用
  quitApp: () => ipcRenderer.invoke("quit-app"),

  // OAuth 无痕窗口相关
  openOAuthWindow: (sessionId, authUrl) =>
    ipcRenderer.invoke("open-oauth-window", { sessionId, authUrl }),
  closeOAuthWindow: (sessionId) =>
    ipcRenderer.invoke("close-oauth-window", sessionId),

  // Token 扫描相关
  scanKiroTokens: () => ipcRenderer.invoke("scan-kiro-tokens"),

  // 监听更新事件
  onUpdateAvailable: (callback) => {
    ipcRenderer.on("update-available", (event, info) => callback(info));
  },

  onUpdateDownloaded: (callback) => {
    ipcRenderer.on("update-downloaded", (event, info) => callback(info));
  },

  onUpdateError: (callback) => {
    ipcRenderer.on("update-error", (event, error) => callback(error));
  },

  onUpdateProgress: (callback) => {
    ipcRenderer.on("update-progress", (event, progress) => callback(progress));
  },

  // 移除监听器
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
});
