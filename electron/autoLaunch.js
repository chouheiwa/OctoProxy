/**
 * 开机自启管理
 */

import AutoLaunch from "auto-launch";
import { app } from "electron";

let autoLauncher = null;

/**
 * 初始化开机自启
 */
export async function initAutoLaunch() {
  const appName = app.getName() || "OctoProxy";
  const appPath = app.getPath("exe");

  autoLauncher = new AutoLaunch({
    name: appName,
    path: appPath,
    isHidden: true, // 启动时隐藏窗口（托盘模式）
  });

  return autoLauncher;
}

/**
 * 获取开机自启状态
 * @returns {Promise<boolean>}
 */
export async function getAutoLaunchEnabled() {
  if (!autoLauncher) {
    await initAutoLaunch();
  }

  try {
    const isEnabled = await autoLauncher.isEnabled();
    return isEnabled;
  } catch (error) {
    console.error("[AutoLaunch] Failed to get status:", error);
    return false;
  }
}

/**
 * 设置开机自启
 * @param {boolean} enabled - 是否启用
 * @returns {Promise<Object>}
 */
export async function setAutoLaunchEnabled(enabled) {
  if (!autoLauncher) {
    await initAutoLaunch();
  }

  try {
    if (enabled) {
      await autoLauncher.enable();
    } else {
      await autoLauncher.disable();
    }

    // 验证设置是否成功
    const isEnabled = await autoLauncher.isEnabled();

    return {
      success: true,
      enabled: isEnabled,
    };
  } catch (error) {
    console.error("[AutoLaunch] Failed to set status:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}
