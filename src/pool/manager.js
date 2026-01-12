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
    updateProviderAccountEmail
} from '../db/providers.js';
import { KiroService } from '../kiro/service.js';
import { DEFAULT_HEALTH_CHECK_MODEL } from '../kiro/constants.js';
import { getConfig } from '../config.js';
import { formatKiroUsage } from '../kiro/usage-formatter.js';

// 内存中的服务实例缓存
const serviceCache = new Map();

/**
 * 获取或创建 Kiro 服务实例
 * @param {Object} provider
 * @returns {KiroService}
 */
function getServiceInstance(provider) {
    const cacheKey = provider.id;

    if (serviceCache.has(cacheKey)) {
        const cached = serviceCache.get(cacheKey);
        // 检查凭据是否变化
        if (cached.credentialsHash === hashCredentials(provider.credentials)) {
            return cached.service;
        }
        // 凭据变化，删除旧实例
        serviceCache.delete(cacheKey);
    }

    // 创建新实例
    const service = new KiroService(provider.credentials, provider.region);
    serviceCache.set(cacheKey, {
        service,
        credentialsHash: hashCredentials(provider.credentials)
    });

    return service;
}

/**
 * 简单的凭据哈希（用于检测变化）
 * @param {Object} credentials
 * @returns {string}
 */
function hashCredentials(credentials) {
    return JSON.stringify(credentials);
}

/**
 * 清除服务实例缓存
 * @param {number} providerId
 */
export function clearServiceCache(providerId) {
    if (providerId) {
        serviceCache.delete(providerId);
    } else {
        serviceCache.clear();
    }
}

/**
 * 检查并保存刷新后的凭据
 * @param {KiroService} service 服务实例
 * @param {Object} provider 提供商对象
 * @param {Object} originalCredentials 原始凭据
 */
function checkAndSaveRefreshedCredentials(service, provider, originalCredentials) {
    if (service.accessToken !== originalCredentials.accessToken ||
        service.refreshToken !== originalCredentials.refreshToken) {
        const updatedCredentials = {
            ...originalCredentials,
            accessToken: service.accessToken,
            refreshToken: service.refreshToken,
            profileArn: service.profileArn,
            expiresAt: service.expiresAt
        };
        updateProviderCredentials(provider.id, updatedCredentials);
        console.log(`[Pool] Updated credentials for provider ${provider.id}`);
    }
}

/**
 * 使用配置的策略选择提供商
 * @returns {Object|null} 选中的提供商
 */
