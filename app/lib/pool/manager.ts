/**
 * 提供商池管理器
 * 实现 LRU 选择、健康检查、错误熔断
 */

import {
  getAvailableProviders,
  getProviderById,
  updateProviderUsage,
  markProviderUnhealthy,
  markProviderHealthy,
  getAllProviders,
  updateProviderCredentials,
  getProvidersByStrategy,
  getProvidersNeedingUsageSync,
  updateProviderUsageCache,
  updateProviderAccountEmail,
  Provider,
} from "@/lib/db/providers";
import { KiroService, KiroCredentials } from "@/lib/kiro/service";
import { DEFAULT_HEALTH_CHECK_MODEL } from "@/lib/kiro/constants";
import { getConfig, Config } from "@/lib/config";
import { formatKiroUsage } from "@/lib/kiro/usage-formatter";
import { getDatabase } from "@/lib/db";

/**
 * 服务缓存接口
 */
interface ServiceCacheEntry {
  service: KiroService;
  credentialsHash: string;
}

/**
 * 请求函数类型
 */
type RequestFn<T> = (service: KiroService, provider: ProviderWithCredentials) => Promise<T>;

/**
 * 流式请求函数类型
 */
type StreamFn<T> = (service: KiroService, provider: ProviderWithCredentials) => AsyncGenerator<T>;

/**
 * 带凭据的提供商接口
 */
export interface ProviderWithCredentials extends Provider {
  credentials: KiroCredentials;
}

/**
 * 池状态统计接口
 */
export interface PoolStats {
  total: number;
  available: number;
  healthy: number;
  unhealthy: number;
  disabled: number;
  exhausted: number;
  cached: number;
  strategy: string;
}

/**
 * 健康检查结果接口
 */
export interface HealthCheckResult {
  healthy: number;
  unhealthy: number;
}

/**
 * 用量同步结果接口
 */
export interface UsageSyncResult {
  synced: number;
  failed: number;
  exhausted: number;
}

/**
 * 执行选项接口
 */
export interface ExecuteOptions {
  maxRetries?: number;
  baseDelay?: number;
}

// 内存中的服务实例缓存
const serviceCache = new Map<number, ServiceCacheEntry>();

/**
 * 获取或创建 Kiro 服务实例
 */
function getServiceInstance(provider: ProviderWithCredentials): KiroService {
  const cacheKey = provider.id;

  if (serviceCache.has(cacheKey)) {
    const cached = serviceCache.get(cacheKey)!;
    // 检查凭据是否变化
    if (cached.credentialsHash === hashCredentials(provider.credentials)) {
      return cached.service;
    }
    // 凭据变化，删除旧实例
    serviceCache.delete(cacheKey);
  }

  // 创建新实例
  const service = new KiroService(provider.credentials, {});
  serviceCache.set(cacheKey, {
    service,
    credentialsHash: hashCredentials(provider.credentials),
  });

  return service;
}

/**
 * 简单的凭据哈希（用于检测变化）
 */
function hashCredentials(credentials: KiroCredentials): string {
  return JSON.stringify(credentials);
}

/**
 * 清除服务实例缓存
 */
export function clearServiceCache(providerId?: number): void {
  if (providerId) {
    serviceCache.delete(providerId);
  } else {
    serviceCache.clear();
  }
}

/**
 * 检查并保存刷新后的凭据
 */
function checkAndSaveRefreshedCredentials(
  service: KiroService,
  provider: ProviderWithCredentials,
  originalCredentials: KiroCredentials
): void {
  if (
    service.accessToken !== originalCredentials.accessToken ||
    service.refreshToken !== originalCredentials.refreshToken
  ) {
    const updatedCredentials: KiroCredentials = {
      ...originalCredentials,
      accessToken: service.accessToken,
      refreshToken: service.refreshToken,
      profileArn: service.profileArn,
      expiresAt: service.expiresAt,
    };
    updateProviderCredentials(provider.id, updatedCredentials);
    console.log(`[Pool] Updated credentials for provider ${provider.id}`);
  }
}

/**
 * 使用配置的策略选择提供商
 */
export function selectProvider(): Provider | null {
  const config = getConfig();
  const strategy = config.providerStrategy || "lru";
  const providers = getProvidersByStrategy(strategy);

  if (providers.length === 0) {
    // 如果按策略没有可用的，尝试回退到基础可用列表（忽略 usage_exhausted）
    const fallback = getAvailableProviders();
    if (fallback.length === 0) {
      return null;
    }
    return fallback[0];
  }

  // 返回第一个（根据策略排序后的最优选择）
  return providers[0];
}

/**
 * 获取提供商并创建服务实例
 */
