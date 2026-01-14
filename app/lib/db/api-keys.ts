import { getDatabase } from "./index";
import crypto from "crypto";

const KEY_PREFIX = "kp_";

/**
 * API Key 接口
 */
interface ApiKey {
    id: number;
    key_hash: string;
    key_prefix: string;
    name: string | null;
    user_id: number | null;
    daily_limit: number;
    today_usage: number;
    total_usage: number;
    last_reset_date: string;
    is_active: number;
    last_used_at: string | null;
    created_at: string;
}

/**
 * API Key 及用户名
 */
interface ApiKeyWithUser extends ApiKey {
    user_name: string | null;
}

/**
 * 创建 API Key 的数据接口
 */
interface CreateApiKeyData {
    name?: string | null;
    userId?: number | null;
    dailyLimit?: number;
}

/**
 * 更新 API Key 的数据接口
 */
interface UpdateApiKeyData {
    name?: string;
    dailyLimit?: number;
    isActive?: boolean;
    userId?: number;
}

/**
 * 验证后的 API Key 接口
 */
interface ValidatedApiKey extends ApiKey {
    exceeded?: boolean;
}

/**
 * 创建 API Key 返回的完整信息
 */
interface CreatedApiKey extends ApiKeyWithUser {
    key: string;
}

/**
 * API Key 统计信息
 */
interface ApiKeyStats {
    total: number;
    active: number;
    today_total_usage: number;
    all_time_usage: number;
}

/**
 * 生成 API Key
 */
export function generateApiKey(): string {
    const randomPart = crypto.randomBytes(24).toString("base64url");
    return `${KEY_PREFIX}${randomPart}`;
}

/**
 * 计算 Key 的哈希值
 */
export function hashApiKey(key: string): string {
    return crypto.createHash("sha256").update(key).digest("hex");
}

/**
 * 获取所有 API Keys
 */
export function getAllApiKeys(): ApiKeyWithUser[] {
    const db = getDatabase();
    return db
        .prepare(
            `
        SELECT ak.id, ak.key_prefix, ak.name, ak.user_id,
               ak.daily_limit, ak.today_usage, ak.total_usage, ak.last_reset_date,
               ak.is_active, ak.last_used_at, ak.created_at,
               u.username as user_name
        FROM api_keys ak
        LEFT JOIN users u ON ak.user_id = u.id
        ORDER BY ak.created_at DESC
    `,
        )
        .all() as ApiKeyWithUser[];
}

/**
 * 获取 API Key（通过 ID）
 */
export function getApiKeyById(id: number): ApiKeyWithUser | null {
    const db = getDatabase();
    return db
        .prepare(
            `
        SELECT ak.*, u.username as user_name
        FROM api_keys ak
        LEFT JOIN users u ON ak.user_id = u.id
        WHERE ak.id = ?
    `,
        )
        .get(id) as ApiKeyWithUser | undefined || null;
}

/**
 * 通过 Key 哈希获取 API Key
 */
export function getApiKeyByHash(keyHash: string): ApiKey | null {
    const db = getDatabase();
    return db.prepare("SELECT * FROM api_keys WHERE key_hash = ?").get(keyHash) as ApiKey | undefined || null;
}

/**
 * 验证 API Key
 */
