import { getDatabase } from './index';
import crypto from 'crypto';

/**
 * 会话信息接口
 */
export interface Session {
    id: number;
    user_id: number;
    token: string;
    expires_at: string;
    created_at: string;
}

/**
 * 会话验证返回的用户信息
 */
interface SessionValidationResult {
    userId: number;
    username: string;
    role: string;
    expiresAt: string;
}

/**
 * 创建会话返回的信息
 */
interface SessionCreationResult {
    token: string;
    expiresAt: string;
}

/**
 * 数据库联合查询返回的会话数据
 */
interface SessionWithUser extends Session {
    username: string;
    role: string;
    is_active: number;
}

/**
 * 生成会话 Token
 */
export function generateSessionToken(): string {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * 创建会话
 */
export function createSession(userId: number, expireHours: number = 24): SessionCreationResult {
    const db = getDatabase();
    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + expireHours * 60 * 60 * 1000).toISOString();

    db.prepare(`
        INSERT INTO sessions (user_id, token, expires_at)
        VALUES (?, ?, ?)
    `).run(userId, token, expiresAt);

    return { token, expiresAt };
}

/**
 * 验证会话
 */
export function validateSession(token: string): SessionValidationResult | null {
    const db = getDatabase();
    const session = db.prepare(`
        SELECT s.*, u.username, u.role, u.is_active
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = ?
    `).get(token) as SessionWithUser | undefined;

    if (!session) {
        return null;
    }

    // 检查是否过期
    if (new Date(session.expires_at) < new Date()) {
        deleteSession(token);
        return null;
    }

    // 检查用户是否激活
    if (!session.is_active) {
        deleteSession(token);
        return null;
    }

    return {
        userId: session.user_id,
        username: session.username,
        role: session.role,
        expiresAt: session.expires_at
    };
}

/**
 * 删除会话
 */
export function deleteSession(token: string): boolean {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return result.changes > 0;
}

/**
 * 删除用户的所有会话
 */
export function deleteUserSessions(userId: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

/**
 * 通过 token 获取会话
 */
export function getSessionByToken(token: string): Session | null {
    const db = getDatabase();
    const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token) as Session | undefined;
    return session || null;
}

/**
 * 清理过期会话
 */
export function cleanExpiredSessions(): void {
    const db = getDatabase();
    const result = db.prepare(`
        DELETE FROM sessions WHERE expires_at < datetime('now')
    `).run();
    if (result.changes > 0) {
        console.log(`[Sessions] Cleaned ${result.changes} expired sessions`);
    }
}

export default {
    generateSessionToken,
    createSession,
    validateSession,
    getSessionByToken,
    deleteSession,
    deleteUserSessions,
    cleanExpiredSessions
};
