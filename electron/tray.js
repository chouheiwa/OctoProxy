/**
 * 系统托盘管理
 */

import { Tray, Menu, nativeImage } from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let tray = null;

/**
 * 创建系统托盘
 * @param {Function} showWindow - 显示窗口的回调
 * @param {Function} quitApp - 退出应用的回调
 * @param {Function} openLogWindow - 打开日志窗口的回调（可选）
 */
export function createTray(showWindow, quitApp, openLogWindow) {
  // 创建托盘图标
  let icon;
  try {
    if (process.platform === "darwin") {
      // macOS: 优先使用 Template 图标（单色），否则使用普通图标
      const templateIconPath = path.join(__dirname, "../assets/tray-iconTemplate.png");
      const normalIconPath = path.join(__dirname, "../assets/tray-icon.png");

      // 检查是否存在 Template 图标
      if (fs.existsSync(templateIconPath)) {
        icon = nativeImage.createFromPath(templateIconPath);
        icon = icon.resize({ width: 18, height: 18 });
        icon.setTemplateImage(true);
      } else {
        // 使用普通图标，不设置为 template（保持彩色）
        icon = nativeImage.createFromPath(normalIconPath);
        icon = icon.resize({ width: 18, height: 18 });
        // 不调用 setTemplateImage，保持原始颜色
      }
    } else {
      // Windows/Linux: 使用普通图标
      const iconPath = path.join(__dirname, "../assets/tray-icon.png");
      icon = nativeImage.createFromPath(iconPath);
    }
  } catch (error) {
    console.error("[Tray] Failed to load icon:", error);
    // 使用空图标作为后备
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);

  // 托盘菜单
  const menuItems = [
    {
      label: "显示主窗口",
      click: showWindow,
    },
    {
      type: "separator",
    },
  ];

  // 如果提供了打开日志窗口的回调，添加菜单项
  if (openLogWindow) {
    menuItems.push({
      label: "查看日志",
      click: openLogWindow,
    });
    menuItems.push({
      type: "separator",
    });
  }

  menuItems.push({
    label: "退出",
    click: quitApp,
  });

  const contextMenu = Menu.buildFromTemplate(menuItems);

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
