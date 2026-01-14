/**
 * Token 扫描工具
 * 扫描指定目录，查找并验证 token JSON 文件
 */

import fs from 'fs/promises';
import path from 'path';
import { getAllTokenPaths } from './token-paths.js';

/**
 * 检查 token 是否已过期
 * @param {Object} data Token 数据
 * @returns {boolean}
 */
function isTokenExpired(data) {
  if (!data.expiresAt && !data.expiration) {
    return false; // 无过期时间，假定未过期
  }

  const expiryTime = new Date(data.expiresAt || data.expiration);
  return expiryTime < new Date();
}

/**
 * 检查 token 是否可用（即使过期，但有 refresh token 也算可用）
 * @param {Object} data Token 数据
 * @returns {boolean}
 */
function isTokenUsable(data) {
  const expired = isTokenExpired(data);

  // 如果未过期，直接可用
  if (!expired) {
    return true;
  }

  // 如果过期了，检查是否有 refresh token
  // 有 refresh token 的话，系统可以自动刷新，仍然可用
  return !!(data.refreshToken);
}

/**
 * 验证 JSON 数据是否为 token 文件
 * @param {Object} data 解析后的 JSON 数据
 * @returns {boolean}
 */
export function validateTokenData(data) {
  // 必须包含 accessToken 或 refreshToken
  if (!data.accessToken && !data.refreshToken) {
    return false;
  }

  return true;
}

/**
 * 扫描单个目录，查找 token 文件
 * @param {string} dirPath 目录路径
 * @param {number} maxDepth 最大递归深度
 * @returns {Promise<Array>} Token 文件列表
 */
export async function scanDirectory(dirPath, maxDepth = 3) {
  const tokens = [];

  try {
    // 检查目录是否存在
    await fs.access(dirPath);

    // 读取目录内容
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isFile() && entry.name.endsWith('.json')) {
        try {
          // 读取并解析 JSON (限制文件大小 < 1MB)
          const stats = await fs.stat(fullPath);
          if (stats.size > 1024 * 1024) {
            console.warn(`[TokenScanner] File too large, skipping: ${fullPath}`);
            continue;
          }

          const content = await fs.readFile(fullPath, 'utf-8');
          const data = JSON.parse(content);

          // 验证是否为 token 文件
          if (validateTokenData(data)) {
            tokens.push({
              filePath: fullPath,
              fileName: entry.name,
              data: data,
              isExpired: isTokenExpired(data),
              isUsable: isTokenUsable(data),
              isValid: true
            });
          }
        } catch (err) {
          console.warn(`[TokenScanner] Failed to parse ${fullPath}:`, err.message);
        }
      } else if (entry.isDirectory() && maxDepth > 0) {
        // 递归扫描子目录
        const subTokens = await scanDirectory(fullPath, maxDepth - 1);
        tokens.push(...subTokens);
      }
    }
  } catch (err) {
    // 目录不存在或无权限访问
    console.warn(`[TokenScanner] Cannot access ${dirPath}:`, err.message);
  }

  return tokens;
}

/**
 * 扫描所有可能的 token 路径
 * @returns {Promise<Object>} 扫描结果
 */
export async function scanAllTokens() {
  const allPaths = getAllTokenPaths();
  const results = {
    success: true,
    tokens: [],
    errors: []
  };

  for (const { source, paths } of allPaths) {
    for (const dirPath of paths) {
      try {
        const tokens = await scanDirectory(dirPath);
        tokens.forEach(token => {
          token.source = source;
          results.tokens.push(token);
        });
      } catch (err) {
        results.errors.push({
          path: dirPath,
          error: err.message
        });
      }
    }
  }

  return results;
}
