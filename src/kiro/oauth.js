/**
 * Kiro OAuth 认证模块
 * 支持 Social Auth (Google/GitHub) 和 Builder ID 两种认证方式
 */

import http from "http";
import crypto from "crypto";
import { URL } from "url";

// OAuth 配置常量
export const KIRO_OAUTH_CONFIG = {
  // Kiro Auth Service 端点 (用于 Social Auth)
  authServiceEndpoint: "https://prod.us-east-1.auth.desktop.kiro.dev",

  // AWS SSO OIDC 端点 (用于 Builder ID)
  ssoOIDCEndpoint: "https://oidc.us-east-1.amazonaws.com",

  // AWS Builder ID 起始 URL
  builderIDStartURL: "https://view.awsapps.com/start",

  // 本地回调端口范围
  callbackPortStart: 19876,
  callbackPortEnd: 19880,

  // CodeWhisperer Scopes
  scopes: [
    "codewhisperer:completions",
    "codewhisperer:analysis",
    "codewhisperer:conversations",
    "codewhisperer:transformations",
    "codewhisperer:taskassist",
  ],

  // 轮询间隔 (毫秒)
  pollInterval: 5000,

  // 轮询超时 (毫秒)
  pollTimeout: 300000, // 5 分钟
};

// 活跃的 OAuth 会话
const activeSessions = new Map();

// 活跃的回调服务器
let callbackServer = null;
let callbackServerPort = null;

/**
 * 生成 PKCE code_verifier
 * @returns {string}
 */
export function generateCodeVerifier() {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * 生成 PKCE code_challenge
 * @param {string} verifier
 * @returns {string}
 */
export function generateCodeChallenge(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

/**
 * 生成随机 state
 * @returns {string}
 */
export function generateState() {
  return crypto.randomBytes(16).toString("base64url");
}

/**
 * 查找可用端口
 * @returns {Promise<number>}
 */
async function findAvailablePort() {
  const { callbackPortStart, callbackPortEnd } = KIRO_OAUTH_CONFIG;

  for (let port = callbackPortStart; port <= callbackPortEnd; port++) {
    try {
      await new Promise((resolve, reject) => {
        const server = http.createServer();
        server.listen(port, "127.0.0.1", () => {
          server.close(() => resolve(port));
        });
        server.on("error", reject);
      });
      return port;
    } catch {
      continue;
    }
  }

  throw new Error("No available port for OAuth callback server");
}

/**
 * 启动 OAuth 回调服务器
 * @param {Function} onCallback 回调处理函数
 * @returns {Promise<number>} 端口号
 */
async function startCallbackServer(onCallback) {
  if (callbackServer) {
    return callbackServerPort;
  }

  const port = await findAvailablePort();

  callbackServer = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);

    if (url.pathname === "/oauth/callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      // 发送响应页面
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });

      if (error) {
        res.end(`
                    <html>
                    <head><title>Authentication Failed</title></head>
                    <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                        <h1 style="color: #ef4444;">Authentication Failed</h1>
                        <p>Error: ${error}</p>
                        <p>You can close this window.</p>
                    </body>
                    </html>
                `);
        onCallback({ error, state });
      } else if (code && state) {
        res.end(`
                    <html>
                    <head><title>Authentication Successful</title></head>
                    <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                        <h1 style="color: #22c55e;">Authentication Successful</h1>
                        <p>You can close this window and return to the application.</p>
                        <script>setTimeout(() => window.close(), 2000);</script>
                    </body>
                    </html>
                `);
        onCallback({ code, state });
      } else {
        res.end(`
                    <html>
                    <head><title>Invalid Request</title></head>
                    <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                        <h1 style="color: #f59e0b;">Invalid Request</h1>
                        <p>Missing required parameters.</p>
                    </body>
                    </html>
                `);
      }
    } else {
      res.writeHead(404);
      res.end("Not Found");
    }
  });

  await new Promise((resolve, reject) => {
    callbackServer.listen(port, "127.0.0.1", () => {
      console.log(`[OAuth] Callback server started on port ${port}`);
      resolve();
    });
    callbackServer.on("error", reject);
  });

  callbackServerPort = port;
  return port;
}

