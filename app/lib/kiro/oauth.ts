/**
 * Kiro OAuth 认证模块
 * 支持 Social Auth (Google/GitHub)、Builder ID 和 IAM Identity Center 三种认证方式
 */

import http from "http";
import crypto from "crypto";
import { URL } from "url";

/**
 * OAuth 配置接口
 */
export interface OAuthConfig {
  authServiceEndpoint: string;
  ssoOIDCEndpoint: string;
  builderIDStartURL: string;
  callbackPortStart: number;
  callbackPortEnd: number;
  scopes: string[];
  pollInterval: number;
  pollTimeout: number;
}

/**
 * OAuth 会话接口
 */
interface OAuthSession {
  sessionId: string;
  type: "social" | "builder-id" | "identity-center";
  provider?: string;
  region: string;
  codeVerifier?: string;
  redirectUri?: string;
  state?: string;
  clientId?: string;
  clientSecret?: string;
  deviceCode?: string;
  userCode?: string;
  interval?: number;
  expiresAt?: number;
  createdAt: number;
  status: "pending" | "completed" | "error" | "expired" | "timeout" | "cancelled";
  error?: string;
  credentials?: any;
  resolve?: (value: any) => void;
  reject?: (reason: any) => void;
  // IAM Identity Center 特定字段
  startUrl?: string;
}

/**
 * OAuth 回调结果接口
 */
interface OAuthCallbackResult {
  code?: string;
  state?: string;
  error?: string;
}

/**
 * 凭据接口
 */
export interface Credentials {
  accessToken: string;
  refreshToken: string;
  profileArn?: string;
  expiresAt: string;
  authMethod: string;
  provider?: string;
  clientId?: string;
  clientSecret?: string;
  region: string;
  startUrl: string;
  ssoRegion: string;
}