export function selectProvider() {
    const config = getConfig();
    const strategy = config.providerStrategy || 'lru';
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
 * @returns {{ provider: Object, service: KiroService }|null}
 */
export function acquireProvider() {
    const provider = selectProvider();

    if (!provider) {
        return null;
    }

    // 解析凭据
    let credentials;
    try {
        credentials = JSON.parse(provider.credentials);
    } catch (e) {
        console.error(`[Pool] Failed to parse credentials for provider ${provider.id}:`, e.message);
        markProviderUnhealthy(provider.id, 'Invalid credentials format');
        return acquireProvider(); // 递归尝试下一个
    }

    const service = getServiceInstance({
        ...provider,
        credentials
    });

    // 更新使用时间
    updateProviderUsage(provider.id);

    return {
        provider: {
            ...provider,
            credentials
        },
        service
    };
}

/**
 * 报告提供商错误
 * @param {number} providerId
 * @param {string} errorMessage
 */
export function reportError(providerId, errorMessage) {
    const config = getConfig();
    const maxErrorCount = config.maxErrorCount || 3;

    const provider = getProviderById(providerId);
    if (!provider) return;

    const newErrorCount = (provider.error_count || 0) + 1;

    if (newErrorCount >= maxErrorCount) {
        markProviderUnhealthy(providerId, errorMessage);
        console.log(`[Pool] Provider ${providerId} marked unhealthy after ${newErrorCount} errors`);
    } else {
        // 只更新错误计数，不标记为不健康
        import('../db/index.js').then(({ getDatabase }) => {
            const db = getDatabase();
            db.prepare(`
                UPDATE providers
                SET error_count = ?,
                    last_error_time = datetime('now'),
                    last_error_message = ?
                WHERE id = ?
            `).run(newErrorCount, errorMessage, providerId);
        });
    }
}

/**
 * 报告提供商成功（重置错误计数）
 * @param {number} providerId
 */
export function reportSuccess(providerId) {
    const provider = getProviderById(providerId);
    if (!provider) return;

    // 如果有错误计数，重置它
    if (provider.error_count > 0) {
        markProviderHealthy(providerId);
    }
}

/**
 * 执行单个提供商的健康检查
 * @param {number} providerId
 * @returns {Promise<boolean>}
 */
export async function checkProviderHealth(providerId) {
    const provider = getProviderById(providerId);
    if (!provider) {
        return false;
    }

    // 解析凭据
    let credentials;
    try {
        credentials = JSON.parse(provider.credentials);
    } catch (e) {
        markProviderUnhealthy(providerId, 'Invalid credentials format');
        return false;
    }

    const service = getServiceInstance({
        ...provider,
        credentials
    });

    // 确定检查模型
    const checkModel = provider.check_model_name || DEFAULT_HEALTH_CHECK_MODEL;

    console.log(`[Pool] Health checking provider ${providerId} with model ${checkModel}...`);

    try {
        // 初始化服务（刷新 token）
        await service.initialize();

        // 发送简单请求
        const response = await service.callApi(checkModel, {
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 10
        });

        // callApi 返回 axios response，实际数据在 response.data
        if (response && response.data) {
            markProviderHealthy(providerId);
            console.log(`[Pool] Provider ${providerId} is healthy`);
            return true;
        } else {
            markProviderUnhealthy(providerId, 'Empty response from health check');
            return false;
        }
    } catch (error) {
        const errorMsg = error.message || 'Unknown error';
        markProviderUnhealthy(providerId, errorMsg);
        console.log(`[Pool] Provider ${providerId} health check failed: ${errorMsg}`);
        return false;
    }
}

/**
 * 执行所有启用健康检查的提供商的检查
 * @returns {Promise<{ healthy: number, unhealthy: number }>}
 */
export async function checkAllProvidersHealth() {
    const providers = getAllProviders().filter(p => p.check_health && !p.is_disabled);

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
 * @returns {Promise<number>} 恢复的数量
 */
export async function tryRecoverUnhealthyProviders() {
    const providers = getAllProviders().filter(p => !p.is_healthy && !p.is_disabled);

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
 * @returns {Object}
 */
export function getPoolStats() {
    const config = getConfig();
    const all = getAllProviders();
    const available = getAvailableProviders();

    return {
        total: all.length,
        available: available.length,
        healthy: all.filter(p => p.is_healthy).length,
        unhealthy: all.filter(p => !p.is_healthy).length,
        disabled: all.filter(p => p.is_disabled).length,
        exhausted: all.filter(p => p.usage_exhausted).length,
        cached: serviceCache.size,
        strategy: config.providerStrategy || 'lru'
    };
}

/**
 * 带重试的请求执行
 * @param {Function} requestFn 请求函数 (service, provider) => Promise
 * @param {Object} options 选项
 * @returns {Promise<any>}
 */
export async function executeWithRetry(requestFn, options = {}) {
    const config = getConfig();
    const maxRetries = options.maxRetries || config.requestMaxRetries || 3;
    const baseDelay = options.baseDelay || config.requestBaseDelay || 1000;

    let lastError = null;
    let attempts = 0;

    while (attempts < maxRetries) {
        const acquired = acquireProvider();

        if (!acquired) {
            throw new Error('No available providers');
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
        } catch (error) {
            lastError = error;
            attempts++;

            console.error(`[Pool] Request failed on provider ${provider.id} (attempt ${attempts}/${maxRetries}):`, error.message);

            // 报告错误
            reportError(provider.id, error.message);

            // 如果还有重试机会，等待后继续
            if (attempts < maxRetries) {
                const delay = baseDelay * Math.pow(2, attempts - 1); // 指数退避
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw lastError || new Error('All retry attempts failed');
}

/**
 * 流式请求执行（不支持自动重试，因为流式响应无法重试）
 * @param {Function} streamFn 流式请求函数 (service, provider) => AsyncGenerator
 * @returns {AsyncGenerator}
 */
export async function* executeStream(streamFn) {
    const acquired = acquireProvider();

    if (!acquired) {
        throw new Error('No available providers');
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
    } catch (error) {
        // 报告错误
        reportError(provider.id, error.message);
        throw error;
    }
}

/**
 * 同步提供商用量信息
 * @returns {Promise<{ synced: number, failed: number, exhausted: number }>}
 */
export async function syncProvidersUsage() {
    const config = getConfig();
    const syncInterval = config.usageSyncIntervalMinutes || 10;
    const providers = getProvidersNeedingUsageSync(syncInterval);

    let synced = 0;
    let failed = 0;
    let exhausted = 0;

    for (const provider of providers) {
        try {
            // 解析凭据
            let credentials;
            try {
                credentials = JSON.parse(provider.credentials);
            } catch (e) {
                console.error(`[UsageSync] Invalid credentials for provider ${provider.id}`);
                failed++;
                continue;
            }

            // 创建服务实例并获取用量
            const service = getServiceInstance({ ...provider, credentials });
            await service.initialize();
            const rawUsage = await service.getUsageLimits();
            const usage = formatKiroUsage(rawUsage);

            // 检查并保存刷新后的凭据
            checkAndSaveRefreshedCredentials(service, provider, credentials);

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
                exhausted: isExhausted
            });

            synced++;
            if (isExhausted) {
                exhausted++;
                console.log(`[UsageSync] Provider ${provider.id} is exhausted (${totalUsed}/${totalLimit})`);
            }
        } catch (error) {
            console.error(`ageSync] Failed to sync provider ${provider.id}:`, error.message);
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
    syncProvidersUsage
};
