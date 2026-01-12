/**
 * 系统托盘管理
 */

import { Tray, Menu, nativeImage } from "electron";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let tray = null;

/**
 * 创建系统托盘
 * @param {Function} showWindow - 显示窗口的回调
 * @param {Function} quitApp - 退出应用的回调
 */
export function createTray(showWindow, quitApp) {
  // 托盘图标路径
  const iconPath = path.join(__dirname, "../assets/tray-icon.png");

  // 创建托盘图标
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath);
    // macOS 需要设置为 template 图标
    if (process.platform === "darwin") {
      icon = icon.resize({ width: 16, height: 16 });
      icon.setTemplateImage(true);
    }
  } catch (error) {
    console.error("[Tray] Failed to load icon:", error);
    // 使用空图标作为后备
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);

  // 托盘菜单
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "显示主窗口",
      click: showWindow,
    },
    {
      type: "separator",
    },
    {
      label: "退出",
      click: quitApp,
    },
  ]);

  tray.setToolTip("OctoProxy");
  tray.setContextMenu(contextMenu);

  // 双击托盘图标显示窗口
  tray.on("double-click", showWindow);

  // macOS: 单击也显示窗口
  if (process.platform === "darwin") {
    tray.on("click", showWindow);
  }

  return tray;
}

/**
 * 销毁托盘
 */
export function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

/**
 * 获取托盘实例
 */
export function getTray() {
  return tray;
}
