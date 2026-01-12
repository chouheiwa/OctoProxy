import { getDatabase } from "./index.js";
import { v4 as uuidv4 } from "uuid";

/**
 * 获取所有提供商
 * @returns {Array}
 */
export function getAllProviders() {
  const db = getDatabase();
  return db
    .prepare(
      `
        SELECT id, uuid, name, region, credentials, account_email,
               is_healthy, is_disabled, error_count, last_error_time, last_error_message,
               last_used, usage_count, check_health, check_model_name, last_health_check_time,
               cached_usage_data, last_usage_sync,
               created_at, updated_at
        FROM providers
        ORDER BY created_at DESC
    `,
    )
    .all();
}

/**
 * 获取提供商（通过 ID）
 * @param {number} id
 * @returns {Object|null}
 */
export function getProviderById(id) {
  const db = getDatabase();
  return db.prepare("SELECT * FROM providers WHERE id = ?").get(id);
}

/**
 * 获取提供商（通过 UUID）
 * @param {string} uuid
 * @returns {Object|null}
 */
export function getProviderByUuid(uuid) {
  const db = getDatabase();
  return db.prepare("SELECT * FROM providers WHERE uuid = ?").get(uuid);
}

/**
 * 获取健康且未禁用的提供商（用于 LRU 选择）
 * @returns {Array}
 */
export function getAvailableProviders() {
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
    .all();
}

/**
 * 创建提供商
 * @param {Object} data
 * @returns {Object}
 */
export function createProvider(data) {
  const db = getDatabase();
  const uuid = uuidv4();
  const credentials =
    typeof data.credentials === "string"
      ? data.credentials
      : JSON.stringify(data.credentials);

  const result = db
    .prepare(
      `
        INSERT INTO providers (uuid, name, region, credentials, check_health, check_model_name)
        VALUES (?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      uuid,
      data.name || null,
      data.region || "us-east-1",
      credentials,
      data.checkHealth ? 1 : 0,
      data.checkModelName || null,
    );

  return getProviderById(result.lastInsertRowid);
}

/**
 * 更新提供商
 * @param {number} id
 * @param {Object} data
 * @returns {Object|null}
 */
export function updateProvider(id, data) {
  const db = getDatabase();
  const updates = [];
  const values = [];

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

  if (updates.length === 0) {
    return getProviderById(id);
  }

  updates.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE providers SET ${updates.join(", ")} WHERE id = ?`).run(
    ...values,
  );
  return getProviderById(id);
}

/**
 * 删除提供商
 * @param {number} id
 * @returns {boolean}
 */
export function deleteProvider(id) {
  const db = getDatabase();
  const result = db.prepare("DELETE FROM providers WHERE id = ?").run(id);
  return result.changes > 0;
}

/**
 * 更新提供商使用信息（LRU）
 * @param {number} id
 */
export function updateProviderUsage(id) {
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
 * @param {number} id
 * @param {string} errorMessage
 * @param {number} maxErrorCount
 */
export function markProviderUnhealthy(id, errorMessage, maxErrorCount = 3) {
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
 * @param {number} id
 * @param {boolean} resetUsageCount
 * @param {string} healthCheckModel
 */
export function markProviderHealthy(
  id,
  resetUsageCount = false,
  healthCheckModel = null,
) {
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
 * @param {number} id
 */
export function resetProviderCounters(id) {
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
 * @param {number} id
 * @param {Object} credentials 新的凭据对象
 */
export function updateProviderCredentials(id, credentials) {
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
 * @param {number} id
 * @param {string} email
 */
export function updateProviderAccountEmail(id, email) {
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
 * @returns {Object}
 */
export function getProviderStats() {
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
    .get();
  return stats;
}

/**
 * 更新提供商用量缓存
 * @param {number} id
 * @param {Object} usageInfo { used, limit, percent, exhausted }
 */
export function updateProviderUsageCache(id, usageInfo) {
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
}

/**
 * 更新提供商完整用量数据缓存
 * @param {number} id
 * @param {Object} usageData 完整的用量数据对象
 */
export function updateProviderUsageData(id, usageData) {
  const db = getDatabase();
  const usageDataStr =
    typeof usageData === "string" ? usageData : JSON.stringify(usageData);
  db.prepare(
    `
        UPDATE providers
        SET cached_usage_data = ?,
            last_usage_sync = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?
    `,
  ).run(usageDataStr, id);
}

/**
 * 根据策略获取可用提供商
 * @param {string} strategy 策略名称
 * @returns {Array}
 */
export function getProvidersByStrategy(strategy) {
  const db = getDatabase();

  // 基础条件：健康、未禁用、未耗尽额度
  const baseCondition =
    "is_healthy = 1 AND is_disabled = 0 AND usage_exhausted = 0";

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
        .all();

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
        .all();

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
        .all();

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
        .all();

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
        .all();

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
        .all();
  }
}

/**
 * 获取需要同步用量的提供商
 * @param {number} minutesAgo 多少分钟前同步过的不需要再同步
 * @returns {Array}
 */
export function getProvidersNeedingUsageSync(minutesAgo = 10) {
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
    .all(minutesAgo);
}

export default {
  getAllProviders,
  getProviderById,
  getProviderByUuid,
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
};
