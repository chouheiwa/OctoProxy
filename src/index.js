/**
 * OctoProxy 入口文件
 */

import { loadConfig, getDbPath, isElectron } from "./config.js";
import { initDatabase, closeDatabase } from "./db/index.js";
import { startServer } from "./server.js";
import { cleanExpiredSessions } from "./db/sessions.js";
import {
  checkAllProvidersHealth,
  tryRecoverUnhealthyProviders,
  syncProvidersUsage,
} from "./pool/manager.js";
import { initElectronAutoKey } from "./electron-key.js";

// 加载配置
console.log("[Main] Loading configuration...");
const config = loadConfig();

// 初始化数据库
console.log("[Main] Initializing database...");
initDatabase(getDbPath());

// 定时任务
let healthCheckInterval = null;
let sessionCleanupInterval = null;
let recoveryInterval = null;
let usageSyncInterval = null;

/**
 * 启动定时任务
 */
function startScheduledTasks() {
  const healthCheckMinutes = config.healthCheckIntervalMinutes || 10;
  const usageSyncMinutes = config.usageSyncIntervalMinutes || 10;

  // 健康检查定时任务
  healthCheckInterval = setInterval(
    async () => {
      console.log("[Scheduler] Running health check...");
      try {
        const result = await checkAllProvidersHealth();
        console.log(
          `[Scheduler] Health check completed: ${result.healthy} healthy, ${result.unhealthy} unhealthy`,
        );
      } catch (error) {
        console.error("[Scheduler] Health check failed:", error.message);
      }
    },
    healthCheckMinutes * 60 * 1000,
  );

  // 会话清理定时任务（每小时）
  sessionCleanupInterval = setInterval(
    () => {
      console.log("[Scheduler] Cleaning expired sessions...");
      cleanExpiredSessions();
    },
    60 * 60 * 1000,
  );

  // 不健康提供商恢复尝试（每 30 分钟）
  recoveryInterval = setInterval(
    async () => {
      console.log("[Scheduler] Trying to recover unhealthy providers...");
      try {
        const recovered = await tryRecoverUnhealthyProviders();
        if (recovered > 0) {
          console.log(`[Scheduler] Recovered ${recovered} providers`);
        }
      } catch (error) {
        console.error("[Scheduler] Recovery failed:", error.message);
      }
    },
    30 * 60 * 1000,
  );

  // 用量同步定时任务
  usageSyncInterval = setInterval(
    async () => {
      console.log("[Scheduler] Syncing provider usage...");
      try {
        const result = await syncProvidersUsage();
        console.log(
          `[Scheduler] Usage sync completed: ${result.synced} synced, ${result.failed} failed, ${result.exhausted} exhausted`,
        );
      } catch (error) {
        console.error("[Scheduler] Usage sync failed:", error.message);
      }
    },
    usageSyncMinutes * 60 * 1000,
  );

  console.log("[Scheduler] Scheduled tasks started");
}

/**
 * 停止定时任务
 */
function stopScheduledTasks() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
  if (sessionCleanupInterval) {
    clearInterval(sessionCleanupInterval);
    sessionCleanupInterval = null;
  }
  if (recoveryInterval) {
    clearInterval(recoveryInterval);
    recoveryInterval = null;
  }
  if (usageSyncInterval) {
    clearInterval(usageSyncInterval);
    usageSyncInterval = null;
  }
  console.log("[Scheduler] Scheduled tasks stopped");
}

/**
 * 优雅关闭
 */
async function gracefulShutdown(signal) {
  console.log(`\n[Main] Received ${signal}, shutting down gracefully...`);

  stopScheduledTasks();
  closeDatabase();

  console.log("[Main] Goodbye!");
  process.exit(0);
}

// 注册信号处理
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// 未捕获异常处理
process.on("uncaughtException", (error) => {
  console.error("[Main] Uncaught exception:", error);
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[Main] Unhandled rejection at:", promise, "reason:", reason);
});

// 启动服务器
async function main() {
  try {
    await startServer();
    startScheduledTasks();

    // 启动时清理过期会话
    cleanExpiredSessions();

    // Electron 环境下初始化自动 API Key
    if (isElectron()) {
      await initElectronAutoKey();
    }

    console.log("[Main] OctoProxy started successfully");
  } catch (error) {
    console.error("[Main] Failed to start server:", error);
    process.exit(1);
  }
}

main();
