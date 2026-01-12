/**
 * 自动更新模块
 */

import pkg from "electron-updater";
const { autoUpdater } = pkg;
import { BrowserWindow } from "electron";

let updateStatus = {
  checking: false,
  available: false,
  downloaded: false,
  error: null,
  progress: null,
  version: null,
};

/**
 * 初始化自动更新
 */
export function initUpdater() {
  // 禁用自动下载，由用户手动触发
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // 检查更新时
  autoUpdater.on("checking-for-update", () => {
    updateStatus = {
      ...updateStatus,
      checking: true,
      error: null,
    };
    sendStatusToWindow("update-checking");
  });

  // 有可用更新
  autoUpdater.on("update-available", (info) => {
    updateStatus = {
      ...updateStatus,
      checking: false,
      available: true,
      version: info.version,
    };
    sendStatusToWindow("update-available", info);
  });

  // 没有可用更新
  autoUpdater.on("update-not-available", (info) => {
    updateStatus = {
      ...updateStatus,
      checking: false,
      available: false,
    };
    sendStatusToWindow("update-not-available", info);
  });

  // 更新错误
  autoUpdater.on("error", (error) => {
    updateStatus = {
      ...updateStatus,
      checking: false,
      error: error.message,
    };
    sendStatusToWindow("update-error", error.message);
  });

  // 下载进度
  autoUpdater.on("download-progress", (progress) => {
    updateStatus = {
      ...updateStatus,
      progress: {
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond,
      },
    };
    sendStatusToWindow("update-progress", progress);
  });

  // 更新下载完成
  autoUpdater.on("update-downloaded", (info) => {
    updateStatus = {
      ...updateStatus,
      downloaded: true,
      progress: null,
    };
    sendStatusToWindow("update-downloaded", info);
  });
}

/**
 * 发送状态到渲染进程
 */
function sendStatusToWindow(channel, data) {
  const windows = BrowserWindow.getAllWindows();
  windows.forEach((win) => {
    if (win && win.webContents) {
      win.webContents.send(channel, data);
    }
  });
}

/**
 * 检查更新
 * @returns {Promise<Object>} 更新检查结果
 */
export async function checkForUpdates() {
  try {
    updateStatus = {
      checking: true,
      available: false,
      downloaded: false,
      error: null,
      progress: null,
      version: null,
    };

    const result = await autoUpdater.checkForUpdates();

    return {
      success: true,
      updateAvailable: updateStatus.available,
      version: result?.updateInfo?.version || null,
    };
  } catch (error) {
    updateStatus.error = error.message;
    updateStatus.checking = false;

    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 下载更新
 */
export async function downloadUpdate() {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * 安装更新并重启
 */
export function installUpdate() {
  autoUpdater.quitAndInstall(false, true);
}

/**
 * 获取更新状态
 */
export function getUpdateStatus() {
  return { ...updateStatus };
}