/**
 * 停止回调服务器
 */
export function stopCallbackServer() {
  if (callbackServer) {
    callbackServer.close();
    callbackServer = null;
    callbackServerPort = null;
    console.log("[OAuth] Callback server stopped");
  }
}

/**
 * 启动 Social Auth 流程 (Google/GitHub)
 * @param {string} provider 'google' 或 'github'
 * @param {string} region 区域
 * @returns {Promise<Object>} { sessionId, authUrl }
 */
export async function startSocialAuth(provider, region = "us-east-1") {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();
  const sessionId = crypto.randomUUID();

  // 启动回调服务器
  const port = await startCallbackServer((result) => {
    handleOAuthCallback(result);
  });

  const redirectUri = `http://127.0.0.1:${port}/oauth/callback`;

  // 构建授权 URL
  const authUrl =
    `${KIRO_OAUTH_CONFIG.authServiceEndpoint}/login?` +
    `idp=${provider}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `code_challenge=${codeChallenge}&` +
    `code_challenge_method=S256&` +
    `state=${state}&` +
    `prompt=select_account`;

  // 保存会话信息
  activeSessions.set(state, {
    sessionId,
    type: "social",
    provider,
    region,
    codeVerifier,
    redirectUri,
    state,
    createdAt: Date.now(),
    status: "pending",
    resolve: null,
    reject: null,
  });

  console.log(`[OAuth] Started Social Auth session: ${sessionId}`);

  return {
    sessionId,
    authUrl,
    state,
  };
}

/**
 * 启动 Builder ID 设备授权流程
 * @param {string} region 区域
 * @returns {Promise<Object>} { sessionId, authUrl, userCode, deviceCode }
 */
export async function startBuilderIDAuth(region = "us-east-1") {
  const sessionId = crypto.randomUUID();

  try {
    // 1. 注册 OIDC 客户端
    const regResponse = await fetch(
      `${KIRO_OAUTH_CONFIG.ssoOIDCEndpoint}/client/register`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "KiroIDE",
        },
        body: JSON.stringify({
          clientName: "OctoProxy",
          clientType: "public",
          scopes: KIRO_OAUTH_CONFIG.scopes,
          grantTypes: [
            "urn:ietf:params:oauth:grant-type:device_code",
            "refresh_token",
          ],
        }),
      },
    );

    if (!regResponse.ok) {
      throw new Error(`Client registration failed: ${regResponse.status}`);
    }

    const regData = await regResponse.json();
    const { clientId, clientSecret } = regData;

    // 2. 启动设备授权
    const authResponse = await fetch(
      `${KIRO_OAUTH_CONFIG.ssoOIDCEndpoint}/device_authorization`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "KiroIDE",
        },
        body: JSON.stringify({
          clientId,
          clientSecret,
          startUrl: KIRO_OAUTH_CONFIG.builderIDStartURL,
        }),
      },
    );

    if (!authResponse.ok) {
      throw new Error(`Device authorization failed: ${authResponse.status}`);
    }

    const authData = await authResponse.json();
    const {
      deviceCode,
      userCode,
      verificationUri,
      verificationUriComplete,
      expiresIn,
      interval,
    } = authData;

    // 保存会话信息
    activeSessions.set(sessionId, {
      sessionId,
      type: "builder-id",
      region,
      clientId,
      clientSecret,
      deviceCode,
      userCode,
      interval: interval || 5,
      expiresAt: Date.now() + expiresIn * 1000,
      createdAt: Date.now(),
      status: "pending",
      resolve: null,
      reject: null,
    });

    console.log(`[OAuth] Started Builder ID session: ${sessionId}`);

    // 启动后台轮询
    pollBuilderIDToken(sessionId);

    return {
      sessionId,
      authUrl: verificationUriComplete || verificationUri,
      userCode,
      deviceCode,
      expiresIn,
    };
  } catch (error) {
    console.error("[OAuth] Builder ID auth failed:", error);
    throw error;
  }
}

/**
 * 处理 OAuth 回调
 * @param {Object} result { code, state } 或 { error, state }
 */
async function handleOAuthCallback(result) {
  const { code, state, error } = result;

  const session = activeSessions.get(state);
  if (!session) {
    console.error("[OAuth] Unknown state:", state);
    return;
  }

  if (error) {
    session.status = "error";
    session.error = error;
    if (session.reject) {
      session.reject(new Error(error));
    }
    return;
  }

  try {
    // 交换 code 获取 token
    const tokenResponse = await fetch(
      `${KIRO_OAUTH_CONFIG.authServiceEndpoint}/oauth/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "KiroIDE",
        },
        body: JSON.stringify({
          code,
          code_verifier: session.codeVerifier,
          redirect_uri: session.redirectUri,
        }),
      },
    );

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(
        `Token exchange failed: ${tokenResponse.status} - ${errorText}`,
      );
    }

    const tokenData = await tokenResponse.json();

    // 更新会话状态
    session.status = "completed";
    session.credentials = {
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      profileArn: tokenData.profileArn,
      expiresAt:
        tokenData.expiresAt || new Date(Date.now() + 3600000).toISOString(),
      authMethod: "social",
      provider: session.provider,
      region: session.region,
    };

    console.log(
      `[OAuth] Social Auth completed for session: ${session.sessionId}`,
    );

    if (session.resolve) {
      session.resolve(session.credentials);
    }
  } catch (error) {
    console.error("[OAuth] Token exchange failed:", error);
    session.status = "error";
    session.error = error.message;
    if (session.reject) {
      session.reject(error);
    }
  }
}

