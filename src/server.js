/**
 * HTTP 服务器
 */

import http from "http";
import { handleApiRoutes } from "./routes/api.js";
import { handleAdminRoutes } from "./routes/admin.js";
import { handleStaticRoutes } from "./routes/static.js";
import { getConfig } from "./config.js";

/**
 * 创建 HTTP 服务器
 * @returns {http.Server}
 */
export function createServer() {
  const server = http.createServer(async (req, res) => {
    const startTime = Date.now();
    const { method, url } = req;

    console.log(`[Server] ${method} ${url}`);

    try {
      // 1. 尝试 API 路由 (/v1/*)
      if (url.startsWith("/v1/") || url === "/health") {
        const handled = await handleApiRoutes(req, res);
        if (handled) {
          logRequest(method, url, res.statusCode, startTime);
          return;
        }
      }

      // 2. 尝试管理 API 路由 (/api/*)
      if (url.startsWith("/api/")) {
        const handled = await handleAdminRoutes(req, res);
        if (handled) {
          logRequest(method, url, res.statusCode, startTime);
          return;
        }
      }

      // 3. 尝试静态文件路由
      const handled = await handleStaticRoutes(req, res);
      if (handled) {
        logRequest(method, url, res.statusCode, startTime);
        return;
      }

      // 4. 404 Not Found
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not Found" }));
      logRequest(method, url, 404, startTime);
    } catch (error) {
      console.error(`[Server] Error handling ${method} ${url}:`, error);

      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal Server Error" }));
      }
      logRequest(method, url, 500, startTime);
    }
  });

  return server;
}

/**
 * 记录请求日志
 * @param {string} method HTTP 方法
 * @param {string} url 请求 URL
 * @param {number} status 状态码
 * @param {number} startTime 开始时间
 */
function logRequest(method, url, status, startTime) {
  const duration = Date.now() - startTime;
  const statusColor =
    status >= 500 ? "\x1b[31m" : status >= 400 ? "\x1b[33m" : "\x1b[32m";
  console.log(
    `[Server] ${method} ${url} ${statusColor}${status}\x1b[0m ${duration}ms`,
  );
}

/**
 * 启动服务器
 * @returns {Promise<http.Server>}
 */
export async function startServer() {
  const config = getConfig();
  // 优先使用环境变量中的端口（Electron 动态设置），否则使用配置文件中的端口
  const port = process.env.PORT ? parseInt(process.env.PORT) : config.port;
  const host = config.host;

  const server = createServer();

  return new Promise((resolve, reject) => {
    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.error(`[Server] Port ${port} is already in use`);
      } else {
        console.error("[Server] Server error:", error);
      }
      reject(error);
    });

    server.listen(port, host, () => {
      console.log(`[Server] OctoProxy running at http://${host}:${port}`);
      console.log(`[Server] API endpoints:`);
      console.log(
        `  - OpenAI: POST http://${host}:${port}/v1/chat/completions`,
      );
      console.log(`  - Claude: POST http://${host}:${port}/v1/messages`);
      console.log(`  - Models: GET  http://${host}:${port}/v1/models`);
      console.log(`  - Health: GET  http://${host}:${port}/health`);
      console.log(`[Server] Admin UI: http://${host}:${port}/`);
      resolve(server);
    });
  });
}

export default {
  createServer,
  startServer,
};
