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
 * @param {boolean} hasClientCredentials 是否有 client credentials
 * @returns {boolean}
 */
function isTokenUsable(data, hasClientCredentials = true) {
  const expired = isTokenExpired(data);

  // 如果未过期，直接可用
  if (!expired) {
    return true;
  }

  // 如果过期了，检查是否有 refresh token
  if (!data.refreshToken) {
    return false;
  }

  // 对于 IdC/builder-id 认证，还需要 client credentials 才能刷新
  const authMethod = data.authMethod || '';
  if (authMethod === 'IdC' || authMethod === 'builder-id') {
    return hasClientCredentials;
  }

  // social auth 不需要 client credentials
  return true;
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
 * 尝试读取 clientIdHash 对应的 client credentials 文件
 * @param {string} dirPath 目录路径
 * @param {string} clientIdHash clientIdHash 值
 * @returns {Promise<Object|null>} client credentials 或 null
 */
async function readClientCredentials(dirPath, clientIdHash) {
  if (!clientIdHash) {
    return null;
  }

  const credentialsPath = path.join(dirPath, `${clientIdHash}.json`);

  try {
    const content = await fs.readFile(credentialsPath, 'utf-8');
    const data = JSON.parse(content);

    // 验证必要字段
    if (data.clientId && data.clientSecret) {
      return {
        clientId: data.clientId,
        clientSecret: data.clientSecret,
        clientCredentialsExpiresAt: data.expiresAt || null,
        clientCredentialsSource: credentialsPath
      };
    }

    console.warn(`[TokenScanner] Client credentials file missing required fields: ${credentialsPath}`);
    return null;
  } catch (err) {
    // 文件不存在或解析失败
    console.warn(`[TokenScanner] Cannot read client credentials from ${credentialsPath}:`, err.message);
    return null;
  }
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
            // 检查是否需要关联 client credentials
            let clientCredentials = null;
            let hasClientCredentials = true;
            const authMethod = data.authMethod || '';

            // 对于 IdC/builder-id 认证，尝试读取 clientIdHash 对应的文件
            if (data.clientIdHash && (authMethod === 'IdC' || authMethod === 'builder-id' || !authMethod)) {
              clientCredentials = await readClientCredentials(dirPath, data.clientIdHash);
              hasClientCredentials = clientCredentials !== null;

              if (!hasClientCredentials) {
                console.warn(`[TokenScanner] Missing client credentials for ${entry.name}, clientIdHash: ${data.clientIdHash}`);
              }
            }

            // 对于 social auth，不需要 client credentials
            if (authMethod === 'social') {
              hasClientCredentials = true;
            }

            const tokenData = {
              filePath: fullPath,
              fileName: entry.name,
              data: {
                ...data,
                // 合并 client credentials
                ...(clientCredentials ? {
                  clientId: clientCredentials.clientId,
                  clientSecret: clientCredentials.clientSecret,
                } : {})
              },
              isExpired: isTokenExpired(data),
              isUsable: isTokenUsable(data, hasClientCredentials),
              isValid: true,
              hasClientCredentials,
              clientCredentialsExpiresAt: clientCredentials?.clientCredentialsExpiresAt || null,
              clientCredentialsSource: clientCredentials?.clientCredentialsSource || null
            };

            tokens.push(tokenData);
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