export function acquireProvider(): {
  provider: ProviderWithCredentials;
  service: KiroService;
} | null {
  const provider = selectProvider();

  if (!provider) {
    return null;
  }

  // 解析凭据
  let credentials: KiroCredentials;
  try {
    credentials = JSON.parse(provider.credentials);
  } catch (e: any) {
    console.error(
      `[Pool] Failed to parse credentials for provider ${provider.id}:`,
      e.message
    );
    markProviderUnhealthy(provider.id, "Invalid credentials format");
    return acquireProvider(); // 递归尝试下一个
  }

  const service = getServiceInstance({
    ...provider,
    credentials,
  });

  // 更新使用时间
  updateProviderUsage(provider.id);

  return {
    provider: {
      ...provider,
      credentials,
    },
    service,
  };
}

/**
 * 报告提供商错误
 */
export function reportError(providerId: number, errorMessage: string): void {
  const config = getConfig();
  const maxErrorCount = config.maxErrorCount || 3;

  const provider = getProviderById(providerId);
  if (!provider) return;

  const newErrorCount = (provider.error_count || 0) + 1;

  if (newErrorCount >= maxErrorCount) {
    markProviderUnhealthy(providerId, errorMessage);
    console.log(
      `[Pool] Provider ${providerId} marked unhealthy after ${newErrorCount} errors`
    );
  } else {
    // 只更新错误计数，不标记为不健康
    const db = getDatabase();
    db.prepare(
      `
                UPDATE providers
                SET error_count = ?,
                    last_error_time = datetime('now'),
                    last_error_message = ?
                WHERE id = ?
            `
    ).run(newErrorCount, errorMessage, providerId);
  }
}

/**
 * 报告提供商成功（重置错误计数）
 */
export function reportSuccess(providerId: number): void {
  const provider = getProviderById(providerId);
  if (!provider) return;

  // 如果有错误计数，重置它
  if (provider.error_count > 0) {
    markProviderHealthy(providerId);
  }
}

/**
 * 执行单个提供商的健康检查
 */
export async function checkProviderHealth(providerId: number): Promise<boolean> {
  const provider = getProviderById(providerId);
  if (!provider) {
    return false;
  }

  // 解析凭据
  let credentials: KiroCredentials;
  try {
    credentials = JSON.parse(provider.credentials);
  } catch (e: any) {
    markProviderUnhealthy(providerId, "Invalid credentials format");
    return false;
  }

  const service = getServiceInstance({
    ...provider,
    credentials,
  });

  // 确定检查模型
  const checkModel = provider.check_model_name || DEFAULT_HEALTH_CHECK_MODEL;

  console.log(
    `[Pool] Health checking provider ${providerId} with model ${checkModel}...`
  );

  try {
    // 初始化服务（刷新 token）
    await service.initialize();

    // 发送简单请求
    const response = await service.callApi(checkModel, {
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 10,
    });

    // callApi 返回 axios response，实际数据在 response.data
    if (response && response.data) {
      markProviderHealthy(providerId);
      console.log(`[Pool] Provider ${providerId} is healthy`);
      return true;
    } else {
      markProviderUnhealthy(providerId, "Empty response from health check");
      return false;
    }
  } catch (error: any) {
    const errorMsg = error.message || "Unknown error";
    markProviderUnhealthy(providerId, errorMsg);
    console.log(`[Pool] Provider ${providerId} health check failed: ${errorMsg}`);
    return false;
  }
}

/**
 * 执行所有启用健康检查的提供商的检查
 */
export async function checkAllProvidersHealth(): Promise<HealthCheckResult> {
  const providers = getAllProviders().filter(
    (p) => p.check_health && !p.is_disabled
  );

  let healthy = 0;
  let unhealthy = 0;

  for (const provider of providers) {
    const isHealthy = await checkProviderHealth(provider.id);
    if (isHealthy) {
      healthy++;
    } else {
      unhealthy++;
    }
  }

  return { healthy, unhealthy };
}

/**
 * 尝试恢复不健康的提供商
 */
export async function tryRecoverUnhealthyProviders(): Promise<number> {
  const providers = getAllProviders().filter(
    (p) => !p.is_healthy && !p.is_disabled
  );

  let recovered = 0;

  for (const provider of providers) {
    const isHealthy = await checkProviderHealth(provider.id);
    if (isHealthy) {
      recovered++;
    }
  }

  return recovered;
}

/**
 * 获取池状态统计
 */
export function getPoolStats(): PoolStats {
  const config = getConfig();
  const all = getAllProviders();
  const available = getAvailableProviders();

  return {
    total: all.length,
    available: available.length,
    healthy: all.filter((p) => p.is_healthy).length,
    unhealthy: all.filter((p) => !p.is_healthy).length,
    disabled: all.filter((p) => p.is_disabled).length,
    exhausted: all.filter((p) => {
      if (!p.cached_usage_data) return false;
      try {
        const cached = JSON.parse(p.cached_usage_data);
        return cached.exhausted || false;
      } catch {
        return false;
      }
    }).length,
    cached: serviceCache.size,
    strategy: config.providerStrategy || "lru",
  };
}

/**
 * 带重试的请求执行
 */
