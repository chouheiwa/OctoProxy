import { getDatabase, saveImmediately } from "./index";
import { v4 as uuidv4 } from "uuid";

/**
 * 提供商凭据类型
 */
type ProviderCredentials = string | Record<string, any>;

/**
 * 提供商接口
 */
/**
 * 账户类型
 */
export type AccountType = 'FREE' | 'PRO' | 'UNKNOWN';

export interface Provider {
    id: number;
    uuid: string;
    name: string | null;
    region: string;
    credentials: string;
    account_email: string | null;
    account_type: AccountType;
    allowed_models: string | null;  // JSON array of model names, null = all models
    provider_type: string;  // 'kiro', 'openai', 'anthropic', etc.
    is_healthy: number;
    is_disabled: number;
    error_count: number;
    last_error_time: string | null;
    last_error_message: string | null;
    last_used: string | null;
    usage_count: number;
    check_health: number;
    check_model_name: string | null;
    last_health_check_time: string | null;
    cached_usage_data: string | null;
    last_usage_sync: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * 创建提供商的数据接口
 */
interface CreateProviderData {
    name?: string;
    region?: string;
    credentials: ProviderCredentials;
    checkHealth?: boolean;
    checkModelName?: string | null;
    providerType?: string;
}

/**
 * 更新提供商的数据接口
 */
interface UpdateProviderData {
    name?: string;
    region?: string;
    credentials?: ProviderCredentials;
    isDisabled?: boolean;
    checkHealth?: boolean;
    checkModelName?: string;
    accountType?: AccountType;
    allowedModels?: string[] | null;
    providerType?: string;
}

/**
 * 用量信息接口
 */
interface UsageInfo {
    used?: number;
    limit?: number;
    percent?: number;
    exhausted?: boolean;
}

/**
 * 提供商统计接口
 */
interface ProviderStats {
    total: number;
    healthy: number;
    unhealthy: number;
    disabled: number;
    total_usage: number;
}

/**
 * 提供商选择策略类型
 */
type ProviderStrategy = "lru" | "round_robin" | "least_usage" | "most_usage" | "oldest_first";

/**
 * 获取所有提供商
 */
export function getAllProviders(): Provider[] {
    const db = getDatabase();
    return db
        .prepare(
            `
        SELECT id, uuid, name, region, credentials, account_email,
               account_type, allowed_models, provider_type,
               is_healthy, is_disabled, error_count, last_error_time, last_error_message,
               last_used, usage_count, check_health, check_model_name, last_health_check_time,
               cached_usage_used, cached_usage_limit, cached_usage_percent, usage_exhausted,
               cached_usage_data, last_usage_sync,
               created_at, updated_at
        FROM providers
        ORDER BY provider_type, created_at DESC
    `,
        )
        .all() as Provider[];
}

/**
 * 根据名称获取提供商
 */
export function getProviderByName(name: string): Provider | null {
    const db = getDatabase();
    return db.prepare("SELECT * FROM providers WHERE name = ?").get(name) as Provider | undefined || null;
}

/**
 * 获取提供商（通过 ID）
 */
export function getProviderById(id: number): Provider | null {
    const db = getDatabase();
    return db.prepare("SELECT * FROM providers WHERE id = ?").get(id) as Provider | undefined || null;
}

/**
 * 获取提供商（通过 UUID）
 */
export function getProviderByUuid(uuid: string): Provider | null {
    const db = getDatabase();
    return db.prepare("SELECT * FROM providers WHERE uuid = ?").get(uuid) as Provider | undefined || null;
}

/**
 * 获取健康且未禁用的提供商（用于 LRU 选择）
 */
export function getAvailableProviders(): Provider[] {
    const db = getDatabase();
    return db
        .prepare(
            `
        SELECT * FROM providers
        WHERE is_healthy = 1 AND is_disabled = 0
        ORDER BY
            CASE WHEN last_used IS NULL THEN 0 ELSE 1 END,
            last_used ASC,
            usage_count ASC
    `,
        )
        .all() as Provider[];
}

/**
 * 创建提供商
 */
export function createProvider(data: CreateProviderData): Provider | null {
    const db = getDatabase();
    const uuid = uuidv4();
    const credentials =
        typeof data.credentials === "string"
            ? data.credentials
            : JSON.stringify(data.credentials);

    const result = db
        .prepare(
            `
        INSERT INTO providers (uuid, name, region, credentials, check_health, check_model_name, provider_type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
        )
        .run(
            uuid,
            data.name || null,
            data.region || "us-east-1",
            credentials,
            data.checkHealth ? 1 : 0,
            data.checkModelName || null,
            data.providerType || 'kiro',
        );

    // 立即保存，确保其他请求能读取到新创建的提供商
    saveImmediately();

    return getProviderById(result.lastInsertRowid as number);
}

/**
 * 更新提供商
 */
export function updateProvider(id: number, data: UpdateProviderData): Provider | null {
    const db = getDatabase();
    const updates: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) {
        updates.push("name = ?");
        values.push(data.name);
    }
    if (data.region !== undefined) {
        updates.push("region = ?");
        values.push(data.region);
    }
    if (data.credentials !== undefined) {
        updates.push("credentials = ?");
        values.push(
            typeof data.credentials === "string"
                ? data.credentials
                : JSON.stringify(data.credentials),
        );
    }
    if (data.isDisabled !== undefined) {
        updates.push("is_disabled = ?");
        values.push(data.isDisabled ? 1 : 0);
    }
    if (data.checkHealth !== undefined) {
        updates.push("check_health = ?");
        values.push(data.checkHealth ? 1 : 0);
    }
    if (data.checkModelName !== undefined) {
        updates.push("check_model_name = ?");
        values.push(data.checkModelName);
    }
    if (data.accountType !== undefined) {
        updates.push("account_type = ?");
        values.push(data.accountType);
    }
    if (data.allowedModels !== undefined) {
        updates.push("allowed_models = ?");
        values.push(data.allowedModels === null ? null : JSON.stringify(data.allowedModels));
    }
    if (data.providerType !== undefined) {
        updates.push("provider_type = ?");
        values.push(data.providerType);
    }

    if (updates.length === 0) {
        return getProviderById(id);
    }

    updates.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE providers SET ${updates.join(", ")} WHERE id = ?`).run(
        ...values,
    );

    // 立即保存确保数据持久化
    saveImmediately();

    return getProviderById(id);
}

/**
 * 删除提供商
 */
export function deleteProvider(id: number): boolean {
    const db = getDatabase();
    console.log(`[Database] Deleting provider with id: ${id}`);
    const result = db.prepare("DELETE FROM providers WHERE id = ?").run(id);
    console.log(`[Database] Delete result - changes: ${result.changes}`);

    // 立即保存，确保删除操作持久化
    if (result.changes > 0) {
        saveImmediately();
    }

    return result.changes > 0;
}

/**
 * 更新提供商使用信息（LRU）
 */
export function updateProviderUsage(id: number): void {
    const db = getDatabase();
    db.prepare(
        `
        UPDATE providers
        SET last_used = datetime('now'),
            usage_count = usage_count + 1,
            updated_at = datetime('now')
        WHERE id = ?
    `,
    ).run(id);
}

/**
 * 标记提供商为不健康
 */
export function markProviderUnhealthy(id: number, errorMessage: string, maxErrorCount: number = 3): void {
    const db = getDatabase();
    const provider = getProviderById(id);
    if (!provider) return;

    const newErrorCount = provider.error_count + 1;
    const isHealthy = newErrorCount < maxErrorCount ? 1 : 0;

    db.prepare(
        `
        UPDATE providers
        SET error_count = ?,
            last_error_time = datetime('now'),
            last_error_message = ?,
            last_used = datetime('now'),
            is_healthy = ?,
            updated_at = datetime('now')
        WHERE id = ?
    `,
    ).run(newErrorCount, errorMessage, isHealthy, id);
}

/**
 * 标记提供商为健康
 */
export function markProviderHealthy(
    id: number,
    resetUsageCount: boolean = false,
    healthCheckModel: string | null = null,
): void {
    const db = getDatabase();

    if (resetUsageCount) {
        db.prepare(
            `
            UPDATE providers
            SET is_healthy = 1,
                error_count = 0,
                last_error_time = NULL,
                last_error_message = NULL,
                last_health_check_time = datetime('now'),
                last_health_check_model = ?,
                usage_count = 0,
                updated_at = datetime('now')
            WHERE id = ?
        `,
        ).run(healthCheckModel, id);
    } else {
        db.prepare(
            `
            UPDATE providers
            SET is_healthy = 1,
                error_count = 0,
                last_error_time = NULL,
                last_error_message = NULL,
                last_health_check_time = datetime('now'),
                last_used = datetime('now'),
                usage_count = usage_count + 1,
                updated_at = datetime('now')
            WHERE id = ?
        `,
        ).run(id);
    }
}

/**
 * 重置提供商计数器
 */
export function resetProviderCounters(id: number): void {
    const db = getDatabase();
    db.prepare(
        `
        UPDATE providers
        SET error_count = 0,
            usage_count = 0,
            updated_at = datetime('now')
        WHERE id = ?
    `,
    ).run(id);
}

/**
 * 更新提供商凭据
 */
export function updateProviderCredentials(id: number, credentials: ProviderCredentials): void {
    const db = getDatabase();
    const credentialsStr =
        typeof credentials === "string" ? credentials : JSON.stringify(credentials);
    db.prepare(
        `
        UPDATE providers
        SET credentials = ?,
            updated_at = datetime('now')
        WHERE id = ?
    `,
    ).run(credentialsStr, id);
}

/**
 * 更新提供商账户邮箱
 */
export function updateProviderAccountEmail(id: number, email: string): void {
    const db = getDatabase();
    db.prepare(
        `
        UPDATE providers
        SET account_email = ?,
            updated_at = datetime('now')
        WHERE id = ?
    `,
    ).run(email, id);
}

/**
 * 获取提供商统计信息
 */
export function getProviderStats(): ProviderStats {
    const db = getDatabase();
    const stats = db
        .prepare(
            `
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN is_healthy = 1 AND is_disabled = 0 THEN 1 ELSE 0 END) as healthy,
            SUM(CASE WHEN is_healthy = 0 THEN 1 ELSE 0 END) as unhealthy,
            SUM(CASE WHEN is_disabled = 1 THEN 1 ELSE 0 END) as disabled,
            SUM(usage_count) as total_usage
        FROM providers
    `,
        )
        .get() as ProviderStats;
    return stats;
}

/**
 * 更新提供商用量缓存
 */
export function updateProviderUsageCache(id: number, usageInfo: UsageInfo): void {
    const db = getDatabase();
    db.prepare(
        `
        UPDATE providers
        SET cached_usage_used = ?,
            cached_usage_limit = ?,
            cached_usage_percent = ?,
            usage_exhausted = ?,
            last_usage_sync = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?
    `,
    ).run(
        usageInfo.used || 0,
        usageInfo.limit || 0,
        usageInfo.percent || 0,
        usageInfo.exhausted ? 1 : 0,
        id,
    );

    // 立即保存确保数据持久化
    saveImmediately();
}

/**
 * 更新提供商完整用量数据缓存
 */
export function updateProviderUsageData(id: number, usageData: Record<string, any> | string): void {
    const db = getDatabase();
    const usageDataObj = typeof usageData === "string" ? JSON.parse(usageData) : usageData;
    const usageDataStr = typeof usageData === "string" ? usageData : JSON.stringify(usageData);

    // 提取账户类型和邮箱
    const accountType = usageDataObj?.subscription?.accountType || 'UNKNOWN';
    const accountEmail = usageDataObj?.user?.email || null;

    console.log(`[Provider] Updating provider ${id} usage data, accountType: ${accountType}, email: ${accountEmail}`);

    // 如果有邮箱则一起更新，否则只更新其他字段
    if (accountEmail) {
        db.prepare(
            `
            UPDATE providers
            SET cached_usage_data = ?,
                account_type = ?,
                account_email = ?,
                last_usage_sync = datetime('now'),
                updated_at = datetime('now')
            WHERE id = ?
        `,
        ).run(usageDataStr, accountType, accountEmail, id);
    } else {
        db.prepare(
            `
            UPDATE providers
            SET cached_usage_data = ?,
                account_type = ?,
                last_usage_sync = datetime('now'),
                updated_at = datetime('now')
            WHERE id = ?
        `,
        ).run(usageDataStr, accountType, id);
    }

    // 立即保存确保数据持久化
    saveImmediately();
}

/**
 * 检查提供商是否允许使用指定模型
 */
export function isModelAllowedForProvider(provider: Provider, model: string): boolean {
    if (provider.allowed_models === null) {
        return true; // null = all models allowed
    }
    try {
        const allowedModels = JSON.parse(provider.allowed_models) as string[];
        return allowedModels.includes(model);
    } catch {
        return true; // invalid JSON = allow all (fail open)
    }
}

/**
 * 根据策略获取可用提供商
 * @param strategy - 选择策略
 * @param model - 可选，如果提供则只返回支持该模型的提供商
 */
export function getProvidersByStrategy(strategy: ProviderStrategy, model?: string): Provider[] {
    const db = getDatabase();

    // 基础条件：健康、未禁用、未耗尽额度
    let baseCondition =
        "is_healthy = 1 AND is_disabled = 0 AND usage_exhausted = 0";

    // 如果指定了模型，添加模型过滤条件
    // allowed_models 为 NULL 时允许所有模型，否则检查 JSON 数组中是否包含该模型
    if (model) {
        baseCondition += ` AND (allowed_models IS NULL OR allowed_models LIKE '%"${model}"%')`;
    }

    switch (strategy) {
        case "lru":
            // LRU: 最近最少使用
            return db
                .prepare(
                    `
                SELECT * FROM providers
                WHERE ${baseCondition}
                ORDER BY
                    CASE WHEN last_used IS NULL THEN 0 ELSE 1 END,
                    last_used ASC,
                    usage_count ASC
            `,
                )
                .all() as Provider[];

        case "round_robin":
            // 轮询: 按ID顺序，基于usage_count取模实现轮询效果
            return db
                .prepare(
                    `
                SELECT * FROM providers
                WHERE ${baseCondition}
                ORDER BY
                    usage_count ASC,
                    id ASC
            `,
                )
                .all() as Provider[];

        case "least_usage":
            // 优先使用剩余额度最少的（集中消耗）
            return db
                .prepare(
                    `
                SELECT * FROM providers
                WHERE ${baseCondition}
                ORDER BY
                    CASE WHEN cached_usage_limit > 0
                         THEN (cached_usage_limit - cached_usage_used)
                         ELSE 999999 END ASC,
                    id ASC
            `,
                )
                .all() as Provider[];

        case "most_usage":
            // 优先使用剩余额度最多的（均衡消耗）
            return db
                .prepare(
                    `
                SELECT * FROM providers
                WHERE ${baseCondition}
        ORDER BY
                    CASE WHEN cached_usage_limit > 0
                         THEN (cached_usage_limit - cached_usage_used)
                         ELSE 0 END DESC,
                    id ASC
            `,
                )
                .all() as Provider[];

        case "oldest_first":
            // 优先使用最早创建的（集中消耗）
            return db
                .prepare(
                    `
                SELECT * FROM providers
                WHERE ${baseCondition}
                ORDER BY
                    created_at ASC,
                    id ASC
            `,
                )
                .all() as Provider[];

        default:
            // 默认使用 LRU
            return db
                .prepare(
                    `
                SELECT * FROM providers
                WHERE ${baseCondition}
                ORDER BY
                    CASE WHEN last_used IS NULL THEN 0 ELSE 1 END,
                    last_used ASC,
                    usage_count ASC
            `,
                )
                .all() as Provider[];
    }
}

/**
 * 获取需要同步用量的提供商
 */
export function getProvidersNeedingUsageSync(minutesAgo: number = 10): Provider[] {
    const db = getDatabase();
    return db
        .prepare(
            `
        SELECT * FROM providers
        WHERE is_disabled = 0
          AND (last_usage_sync IS NULL
               OR datetime(last_usage_sync, '+' || ? || ' minutes') < datetime('now'))
        ORDER BY last_usage_sync ASC NULLS FIRST
    `,
        )
        .all(minutesAgo) as Provider[];
}

export default {
    getAllProviders,
    getProviderById,
    getProviderByUuid,
    getProviderByName,
    getAvailableProviders,
    createProvider,
    updateProvider,
    deleteProvider,
    updateProviderUsage,
    markProviderUnhealthy,
    markProviderHealthy,
    resetProviderCounters,
    updateProviderCredentials,
    updateProviderAccountEmail,
    updateProviderUsageCache,
    updateProviderUsageData,
    getProvidersByStrategy,
    getProvidersNeedingUsageSync,
    getProviderStats,
    isModelAllowedForProvider,
};
