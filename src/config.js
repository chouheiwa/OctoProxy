/**
 * 配置管理模块
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 默认配置
const defaultConfig = {
  port: 12000,
  host: "0.0.0.0",
  dbPath: "data/octo-proxy.db",
  adminPassword: "admin123",
  sessionExpireHours: 24,
  maxErrorCount: 3,
  healthCheckIntervalMinutes: 10,
  requestMaxRetries: 3,
  requestBaseDelay: 1000,
  cronRefreshTokenMinutes: 15,
  // 提供商选择策略
  // lru: 最近最少使用（均匀分配）
  // round_robin: 轮询（按ID顺序循环）
  // least_usage: 优先使用剩余额度最少的（集中消耗）
  // most_usage: 优先使用剩余额度最多的（均衡消耗）
  // oldest_first: 优先使用最早创建的（集中消耗）
  providerStrategy: "lru",
  // 用量同步间隔（分钟）
  usageSyncIntervalMinutes: 10,
  // 调试模式
  debug: false,
};

let config = null;
let configPath = null;
let projectRoot = null;

/**
 * 检测是否在 Electron 环境中运行
 * @returns {boolean}
 */
export function isElectron() {
  return process.env.ELECTRON_APP === "true";
}

/**
 * 获取项目根目录
 * @returns {string}
 */
export function getProjectRoot() {
  if (projectRoot) return projectRoot;

  if (isElectron()) {
    // Electron 环境：使用环境变量中的路径
    // 配置和数据目录由 Electron 主进程设置
    projectRoot = path.resolve(__dirname, "..");
  } else {
    // 普通 Node.js 环境
    projectRoot = path.resolve(__dirname, "..");
  }

  return projectRoot;
}

/**
 * 获取配置目录
 * @returns {string}
 */
export function getConfigDir() {
  if (isElectron() && process.env.ELECTRON_CONFIG_DIR) {
    return process.env.ELECTRON_CONFIG_DIR;
  }
  return path.join(getProjectRoot(), "configs");
}

/**
 * 获取数据目录
 * @returns {string}
 */
export function getDataDir() {
  if (isElectron() && process.env.ELECTRON_DATA_DIR) {
    return process.env.ELECTRON_DATA_DIR;
  }
  return path.join(getProjectRoot(), "data");
}

/**
 * 获取静态文件目录
 * @returns {string}
 */
export function getStaticDir() {
  if (isElectron() && process.env.ELECTRON_STATIC_DIR) {
    return process.env.ELECTRON_STATIC_DIR;
  }
  return path.join(getProjectRoot(), "static");
}

/**
 * 获取数据库迁移目录
 * @returns {string}
 */
export function getMigrationsDir() {
  if (isElectron() && process.env.ELECTRON_MIGRATIONS_DIR) {
    return process.env.ELECTRON_MIGRATIONS_DIR;
  }
  return path.join(__dirname, "db", "migrations");
}

/**
 * 获取配置文件路径
 * @returns {string}
 */
function getConfigPath() {
  if (configPath) return configPath;

  configPath = path.join(getConfigDir(), "config.json");
  return configPath;
}

/**
 * 确保目录存在
 * @param {string} dir
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 加载配置
 * @returns {Object}
 */
export function loadConfig() {
  const filePath = getConfigPath();

  try {
    // 确保配置目录存在
    ensureDir(path.dirname(filePath));

    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      const fileConfig = JSON.parse(content);
      config = { ...defaultConfig, ...fileConfig };
    } else {
      // 配置文件不存在，创建默认配置
      fs.writeFileSync(filePath, JSON.stringify(defaultConfig, null, 2));
      config = { ...defaultConfig };
    }
  } catch (error) {
    console.error("[Config] Failed to load config:", error.message);
    config = { ...defaultConfig };
  }

  return config;
}

/**
 * 获取配置
 * @returns {Object}
 */
export function getConfig() {
  if (!config) {
    loadConfig();
  }
  return config;
}

/**
 * 更新配置
 * @param {Object} updates
 * @returns {Object}
 */
export function updateConfig(updates) {
  const current = getConfig();
  const newConfig = { ...current, ...updates };

  const filePath = getConfigPath();
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(newConfig, null, 2));

  config = newConfig;
  return config;
}

/**
 * 获取数据库完整路径
 * @returns {string}
 */
export function getDbPath() {
  const cfg = getConfig();
  const dataDir = getDataDir();

  // 确保数据目录存在
  ensureDir(dataDir);

  // 如果配置中是相对路径，使用数据目录
  if (!path.isAbsolute(cfg.dbPath)) {
    // 提取文件名
    const dbFileName = path.basename(cfg.dbPath);
    return path.join(dataDir, dbFileName);
  }

  return cfg.dbPath;
}

export default {
  loadConfig,
  getConfig,
  updateConfig,
  getDbPath,
  isElectron,
  getProjectRoot,
  getConfigDir,
  getDataDir,
  getStaticDir,
  getMigrationsDir,
};
