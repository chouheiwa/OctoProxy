/**
 * Token 路径解析工具
 * 根据操作系统返回 Kiro IDE 和 AWS SSO token 的标准存储路径
 */

import os from 'os';
import path from 'path';

/**
 * 获取 Kiro IDE token 存储路径
 * @returns {string[]} 可能的路径列表
 */
export function getKiroIDEPaths() {
  const homeDir = os.homedir();
  const platform = os.platform();

  switch (platform) {
    case 'darwin':  // macOS
      return [
        path.join(homeDir, 'Library/Application Support/Kiro/User/globalStorage/kiro.kiroagent'),
        path.join(homeDir, 'Library/Application Support/kiro-cli')
      ];
    case 'win32':   // Windows
      return [
        path.join(homeDir, 'AppData/Roaming/Kiro/User/globalStorage/kiro.kiroagent')
      ];
    case 'linux':   // Linux
      return [
        path.join(homeDir, '.kiro')
      ];
    default:
      return [];
  }
}

/**
 * 获取 AWS SSO token 存储路径
 * @returns {string[]} 可能的路径列表
 */
export function getAWSSSOPaths() {
  const homeDir = os.homedir();

  return [
    path.join(homeDir, '.aws/sso/cache'),
    path.join(homeDir, '.aws/cli/cache')
  ];
}

/**
 * 获取所有 token 路径及其来源
 * @returns {{ source: string, paths: string[] }[]}
 */
export function getAllTokenPaths() {
  return [
    { source: 'Kiro IDE', paths: getKiroIDEPaths() },
    { source: 'AWS SSO', paths: getAWSSSOPaths() }
  ];
}