/**
 * 轮询 Builder ID Token
 * @param {string} sessionId
 */
async function pollBuilderIDToken(sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session || session.type !== "builder-id") {
    return;
  }

  const { clientId, clientSecret, deviceCode, interval, expiresAt } = session;

  const poll = async () => {
    if (Date.now() > expiresAt) {
      session.status = "expired";
      session.error = "Device authorization expired";
      if (session.reject) {
        session.reject(new Error("Device authorization expired"));
      }
      return;
    }

    if (session.status !== "pending") {
      return;
    }

    try {
      const tokenResponse = await fetch(
        `${KIRO_OAUTH_CONFIG.ssoOIDCEndpoint}/token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "KiroIDE",
          },
          body: JSON.stringify({
            clientId,
            clientSecret,
            deviceCode,
            grantType: "urn:ietf:params:oauth:grant-type:device_code",
          }),
        },
      );

      if (tokenResponse.ok) {
        const tokenData = await tokenResponse.json();

        session.status = "completed";
        session.credentials = {
          accessToken: tokenData.accessToken,
          refreshToken: tokenData.refreshToken,
          expiresAt: new Date(
            Date.now() + (tokenData.expiresIn || 3600) * 1000,
          ).toISOString(),
          authMethod: "builder-id",
          clientId,
          clientSecret,
          region: session.region,
        };

        console.log(`[OAuth] Builder ID completed for session: ${sessionId}`);

        if (session.resolve) {
          session.resolve(session.credentials);
        }
        return;
      }

      const errorData = await tokenResponse.json();

      if (errorData.error === "authorization_pending") {
        // 继续轮询
        setTimeout(poll, interval * 1000);
      } else if (errorData.error === "slow_down") {
        // 增加间隔
        session.interval = interval + 5;
        setTimeout(poll, session.interval * 1000);
      } else {
        session.status = "error";
        session.error = errorData.error_description || errorData.error;
        if (session.reject) {
          session.reject(new Error(session.error));
        }
      }
    } catch (error) {
      console.error("[OAuth] Polling error:", error);
      setTimeout(poll, interval * 1000);
    }
  };

  // 开始轮询
  setTimeout(poll, interval * 1000);
}

/**
 * 等待 OAuth 会话完成
 * @param {string} sessionId
 * @param {number} timeout 超时时间 (毫秒)
 * @returns {Promise<Object>} 凭据
 */
export function waitForAuth(sessionId, timeout = 300000) {
  return new Promise((resolve, reject) => {
    // 先检查是否是 state (Social Auth)
    let session = activeSessions.get(sessionId);

    // 如果不是，遍历查找
    if (!session) {
      for (const [key, value] of activeSessions) {
        if (value.sessionId === sessionId) {
          session = value;
          break;
        }
      }
    }

    if (!session) {
      reject(new Error("Session not found"));
      return;
    }

    if (session.status === "completed") {
      resolve(session.credentials);
      return;
    }

    if (session.status === "error" || session.status === "expired") {
      reject(new Error(session.error || "Authentication failed"));
      return;
    }

    // 设置回调
    session.resolve = resolve;
    session.reject = reject;

    // 设置超时
    setTimeout(() => {
      if (session.status === "pending") {
        session.status = "timeout";
        reject(new Error("Authentication timeout"));
      }
    }, timeout);
  });
}

/**
 * 获取会话状态
 * @param {string} sessionId
 * @returns {Object|null}
 */
export function getSessionStatus(sessionId) {
  // 先直接查找
  let session = activeSessions.get(sessionId);

  // 如果不是，遍历查找
  if (!session) {
    for (const [key, value] of activeSessions) {
      if (value.sessionId === sessionId) {
        session = value;
        break;
      }
    }
  }

  if (!session) {
    return null;
  }

  return {
    sessionId: session.sessionId,
    type: session.type,
    status: session.status,
    provider: session.provider,
    userCode: session.userCode,
    error: session.error,
    credentials: session.status === "completed" ? session.credentials : null,
  };
}

/**
 * 取消会话
 * @param {string} sessionId
 */
export function cancelSession(sessionId) {
  for (const [key, session] of activeSessions) {
    if (session.sessionId === sessionId || key === sessionId) {
      session.status = "cancelled";
      if (session.reject) {
        session.reject(new Error("Authentication cancelled"));
      }
      activeSessions.delete(key);
      console.log(`[OAuth] Session cancelled: ${sessionId}`);
      return true;
    }
  }
  return false;
}

/**
 * 清理过期会话
 */
export function cleanupSessions() {
  const now = Date.now();
  const maxAge = 10 * 60 * 1000; // 10 分钟

  for (const [key, session] of activeSessions) {
    if (now - session.createdAt > maxAge) {
      activeSessions.delete(key);
    }
  }
}

/**
 * 使用 refreshToken 刷新凭据
 * @param {string} refreshToken
 * @param {string} authMethod 'social' 或 'builder-id'
 * @param {Object} options { clientId, clientSecret, region }
 * @returns {Promise<Object>} 新凭据
 */
export async function refreshCredentials(
  refreshToken,
  authMethod,
  options = {},
) {
  const { clientId, clientSecret, region = "us-east-1" } = options;

  if (authMethod === "social") {
    const refreshUrl = `https://prod.${region}.auth.desktop.kiro.dev/refreshToken`;

    const response = await fetch(refreshUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "KiroIDE",
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.status}`);
    }

    const data = await response.json();

    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken || refreshToken,
      profileArn: data.profileArn,
      expiresAt: data.expiresAt || new Date(Date.now() + 3600000).toISOString(),
      authMethod: "social",
      region,
    };
  } else {
    // Builder ID
    if (!clientId || !clientSecret) {
      throw new Error(
        "clientId and clientSecret are required for Builder ID refresh",
      );
    }

    const refreshUrl = `https://oidc.${region}.amazonaws.com/token`;

    const response = await fetch(refreshUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "KiroIDE",
      },
      body: JSON.stringify({
        clientId,
        clientSecret,
        refreshToken,
        grantType: "refresh_token",
      }),
    });

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.status}`);
    }

    const data = await response.json();

    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken || refreshToken,
      expires: new Date(
        Date.now() + (data.expiresIn || 3600) * 1000,
      ).toISOString(),
      authMethod: "builder-id",
      clientId,
      clientSecret,
      region,
    };
  }
}

export default {
  KIRO_OAUTH_CONFIG,
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  startSocialAuth,
  startBuilderIDAuth,
  waitForAuth,
  getSessionStatus,
  cancelSession,
  cleanupSessions,
  refreshCredentials,
  stopCallbackServer,
};