// OAuth 配置常量
export const KIRO_OAUTH_CONFIG: OAuthConfig = {
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
const activeSessions = new Map<string, OAuthSession>();

// 活跃的回调服务器
let callbackServer: http.Server | null = null;
let callbackServerPort: number | null = null;

/**
 * 生成 PKCE code_verifier
 */
export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * 生成 PKCE code_challenge
 */
export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

/**
 * 生成随机 state
 */
export function generateState(): string {
  return crypto.randomBytes(16).toString("base64url");
}

/**
 * 查找可用端口
 */
async function findAvailablePort(): Promise<number> {
  const { callbackPortStart, callbackPortEnd } = KIRO_OAUTH_CONFIG;

  for (let port = callbackPortStart; port <= callbackPortEnd; port++) {
    try {
      await new Promise<number>((resolve, reject) => {
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
 */
async function startCallbackServer(
  onCallback: (result: OAuthCallbackResult) => void
): Promise<number> {
  if (callbackServer) {
    return callbackServerPort!;
  }

  const port = await findAvailablePort();

  callbackServer = http.createServer(async (req, res) => {
    const url = new URL(req.url!, `http://127.0.0.1:${port}`);

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
        onCallback({ error, state: state || undefined });
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

  await new Promise<void>((resolve, reject) => {
    callbackServer!.listen(port, "127.0.0.1", () => {
      console.log(`[OAuth] Callback server started on port ${port}`);
      resolve();
    });
    callbackServer!.on("error", reject);
  });

  callbackServerPort = port;
  return port;
}

/**
 * 停止回调服务器
 */
export function stopCallbackServer(): void {
  if (callbackServer) {
    callbackServer.close();
    callbackServer = null;
    callbackServerPort = null;
    console.log("[OAuth] Callback server stopped");
  }
}

/**
 * 启动 Social Auth 流程 (Google/GitHub)
 */
export async function startSocialAuth(
  provider: string,
  region: string = "us-east-1"
): Promise<{ sessionId: string; authUrl: string; state: string }> {
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
    resolve: undefined,
    reject: undefined,
  });

  console.log(`[OAuth] Started Social Auth session: ${sessionId}`);

  return {
    sessionId,
    authUrl,
    state,
  };
}

/**
 * 构建 IAM Identity Center OIDC 端点
 */
function buildIdCOIDCEndpoint(region: string): string {
  return `https://oidc.${region}.amazonaws.com`;
}

/**
 * 支持的 IAM Identity Center 区域列表
 */
export const SUPPORTED_IDC_REGIONS = [
  "us-east-1",
  "us-east-2",
  "us-west-2",
  "ap-south-1",
  "ap-northeast-1",
  "ap-northeast-2",
  "ap-southeast-1",
  "ap-southeast-2",
  "ca-central-1",
  "eu-central-1",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "eu-north-1",
  "sa-east-1",
];

/**
 * 验证 Start URL 格式
 */
export function validateStartUrl(startUrl: string): boolean {
  try {
    const url = new URL(startUrl);
    // IAM Identity Center URL 通常是 https://d-xxxxxxxxx.awsapps.com/start 格式
    // 或者自定义域名
    return url.protocol === "https:" && url.pathname.includes("/start");
  } catch {
    return false;
  }
}

/**
 * 启动 IAM Identity Center 设备授权流程
 */
export async function startIdCAuth(
  startUrl: string,
  region: string = "us-east-1"
): Promise<{
  sessionId: string;
  authUrl: string;
  userCode: string;
  deviceCode: string;
  expiresIn: number;
}> {
  // 验证输入
  if (!validateStartUrl(startUrl)) {
    throw new Error(
      "Invalid Start URL format. Expected format: https://d-xxxxxxxxx.awsapps.com/start"
    );
  }

  if (!SUPPORTED_IDC_REGIONS.includes(region)) {
    throw new Error(
      `Unsupported region: ${region}. Supported regions: ${SUPPORTED_IDC_REGIONS.join(", ")}`
    );
  }

  const sessionId = crypto.randomUUID();
  const oidcEndpoint = buildIdCOIDCEndpoint(region);

  try {
    // 1. 注册 OIDC 客户端 (使用用户提供的 startUrl)
    const regResponse = await fetch(`${oidcEndpoint}/client/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "KiroIDE",
      },
      body: JSON.stringify({
        clientName: "KiroIDE",
        clientType: "public",
        scopes: KIRO_OAUTH_CONFIG.scopes,
        grantTypes: [
          "urn:ietf:params:oauth:grant-type:device_code",
          "refresh_token",
        ],
      }),
    });

    if (!regResponse.ok) {
      const errorText = await regResponse.text();
      throw new Error(
        `Client registration failed: ${regResponse.status} - ${errorText}`
      );
    }

    const regData = await regResponse.json();
    const { clientId, clientSecret } = regData;

    // 2. 启动设备授权 (使用用户提供的 startUrl)
    const authResponse = await fetch(`${oidcEndpoint}/device_authorization`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "KiroIDE",
      },
      body: JSON.stringify({
        clientId,
        clientSecret,
        startUrl, // 使用用户提供的 Start URL
      }),
    });

    if (!authResponse.ok) {
      const errorText = await authResponse.text();
      throw new Error(
        `Device authorization failed: ${authResponse.status} - ${errorText}`
      );
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

    // 3. 保存会话信息
    activeSessions.set(sessionId, {
      sessionId,
      type: "identity-center",
      region,
      clientId,
      clientSecret,
      deviceCode,
      userCode,
      interval: interval || 5,
      expiresAt: Date.now() + expiresIn * 1000,
      createdAt: Date.now(),
      status: "pending",
      startUrl, // 保存用户提供的 Start URL
      resolve: undefined,
      reject: undefined,
    });

    console.log(`[OAuth] Started IAM Identity Center session: ${sessionId}`);

    // 4. 启动后台轮询 (复用 Builder ID 轮询逻辑)
    pollDeviceToken(sessionId);

    return {
      sessionId,
      authUrl: verificationUriComplete || verificationUri,
      userCode,
      deviceCode,
      expiresIn,
    };
  } catch (error: any) {
    console.error("[OAuth] IAM Identity Center auth failed:", error);
    throw error;
  }
}

/**
 * 启动 Builder ID 设备授权流程
 */
export async function startBuilderIDAuth(
  region: string = "us-east-1"
): Promise<{
  sessionId: string;
  authUrl: string;
  userCode: string;
  deviceCode: string;
  expiresIn: number;
}> {
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
          clientName: "KiroIDE",
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
      resolve: undefined,
      reject: undefined,
    });

    console.log(`[OAuth] Started Builder ID session: ${sessionId}`);

    // 启动后台轮询
    pollDeviceToken(sessionId);

    return {
      sessionId,
      authUrl: verificationUriComplete || verificationUri,
      userCode,
      deviceCode,
      expiresIn,
    };
  } catch (error: any) {
    console.error("[OAuth] Builder ID auth failed:", error);
    throw error;
  }
}

/**
 * 处理 OAuth 回调
 */
async function handleOAuthCallback(result: OAuthCallbackResult): Promise<void> {
  const { code, state, error } = result;

  if (!state) return;

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
      startUrl: KIRO_OAUTH_CONFIG.builderIDStartURL,
      ssoRegion: session.region,
    };

    console.log(
      `[OAuth] Social Auth completed for session: ${session.sessionId}`,
    );

    if (session.resolve) {
      session.resolve(session.credentials);
    }
  } catch (error: any) {
    console.error("[OAuth] Token exchange failed:", error);
    session.status = "error";
    session.error = error.message;
    if (session.reject) {
      session.reject(error);
    }
  }
}

/**
 * 轮询设备授权 Token (支持 Builder ID 和 IAM Identity Center)
 */
async function pollDeviceToken(sessionId: string): Promise<void> {
  const session = activeSessions.get(sessionId);
  if (
    !session ||
    (session.type !== "builder-id" && session.type !== "identity-center")
  ) {
    return;
  }

  const { clientId, clientSecret, deviceCode, interval, expiresAt, type } =
    session;

  // 根据会话类型确定 OIDC 端点
  const oidcEndpoint =
    type === "identity-center"
      ? buildIdCOIDCEndpoint(session.region)
      : KIRO_OAUTH_CONFIG.ssoOIDCEndpoint;

  const poll = async (): Promise<void> => {
    if (expiresAt && Date.now() > expiresAt) {
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
      const tokenResponse = await fetch(`${oidcEndpoint}/token`, {
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
      });

      if (tokenResponse.ok) {
        const tokenData = await tokenResponse.json();

        // 根据会话类型设置 authMethod
        const authMethod = type === "identity-center" ? "IdC" : "builder-id";
        const startUrl =
          type === "identity-center"
            ? session.startUrl!
            : KIRO_OAUTH_CONFIG.builderIDStartURL;

        session.status = "completed";
        session.credentials = {
          accessToken: tokenData.accessToken,
          refreshToken: tokenData.refreshToken,
          expiresAt: new Date(
            Date.now() + (tokenData.expiresIn || 3600) * 1000
          ).toISOString(),
          authMethod,
          clientId,
          clientSecret,
          region: session.region,
          startUrl,
          ssoRegion: session.region,
        };

        const typeName =
          type === "identity-center" ? "IAM Identity Center" : "Builder ID";
        console.log(`[OAuth] ${typeName} completed for session: ${sessionId}`);

        if (session.resolve) {
          session.resolve(session.credentials);
        }
        return;
      }

      const errorData = await tokenResponse.json();

      if (errorData.error === "authorization_pending") {
        // 继续轮询
        setTimeout(poll, (interval || 5) * 1000);
      } else if (errorData.error === "slow_down") {
        // 增加间隔
        session.interval = (interval || 5) + 5;
        setTimeout(poll, session.interval * 1000);
      } else {
        session.status = "error";
        session.error = errorData.error_description || errorData.error;
        if (session.reject) {
          session.reject(new Error(session.error));
        }
      }
    } catch (error: any) {
      console.error("[OAuth] Polling error:", error);
      setTimeout(poll, (interval || 5) * 1000);
    }
  };

  // 开始轮询
  setTimeout(poll, (interval || 5) * 1000);
}

/**
 * 等待 OAuth 会话完成
 */
export function waitForAuth(
  sessionId: string,
  timeout: number = 300000
): Promise<Credentials> {
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
      if (session!.status === "pending") {
        session!.status = "timeout";
        reject(new Error("Authentication timeout"));
      }
    }, timeout);
  });
}

/**
 * 获取会话状态
 */
export function getSessionStatus(sessionId: string): {
  sessionId: string;
  type: string;
  status: string;
  provider?: string;
  userCode?: string;
  error?: string;
  credentials?: any;
} | null {
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
    credentials: session.status === "completed" ? session.credentials : undefined,
  };
}

/**
 * 取消会话
 */
export function cancelSession(sessionId: string): boolean {
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
export function cleanupSessions(): void {
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
 */
export async function refreshCredentials(
  refreshToken: string,
  authMethod: string,
  options: {
    clientId?: string;
    clientSecret?: string;
    region?: string;
    startUrl?: string;
  } = {}
): Promise<Credentials> {
  const { clientId, clientSecret, region = "us-east-1", startUrl } = options;

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
      startUrl: KIRO_OAUTH_CONFIG.builderIDStartURL,
      ssoRegion: region,
    };
  } else if (authMethod === "builder-id" || authMethod === "IdC") {
    // Builder ID 和 IAM Identity Center 使用相同的刷新逻辑
    if (!clientId || !clientSecret) {
      throw new Error(
        `clientId and clientSecret are required for ${authMethod} refresh`
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

    // 根据 authMethod 确定 startUrl
    const resolvedStartUrl =
      authMethod === "IdC"
        ? startUrl || ""
        : KIRO_OAUTH_CONFIG.builderIDStartURL;

    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken || refreshToken,
      expiresAt: new Date(
        Date.now() + (data.expiresIn || 3600) * 1000
      ).toISOString(),
      authMethod, // 保持原有的 authMethod
      clientId,
      clientSecret,
      region,
      startUrl: resolvedStartUrl,
      ssoRegion: region,
    };
  } else {
    throw new Error(`Unsupported auth method: ${authMethod}`);
  }
}

export default {
  KIRO_OAUTH_CONFIG,
  SUPPORTED_IDC_REGIONS,
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  validateStartUrl,
  startSocialAuth,
  startBuilderIDAuth,
  startIdCAuth,
  waitForAuth,
  getSessionStatus,
  cancelSession,
  cleanupSessions,
  refreshCredentials,
  stopCallbackServer,
};
