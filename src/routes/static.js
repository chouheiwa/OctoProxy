/**
 * 静态文件路由
 */

import fs from "fs";
import path from "path";
import { getStaticDir } from "../config.js";

// 获取静态文件目录（支持 Electron 环境）
function getStaticDirectory() {
  return getStaticDir();
}

// MIME 类型映射
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
};

/**
 * 获取 MIME 类型
 * @param {string} filePath 文件路径
 * @returns {string}
 */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

/**
 * 处理静态文件请求
 * @param {Object} req 请求对象
 * @param {Object} res 响应对象
 * @returns {boolean} 是否处理了请求
 */
export async function handleStaticRoutes(req, res) {
  if (req.method !== "GET") {
    return false;
  }

  const STATIC_DIR = getStaticDirectory();

  let urlPath = req.url.split("?")[0];

  // 默认页面
  if (urlPath === "/" || urlPath === "") {
    urlPath = "/index.html";
  }

  // 安全检查：防止目录遍历
  const normalizedPath = path.normalize(urlPath);
  if (normalizedPath.includes("..")) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return true;
  }

  const filePath = path.join(STATIC_DIR, normalizedPath);

  // 检查文件是否在静态目录内
  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return true;
  }

  try {
    // 检查文件是否存在
    const stats = await fs.promises.stat(filePath);

    if (stats.isDirectory()) {
      // 如果是目录，尝试返回 index.html
      const indexPath = path.join(filePath, "index.html");
      try {
        await fs.promises.access(indexPath);
        return serveFile(res, indexPath);
      } catch {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
        return true;
      }
    }

    return serveFile(res, filePath);
  } catch (error) {
    // 文件不存在，返回 false 让其他路由处理
    // 或者对于明确的静态资源路径返回 404
    if (
      urlPath.match(
        /\.(html|css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i,
      )
    ) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
      return true;
    }
    return false;
  }
}

/**
 * 发送文件
 * @param {Object} res 响应对象
 * @param {string} filePath 文件路径
 * @returns {boolean}
 */
async function serveFile(res, filePath) {
  try {
    const content = await fs.promises.readFile(filePath);
    const mimeType = getMimeType(filePath);

    res.writeHead(200, {
      "Content-Type": mimeType,
      "Content-Length": content.length,
      "Cache-Control": "public, max-age=3600",
    });
    res.end(content);
    return true;
  } catch (error) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
    return true;
  }
}

export default {
  handleStaticRoutes,
};
