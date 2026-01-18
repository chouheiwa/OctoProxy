import { getDatabase, saveImmediately } from "./index";

/**
 * OAuth 会话数据库接口
 */
export interface OAuthSessionDB {
    id: number;
    session_id: string;
    type: "social" | "builder-id" | "identity-center";
    provider?: string;
    region: string;
    code_verifier?: string;
    redirect_uri?: string;
    state?: string;
    client_id?: string;
    client_secret?: string;
    client_secret_expires_at?: number;
    device_code?: string;
    user_code?: string;
    poll_interval?: number;
    expires_at?: number;
    created_at: string;
    status: "pending" | "completed" | "error" | "expired" | "timeout" | "cancelled";
    error?: string;
    credentials?: string; // JSON string
    start_url?: string;
}

/**
 * 创建 OAuth 会话
 */
export function createOAuthSession(data: {
    sessionId: string;
    type: "social" | "builder-id" | "identity-center";
    provider?: string;
    region: string;
    codeVerifier?: string;
    redirectUri?: string;
    state?: string;
    clientId?: string;
    clientSecret?: string;
    clientSecretExpiresAt?: number;
    deviceCode?: string;
    userCode?: string;
    interval?: number;
    expiresAt?: number;
    startUrl?: string;
}): OAuthSessionDB {
    const db = getDatabase();

    db.prepare(`
        INSERT INTO oauth_sessions (
            session_id, type, provider, region,
            code_verifier, redirect_uri, state,
            client_id, client_secret, client_secret_expires_at,
            device_code, user_code, poll_interval, expires_at,
            start_url, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
        data.sessionId,
        data.type,
        data.provider || null,
        data.region,
        data.codeVerifier || null,
        data.redirectUri || null,
        data.state || null,
        data.clientId || null,
        data.clientSecret || null,
        data.clientSecretExpiresAt || null,
        data.deviceCode || null,
        data.userCode || null,
        data.interval || null,
        data.expiresAt || null,
        data.startUrl || null
    );

    // 立即保存
    saveImmediately();

    return getOAuthSessionBySessionId(data.sessionId)!;
}

/**
 * 通过 session_id 获取会话
 */
export function getOAuthSessionBySessionId(sessionId: string): OAuthSessionDB | null {
    const db = getDatabase();
    const session = db.prepare(`
        SELECT * FROM oauth_sessions WHERE session_id = ?
    `).get(sessionId) as OAuthSessionDB | undefined;

    return session || null;
}

/**
 * 通过 state 获取会话
 */
export function getOAuthSessionByState(state: string): OAuthSessionDB | null {
    const db = getDatabase();
    const session = db.prepare(`
        SELECT * FROM oauth_sessions WHERE state = ?
    `).get(state) as OAuthSessionDB | undefined;

    return session || null;
}

/**
 * 更新会话状态
 */
export function updateOAuthSessionStatus(
    sessionId: string,
    status: OAuthSessionDB["status"],
    error?: string,
    credentials?: any
): void {
    const db = getDatabase();

    if (credentials) {
        db.prepare(`
            UPDATE oauth_sessions
            SET status = ?, error = ?, credentials = ?
            WHERE session_id = ?
        `).run(status, error || null, JSON.stringify(credentials), sessionId);
    } else {
        db.prepare(`
            UPDATE oauth_sessions
            SET status = ?, error = ?
            WHERE session_id = ?
        `).run(status, error || null, sessionId);
    }

    // 立即保存
    saveImmediately();
}

/**
 * 更新轮询间隔
 */
export function updateOAuthSessionInterval(sessionId: string, interval: number): void {
    const db = getDatabase();
    db.prepare(`
        UPDATE oauth_sessions SET poll_interval = ? WHERE session_id = ?
    `).run(interval, sessionId);

    saveImmediately();
}

/**
 * 删除会话
 */
export function deleteOAuthSession(sessionId: string): boolean {
    const db = getDatabase();
    const result = db.prepare(`
        DELETE FROM oauth_sessions WHERE session_id = ?
    `).run(sessionId);

    if (result.changes > 0) {
        saveImmediately();
    }

    return result.changes > 0;
}

/**
 * 清理过期会话（超过 10 分钟的会话）
 */
export function cleanupExpiredOAuthSessions(): number {
    const db = getDatabase();
    const result = db.prepare(`
        DELETE FROM oauth_sessions
        WHERE created_at < datetime('now', '-10 minutes')
    `).run();

    if (result.changes > 0) {
        saveImmediately();
        console.log(`[OAuth] Cleaned up ${result.changes} expired sessions`);
    }

    return result.changes;
}

export default {
    createOAuthSession,
    getOAuthSessionBySessionId,
    getOAuthSessionByState,
    updateOAuthSessionStatus,
    updateOAuthSessionInterval,
    deleteOAuthSession,
    cleanupExpiredOAuthSessions,
};
