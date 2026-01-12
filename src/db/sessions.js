import { getDatabase } from './index.js';
import crypto from 'crypto';

/**
 * 生成会话 Token
 * @returns {string}
 */
export function generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * 创建会话
 * @param {number} userId
 * @param {number} expireHours
 * @returns {Object}
 */
export function createSession(userId, expireHours = 24) {
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
 * @param {string} token
 * @returns {Object|null}
 */
export function validateSession(token) {
    const db = getDatabase();
    const session = db.prepare(`
        SELECT s.*, u.username, u.role, u.is_active
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = ?
    `).get(token);

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
 * @param {string} token
 * @returns {boolean}
 */
export function deleteSession(token) {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return result.changes > 0;
}

/**
 * 删除用户的所有会话
 * @param {number} userId
 */
export function deleteUserSessions(userId) {
    const db = getDatabase();
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

/**
 * 清理过期会话
 */
export function cleanExpiredSessions() {
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
    deleteSession,
    deleteUserSessions,
    cleanExpiredSessions
};
