/**
 * 格式化 Kiro 用量信息为易读格式
 * @param {Object} usageData - 原始用量数据
 * @returns {Object} 格式化后的用量信息
 */
export function formatKiroUsage(usageData) {
    if (!usageData) {
        return null;
    }

    const result = {
        // 基本信息
        daysUntilReset: usageData.daysUntilReset,
        nextDateReset: usageData.nextDateReset ? new Date(usageData.nextDateReset * 1000).toISOString() : null,

        // 订阅信息
        subscription: null,

        // 用户信息
        user: null,

        // 用量明细
        usageBreakdown: []
    };

    // 解析订阅信息
    if (usageData.subscriptionInfo) {
        result.subscription = {
            title: usageData.subscriptionInfo.subscriptionTitle,
            type: usageData.subscriptionInfo.type,
            upgradeCapability: usageData.subscriptionInfo.upgradeCapability,
            overageCapability: usageData.subscriptionInfo.overageCapability
        };
    }

    // 解析用户信息
    if (usageData.userInfo) {
        result.user = {
            email: usageData.userInfo.email,
            userId: usageData.userInfo.userId
        };
    }

    // 解析用量明细
    if (usageData.usageBreakdownList && Array.isArray(usageData.usageBreakdownList)) {
        for (const breakdown of usageData.usageBreakdownList) {
            const item = {
                resourceType: breakdown.resourceType,
                displayName: breakdown.displayName,
                displayNamePlural: breakdown.displayNamePlural,
                unit: breakdown.unit,
                currency: breakdown.currency,

                // 当前用量
                currentUsage: breakdown.currentUsageWithPrecision ?? breakdown.currentUsage,
                usageLimit: breakdown.usageLimitWithPrecision ?? breakdown.usageLimit,

                // 超额信息
                currentOverages: breakdown.currentOveragesWithPrecision ?? breakdown.currentOverages,
                overageCap: breakdown.overageCapWithPrecision ?? breakdown.overageCap,
                overageRate: breakdown.overageRate,
                overageCharges: breakdown.overageCharges,

                // 下次重置时间
                nextDateReset: breakdown.nextDateReset ? new Date(breakdown.nextDateReset * 1000).toISOString() : null,

                // 免费试用信息
                freeTrial: null,

                // 奖励信息
                bonuses: []
            };

            // 解析免费试用信息
            if (breakdown.freeTrialInfo) {
                item.freeTrial = {
                    status: breakdown.freeTrialInfo.freeTrialStatus,
                    currentUsage: breakdown.freeTrialInfo.currentUsageWithPrecision ?? breakdown.freeTrialInfo.currentUsage,
                    usageLimit: breakdown.freeTrialInfo.usageLimitWithPrecision ?? breakdown.freeTrialInfo.usageLimit,
                    expiresAt: breakdown.freeTrialInfo.freeTrialExpiry
                        ? new Date(breakdown.freeTrialInfo.freeTrialExpiry * 1000).toISOString()
                        : null
                };
            }

            // 解析奖励信息
            if (breakdown.bonuses && Array.isArray(breakdown.bonuses)) {
                for (const bonus of breakdown.bonuses) {
                    item.bonuses.push({
                        code: bonus.bonusCode,
                        displayName: bonus.displayName,
                        description: bonus.description,
                        status: bonus.status,
                        currentUsage: bonus.currentUsage,
                        usageLimit: bonus.usageLimit,
                        redeemedAt: bonus.redeemedAt ? new Date(bonus.redeemedAt * 1000).toISOString() : null,
                        expiresAt: bonus.expiresAt ? new Date(bonus.expiresAt * 1000).toISOString() : null
                    });
                }
            }

            result.usageBreakdown.push(item);
        }
    }

    return result;
}

export default { formatKiroUsage };
