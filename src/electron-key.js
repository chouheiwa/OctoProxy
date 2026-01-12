/**
 * Electron 自动 API Key 管理模块
 */

import fs from "fs";
import path from "path";
import { isElectron, getConfigDir, getConfig } from "./config.js";
import {
  getApiKeyByName,
  createApiKey,
  deleteApiKeyByName,
} from "./db/api-keys.js";

// Electron 自动 Key 的名称
const ELECTRON_AUTO_KEY_NAME = "Electron Auto Key";

// 配置文件名
const ELECTRON_KEY_FILE = "electron-key.json";

// 内存缓存
let cachedElectronKey = null;

/**
 * 获取 Electron Key 配置文件路径
 * @returns {string}
 */
function getElectronKeyFilePath() {
  return path.join(getConfigDir(), ELECTRON_KEY_FILE);
}

/**
 * 读取 Electron Key 配置文件
 * @returns {Object|null}
 */
function readElectronKeyFile() {
  try {
    const filePath = getElectronKeyFilePath();
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content);
    }
  } catch (error) {
    console.error("[ElectronKey] Failed to read key file:", error.message);
  }
  return null;
}

/**
 * 写入 Electron Key 配置文件
 * @param {Object} data
 */
function writeElectronKeyFile(data) {
  try {
    const filePath = getElectronKeyFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("[ElectronKey] Failed to write key file:", error.message);
  }
}

/**
 * 删除 Electron Key 配置文件
 */
function deleteElectronKeyFile() {
  try {
    const filePath = getElectronKeyFilePath();
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error("[ElectronKey] Failed to delete key file:", error.message);
  }
}

/**
 * 初始化 Electron 自动 API Key
 * 仅在 Electron 环境下调用
 */
export async function initElectronAutoKey() {
  if (!isElectron()) {
    return;
  }

  console.log("[ElectronKey] Initializing Electron Auto Key...");

  // 1. 检查配置文件是否存在
  const keyFile = readElectronKeyFile();

  // 2. 检查数据库中是否存在该 Key
  const existingKey = getApiKeyByName(ELECTRON_AUTO_KEY_NAME);

  if (keyFile && existingKey) {
    // 配置文件和数据库都存在，使用缓存
    cachedElectronKey = {
      key: keyFile.key,
      keyId: existingKey.id,
      isActive: existingKey.is_active === 1,
    };
    console.log("[ElectronKey] Loaded existing key from file");
    return;
  }

  if (existingKey && !keyFile) {
    // 数据库存在但配置文件不存在（可能被删除）
    // 需要重新创建，因为完整 Key 无法恢复
    console.log("[ElectronKey] Key file missing, recreating...");
    deleteApiKeyByName(ELECTRON_AUTO_KEY_NAME);
  }

  if (!existingKey || !keyFile) {
    // 创建新的 Key
    console.log("[ElectronKey] Creating new Electron Auto Key...");
    const newKey = createApiKey({
      name: ELECTRON_AUTO_KEY_NAME,
      dailyLimit: -1, // 无限制
      userId: 1, // 默认管理员用户
    });

    // 保存到配置文件
    writeElectronKeyFile({
      key: newKey.key,
      keyId: newKey.id,
      createdAt: new Date().toISOString(),
    });

    cachedElectronKey = {
      key: newKey.key,
      keyId: newKey.id,
      isActive: true,
    };

    console.log("[ElectronKey] Created new key successfully");
  }
}

/**
 * 获取 Electron Key 配置信息
 * @returns {Object|null}
 */
export function getElectronKeyConfig() {
  if (!isElectron()) {
    return null;
  }

  // 检查数据库中的 Key 状态
  const dbKey = getApiKeyByName(ELECTRON_AUTO_KEY_NAME);

  if (!dbKey) {
    return null;
  }

  // 读取完整 Key
  const keyFile = readElectronKeyFile();

  // 如果 Key 被禁用，返回禁用状态
  if (!dbKey.is_active) {
    return {
      keyId: dbKey.id,
      keyPrefix: dbKey.key_prefix,
      key: null, // 禁用时不返回完整 Key
      isActive: false,
      name: dbKey.name,
    };
  }

  // 如果配置文件不存在，无法获取完整 Key
  if (!keyFile || !keyFile.key) {
    return {
      keyId: dbKey.id,
      keyPrefix: dbKey.key_prefix,
      key: null,
      isActive: true,
      name: dbKey.name,
      error: "key_file_missing",
    };
  }

  return {
    keyId: dbKey.id,
    keyPrefix: dbKey.key_prefix,
    key: keyFile.key,
    isActive: true,
    name: dbKey.name,
  };
}

/**
 * 重新生成 Electron Key
 * @returns {Object}
 */
export async function regenerateElectronKey() {
  if (!isElectron()) {
    throw new Error("Not in Electron environment");
  }

  // 删除现有的 Key
  const existingKey = getApiKeyByName(ELECTRON_AUTO_KEY_NAME);
  if (existingKey) {
    deleteApiKeyByName(ELECTRON_AUTO_KEY_NAME);
  }

  // 创建新的 Key
  const newKey = createApiKey({
    name: ELECTRON_AUTO_KEY_NAME,
    dailyLimit: -1,
    userId: 1,
  });

  // 更新配置文件
  writeElectronKeyFile({
    key: newKey.key,
    keyId: newKey.id,
    createdAt: new Date().toISOString(),
  });

  // 更新缓存
  cachedElectronKey = {
    key: newKey.key,
    keyId: newKey.id,
    isActive: true,
  };

  return {
    keyId: newKey.id,
    keyPrefix: newKey.keyPrefix,
    key: newKey.key,
    isActive: true,
    name: ELECTRON_AUTO_KEY_NAME,
  };
}

/**
 * 检查 Electron Key 是否可用
 * @returns {boolean}
 */
export function isElectronKeyAvailable() {
  if (!isElectron()) {
    return false;
  }

  const dbKey = getApiKeyByName(ELECTRON_AUTO_KEY_NAME);
  return dbKey && dbKey.is_active === 1;
}

export default {
  initElectronAutoKey,
  getElectronKeyConfig,
  regenerateElectronKey,
  isElectronKeyAvailable,
};