export async function executeWithRetry<T>(
  requestFn: RequestFn<T>,
  options: ExecuteOptions = {}
): Promise<T> {
  const config = getConfig();
  const maxRetries = options.maxRetries || config.requestMaxRetries || 3;
  const baseDelay = options.baseDelay || config.requestBaseDelay || 1000;

  let lastError: Error | null = null;
  let attempts = 0;

  while (attempts < maxRetries) {
    const acquired = acquireProvider();

    if (!acquired) {
      throw new Error("No available providers");
    }

    const { provider, service } = acquired;

    try {
      // 确保服务已初始化
      await service.initialize();

      // 执行请求
      const result = await requestFn(service, provider);

      // 检查并保存刷新后的凭据
      checkAndSaveRefreshedCredentials(service, provider, provider.credentials);

      // 成功，重置错误计数
      reportSuccess(provider.id);

      return result;
    } catch (error: any) {
      lastError = error;
      attempts++;

      console.error(
        `[Pool] Request failed on provider ${provider.id} (attempt ${attempts}/${maxRetries}):`,
        error.message
      );

      // 报告错误
      reportError(provider.id, error.message);

      // 如果还有重试机会，等待后继续
      if (attempts < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempts - 1); // 指数退避
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error("All retry attempts failed");
}

/**
 * 流式请求执行（不支持自动重试，因为流式响应无法重试）
 */
export async function* executeStream<T>(
  streamFn: StreamFn<T>
): AsyncGenerator<T> {
  const acquired = acquireProvider();

  if (!acquired) {
    throw new Error("No available providers");
  }

  const { provider, service } = acquired;

  try {
    // 确保服务已初始化
    await service.initialize();

    // 执行流式请求
    const stream = streamFn(service, provider);

    for await (const chunk of stream) {
      yield chunk;
    }

    // 检查并保存刷新后的凭据
    checkAndSaveRefreshedCredentials(service, provider, provider.credentials);

    // 成功完成，重置错误计数
    reportSuccess(provider.id);
  } catch (error: any) {
    // 报告错误
    reportError(provider.id, error.message);
    throw error;
  }
}

/**
 * 同步提供商用量信息
 */
export async function syncProvidersUsage(): Promise<UsageSyncResult> {
  const config = getConfig();
  const syncInterval = config.usageSyncIntervalMinutes || 10;
  const providers = getProvidersNeedingUsageSync(syncInterval);

  let synced = 0;
  let failed = 0;
  let exhausted = 0;

  for (const provider of providers) {
    try {
      // 解析凭据
      let credentials: KiroCredentials;
      try {
        credentials = JSON.parse(provider.credentials);
      } catch (e: any) {
        console.error(
          `[UsageSync] Invalid credentials for provider ${provider.id}`
        );
        failed++;
        continue;
      }

      // 创建服务实例并获取用量
      const service = getServiceInstance({ ...provider, credentials });
      await service.initialize();
      const rawUsage = await service.getUsageLimits();
      const usage = formatKiroUsage(rawUsage);

      // 检查并保存刷新后的凭据
      checkAndSaveRefreshedCredentials(service, provider as ProviderWithCredentials, credentials);

      // 更新账户邮箱
      if (usage?.user?.email && usage.user.email !== provider.account_email) {
        updateProviderAccountEmail(provider.id, usage.user.email);
      }

      // 计算总用量
      let totalUsed = 0;
      let totalLimit = 0;

      if (usage?.usageBreakdown) {
        for (const item of usage.usageBreakdown) {
          totalUsed += item.currentUsage || 0;
          totalLimit += item.usageLimit || 0;

          if (item.freeTrial) {
            totalUsed += item.freeTrial.currentUsage || 0;
            totalLimit += item.freeTrial.usageLimit || 0;
          }

          if (item.bonuses) {
            for (const bonus of item.bonuses) {
              totalUsed += bonus.currentUsage || 0;
              totalLimit += bonus.usageLimit || 0;
            }
          }
        }
      }

      const percent = totalLimit > 0 ? (totalUsed / totalLimit) * 100 : 0;
      const isExhausted = totalLimit > 0 && totalUsed >= totalLimit;

      // 更新用量缓存
      updateProviderUsageCache(provider.id, {
        used: totalUsed,
        limit: totalLimit,
        percent: percent,
        exhausted: isExhausted,
      });

      synced++;
      if (isExhausted) {
        exhausted++;
        console.log(
          `[UsageSync] Provider ${provider.id} is exhausted (${totalUsed}/${totalLimit})`
        );
      }
    } catch (error: any) {
      console.error(
        `[UsageSync] Failed to sync provider ${provider.id}:`,
        error.message
      );
      failed++;
    }
  }

  return { synced, failed, exhausted };
}

export default {
  selectProvider,
  acquireProvider,
  reportError,
  reportSuccess,
  checkProviderHealth,
  checkAllProvidersHealth,
  tryRecoverUnhealthyProviders,
  getPoolStats,
  executeWithRetry,
  executeStream,
  clearServiceCache,
  syncProvidersUsage,
};