export function validateApiKey(key: string): ValidatedApiKey | null {
    if (!key || !key.startsWith(KEY_PREFIX)) {
        return null;
    }

    const keyHash = hashApiKey(key);
    const apiKey = getApiKeyByHash(keyHash);

    if (!apiKey || !apiKey.is_active) {
        return null;
    }

    // 检查是否需要重置每日用量
    const today = new Date().toISOString().split("T")[0];
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
 */
export function createApiKey(data: CreateApiKeyData): CreatedApiKey {
    const db = getDatabase();
    const key = generateApiKey();
    const keyHash = hashApiKey(key);
    const keyPrefix = key.substring(0, 12) + "...";

    const result = db
        .prepare(
            `
        INSERT INTO api_keys (key_hash, key_prefix, name, user_id, daily_limit, last_reset_date)
        VALUES (?, ?, ?, ?, ?, date('now'))
    `,
        )
        .run(
            keyHash,
            keyPrefix,
            data.name || null,
            data.userId || null,
            data.dailyLimit ?? -1,
        );

    const created = getApiKeyById(result.lastInsertRowid as number);
    return { ...created!, key }; // 仅在创建时返回完整 key
}

/**
 * 更新 API Key
 */
export function updateApiKey(id: number, data: UpdateApiKeyData): ApiKeyWithUser | null {
    const db = getDatabase();
    const updates: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) {
        updates.push("name = ?");
        values.push(data.name);
    }
    if (data.dailyLimit !== undefined) {
        updates.push("daily_limit = ?");
        values.push(data.dailyLimit);
    }
    if (data.isActive !== undefined) {
        updates.push("is_active = ?");
        values.push(data.isActive ? 1 : 0);
    }
    if (data.userId !== undefined) {
        updates.push("user_id = ?");
        values.push(data.userId);
    }

    if (updates.length === 0) {
        return getApiKeyById(id);
    }

    values.push(id);
    db.prepare(`UPDATE api_keys SET ${updates.join(", ")} WHERE id = ?`).run(
        ...values,
    );
    return getApiKeyById(id);
}

/**
 * 删除 API Key
 */
export function deleteApiKey(id: number): boolean {
    const db = getDatabase();
    const result = db.prepare("DELETE FROM api_keys WHERE id = ?").run(id);
    return result.changes > 0;
}

/**
 * 增加 API Key 使用量
 */
export function incrementApiKeyUsage(id: number): void {
    const db = getDatabase();
    db.prepare(
        `
        UPDATE api_keys
        SET today_usage = today_usage + 1,
            total_usage = total_usage + 1,
            last_used_at = datetime('now')
        WHERE id = ?
    `,
    ).run(id);
}

/**
 * 重置每日用量
 */
export function resetDailyUsage(id: number, date: string): void {
    const db = getDatabase();
    db.prepare(
        `
        UPDATE api_keys
        SET today_usage = 0,
            last_reset_date = ?
        WHERE id = ?
    `,
    ).run(date, id);
}

/**
 * 获取用户的 API Keys
 */
export function getApiKeysByUserId(userId: number): Omit<ApiKeyWithUser, 'user_name'>[] {
    const db = getDatabase();
    return db
        .prepare(
            `
        SELECT id, key_prefix, name, daily_limit, today_usage, total_usage,
               is_active, last_used_at, created_at
        FROM api_keys
        WHERE user_id = ?
        ORDER BY created_at DESC
    `,
        )
        .all(userId) as Omit<ApiKeyWithUser, 'user_name'>[];
}

/**
 * 获取 API Key 统计信息
 */
export function getApiKeyStats(): ApiKeyStats {
    const db = getDatabase();
    return db
        .prepare(
            `
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
            SUM(today_usage) as today_total_usage,
            SUM(total_usage) as all_time_usage
        FROM api_keys
    `,
        )
        .get() as ApiKeyStats;
}

/**
 * 通过名称获取 API Key
 */
export function getApiKeyByName(name: string): ApiKeyWithUser | null {
    const db = getDatabase();
    return db
        .prepare(
            `
        SELECT ak.*, u.username as user_name
        FROM api_keys ak
        LEFT JOIN users u ON ak.user_id = u.id
        WHERE ak.name = ?
    `,
        )
        .get(name) as ApiKeyWithUser | undefined || null;
}

/**
 * 通过名称删除 API Key
 */
export function deleteApiKeyByName(name: string): boolean {
    const db = getDatabase();
    const result = db.prepare("DELETE FROM api_keys WHERE name = ?").run(name);
    return result.changes > 0;
}

export default {
    generateApiKey,
    hashApiKey,
    getAllApiKeys,
    getApiKeyById,
    getApiKeyByHash,
    getApiKeyByName,
    validateApiKey,
    createApiKey,
    updateApiKey,
    deleteApiKey,
    deleteApiKeyByName,
    incrementApiKeyUsage,
    resetDailyUsage,
    getApiKeysByUserId,
    getApiKeyStats,
};
