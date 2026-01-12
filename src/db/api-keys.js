import { getDatabase } from './index.js';
import crypto from 'crypto';

const KEY_PREFIX = 'kp_';

/**
 * 生成 API Key
 * @returns {string}
 */
export function generateApiKey() {
    const randomPart = crypto.randomBytes(24).toString('base64url');
    return `${KEY_PREFIX}${randomPart}`;
}

/**
 * 计算 Key 的哈希值
 * @param {string} key
 * @returns {string}
 */
export function hashApiKey(key) {
    return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * 获取所有 API Keys
 * @returns {Array}
 */
export function getAllApiKeys() {
    const db = getDatabase();
    return db.prepare(`
        SELECT ak.id, ak.key_prefix, ak.name, ak.user_id,
               ak.daily_limit, ak.today_usage, ak.total_usage, ak.last_reset_date,
               ak.is_active, ak.last_used_at, ak.created_at,
               u.username as user_name
        FROM api_keys ak
        LEFT JOIN users u ON ak.user_id = u.id
        ORDER BY ak.created_at DESC
    `).all();
}

/**
 * 获取 API Key（通过 ID）
 * @param {number} id
 * @returns {Object|null}
 */
export function getApiKeyById(id) {
    const db = getDatabase();
    return db.prepare(`
        SELECT ak.*, u.username as user_name
        FROM api_keys ak
        LEFT JOIN users u ON ak.user_id = u.id
        WHERE ak.id = ?
    `).get(id);
}

/**
 * 通过 Key 哈希获取 API Key
 * @param {string} keyHash
 * @returns {Object|null}
 */
export function getApiKeyByHash(keyHash) {
    const db = getDatabase();
    return db.prepare('SELECT * FROM api_keys WHERE key_hash = ?').get(keyHash);
}

/**
 * 验证 API Key
 * @param {string} key
 * @returns {Object|null} 返回 key 信息或 null
 */
export function validateApiKey(key) {
    if (!key || !key.startsWith(KEY_PREFIX)) {
        return null;
    }

    const keyHash = hashApiKey(key);
    const apiKey = getApiKeyByHash(keyHash);

    if (!apiKey || !apiKey.is_active) {
        return null;
    }

    // 检查是否需要重置每日用量
    const today = new Date().toISOString().split('T')[0];
    if (apiKey.last_reset_date !== today) {
        resetDailyUsage(apiKey.id, today);
        apiKey.today_usage = 0;
        apiKey.last_reset_date = today;
    }

    // 检查是否超过每日限额
    if (apiKey.daily_limit > 0 && apiKey.today_usage >= apiKey.daily_limit) {
        return { ...apiKey, exceeded: true };
    }

    return apiKey;
}

/**
 * 创建 API Key
 * @param {Object} data
 * @returns {Object} 包含完整 key 的对象（仅创建时返回）
 */
export function createApiKey(data) {
    const db = getDatabase();
    const key = generateApiKey();
    const keyHash = hashApiKey(key);
    const keyPrefix = key.substring(0, 12) + '...';

    const result = db.prepare(`
        INSERT INTO api_keys (key_hash, key_prefix, name, user_id, daily_limit, last_reset_date)
        VALUES (?, ?, ?, ?, ?, date('now'))
    `).run(
        keyHash,
        keyPrefix,
        data.name || null,
        data.userId || null,
        data.dailyLimit ?? -1
    );

    const created = getApiKeyById(result.lastInsertRowid);
    return { ...created, key }; // 仅在创建时返回完整 key
}

/**
 * 更新 API Key
 * @param {number} id
 * @param {Object} data
 * @returns {Object|null}
 */
export function updateApiKey(id, data) {
    const db = getDatabase();
    const updates = [];
    const values = [];

    if (data.name !== undefined) {
        updates.push('name = ?');
        values.push(data.name);
    }
    if (data.dailyLimit !== undefined) {
        updates.push('daily_limit = ?');
        values.push(data.dailyLimit);
    }
    if (data.isActive !== undefined) {
        updates.push('is_active = ?');
        values.push(data.isActive ? 1 : 0);
    }
    if (data.userId !== undefined) {
        updates.push('user_id = ?');
        values.push(data.userId);
    }

    if (updates.length === 0) {
        return getApiKeyById(id);
    }

    values.push(id);
    db.prepare(`UPDATE api_keys SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    return getApiKeyById(id);
}

/**
 * 删除 API Key
 * @param {number} id
 * @returns {boolean}
 */
export function deleteApiKey(id) {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM api_keys WHERE id = ?').run(id);
    return result.changes > 0;
}

/**
 * 增加 API Key 使用量
 * @param {number} id
 */
export function incrementApiKeyUsage(id) {
    const db = getDatabase();
    db.prepare(`
        UPDATE api_keys
        SET today_usage = today_usage + 1,
            total_usage = total_usage + 1,
            last_used_at = datetime('now')
        WHERE id = ?
    `).run(id);
}

/**
 * 重置每日用量
 * @param {number} id
 * @param {string} date
 */
export function resetDailyUsage(id, date) {
    const db = getDatabase();
    db.prepare(`
        UPDATE api_keys
        SET today_usage = 0,
            last_reset_date = ?
        WHERE id = ?
    `).run(date, id);
}

/**
 * 获取用户的 API Keys
 * @param {number} userId
 * @returns {Array}
 */
export function getApiKeysByUserId(userId) {
    const db = getDatabase();
    return db.prepare(`
        SELECT id, key_prefix, name, daily_limit, today_usage, total_usage,
               is_active, last_used_at, created_at
        FROM api_keys
        WHERE user_id = ?
        ORDER BY created_at DESC
    `).all(userId);
}

/**
 * 获取 API Key 统计信息
 * @returns {Object}
 */
export function getApiKeyStats() {
    const db = getDatabase();
    return db.prepare(`
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
            SUM(today_usage) as today_total_usage,
            SUM(total_usage) as all_time_usage
        FROM api_keys
    `).get();
}

export default {
    generateApiKey,
    hashApiKey,
    getAllApiKeys,
    getApiKeyById,
    getApiKeyByHash,
    validateApiKey,
    createApiKey,
    updateApiKey,
    deleteApiKey,
    incrementApiKeyUsage,
    resetDailyUsage,
    getApiKeysByUserId,
    getApiKeyStats
};
