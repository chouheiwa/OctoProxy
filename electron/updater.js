/**
 * 自动更新模块
 */

import pkg from "electron-updater";
const { autoUpdater } = pkg;
import { BrowserWindow } from "electron";
import { execSync } from "child_process";
import path from "path";
import { app } from "electron";

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

    // macOS: 清理下载文件的隔离属性，避免下次启动时 Gatekeeper 警告
    if (process.platform === 'darwin') {
      clearDownloadedFileQuarantine();
    }

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
    const currentVersion = app.getVersion();
    const latestVersion = result?.updateInfo?.version;

    // 直接比较版本号判断是否有更新
    // 注意：事件 (update-available/update-not-available) 在 Promise resolve 之后才触发
    // 所以不能依赖 updateStatus.available，需要直接比较版本号
    const updateAvailable = latestVersion !== currentVersion;

    console.log(`[Updater] Current: ${currentVersion}, Latest: ${latestVersion}, Update available: ${updateAvailable}`);

    // 同步更新状态
    updateStatus.checking = false;
    updateStatus.available = updateAvailable;
    updateStatus.version = latestVersion;

    return {
      success: true,
      updateAvailable,
      version: latestVersion || null,
      currentVersion,
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

/**
 * 清理下载文件的 macOS 隔离属性
 * 在更新下载完成后执行，确保安装后的应用不会被 Gatekeeper 拦截
 */
function clearDownloadedFileQuarantine() {
  try {
    // electron-updater 的缓存目录
    const appName = app.getName();
    const cacheDir = path.join(
      app.getPath('home'),
      'Library/Caches',
      `${appName.toLowerCase()}-updater`
    );

    console.log('[Updater] Clearing quarantine attributes from:', cacheDir);

    // 清理整个缓存目录的隔离属性
    execSync(`xattr -cr "${cacheDir}"`, {
      stdio: 'ignore',
      timeout: 10000,
    });

    console.log('[Updater] Quarantine attributes cleared successfully');
  } catch (error) {
    // 静默处理错误，不影响更新流程
    console.warn('[Updater] Failed to clear quarantine attributes:', error.message);
  }
}
