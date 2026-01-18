/**
 * Kiro API 常量定义
 */

export interface KiroConstants {
  REFRESH_URL: string;
  REFRESH_IDC_URL: string;
  BASE_URL: string;
  AMAZON_Q_URL: string;
  USAGE_LIMITS_URL: string;
  DEFAULT_MODEL_NAME: string;
  AXIOS_TIMEOUT: number;
  USER_AGENT: string;
  KIRO_VERSION: string;
  CONTENT_TYPE_JSON: string;
  ACCEPT_JSON: string;
  AUTH_METHOD_SOCIAL: string;
  CHAT_TRIGGER_TYPE_MANUAL: string;
  ORIGIN_AI_EDITOR: string;
}

export const KIRO_CONSTANTS: KiroConstants = {
  REFRESH_URL: 'https://prod.{{region}}.auth.desktop.kiro.dev/refreshToken',
  REFRESH_IDC_URL: 'https://oidc.{{region}}.amazonaws.com/token',
  BASE_URL: 'https://codewhisperer.{{region}}.amazonaws.com/generateAssistantResponse',
  AMAZON_Q_URL: 'https://codewhisperer.{{region}}.amazonaws.com/SendMessageStreaming',
  USAGE_LIMITS_URL: 'https://q.{{region}}.amazonaws.com/getUsageLimits',
  DEFAULT_MODEL_NAME: 'claude-sonnet-4-5',
  AXIOS_TIMEOUT: 300000, // 5 minutes
  USER_AGENT: 'KiroIDE',
  KIRO_VERSION: '0.7.5',
  CONTENT_TYPE_JSON: 'application/json',
  ACCEPT_JSON: 'application/json',
  AUTH_METHOD_SOCIAL: 'social',
  CHAT_TRIGGER_TYPE_MANUAL: 'MANUAL',
  ORIGIN_AI_EDITOR: 'AI_EDITOR',
};

// 支持的模型列表
export const KIRO_MODELS: string[] = [
  'claude-opus-4-5',
  'claude-opus-4-5-20251101',
  'claude-haiku-4-5',
  'claude-sonnet-4-5',
  'claude-sonnet-4-5-20250929',
  'claude-sonnet-4-20250514',
  'claude-3-7-sonnet-20250219'
];

// 模型映射表 (外部名称 -> Kiro 内部名称)
export const MODEL_MAPPING: Record<string, string> = {
  "claude-opus-4-5": "claude-opus-4.5",
  "claude-opus-4-5-20251101": "claude-opus-4.5",
  "claude-haiku-4-5": "claude-haiku-4.5",
  "claude-sonnet-4-5": "CLAUDE_SONNET_4_5_20250929_V1_0",
  "claude-sonnet-4-5-20250929": "CLAUDE_SONNET_4_5_20250929_V1_0",
  "claude-sonnet-4-20250514": "CLAUDE_SONNET_4_20250514_V1_0",
  "claude-3-7-sonnet-20250219": "CLAUDE_3_7_SONNET_20250219_V1_0"
};

// Claude 默认最大 Token 数（用于计算上下文使用百分比）
export const CLAUDE_DEFAULT_MAX_TOKENS = 200000;

// 默认健康检查模型
export const DEFAULT_HEALTH_CHECK_MODEL = 'claude-haiku-4-5';

// 账户类型
export const ACCOUNT_TYPES = {
  FREE: 'FREE',
  PRO: 'PRO',
  UNKNOWN: 'UNKNOWN',
} as const;

// FREE 账户被禁用的模型（Opus 系列）
export const FREE_BLOCKED_MODELS: string[] = [
  'claude-opus-4-5',
  'claude-opus-4-5-20251101',
];

// FREE 账户默认允许的模型
export const DEFAULT_FREE_ALLOWED_MODELS: string[] = KIRO_MODELS.filter(
  (model) => !FREE_BLOCKED_MODELS.includes(model)
);

/**
 * 根据 Kiro API 返回的订阅类型映射到账户类型
 */
export function mapSubscriptionTypeToAccountType(subscriptionType: string | undefined): string {
  if (!subscriptionType) return ACCOUNT_TYPES.UNKNOWN;

  const normalized = subscriptionType.toUpperCase();

  // FREE 类型
  if (
    normalized === 'FREE_TIER' ||
    normalized === 'FREE' ||
    normalized.includes('FREE')
  ) {
    return ACCOUNT_TYPES.FREE;
  }

  // PRO 类型
  if (
    normalized === 'PRO' ||
    normalized === 'PRO_TIER' ||
    normalized.includes('PRO')
  ) {
    return ACCOUNT_TYPES.PRO;
  }

  return ACCOUNT_TYPES.UNKNOWN;
}

export default {
  KIRO_CONSTANTS,
  KIRO_MODELS,
  MODEL_MAPPING,
  CLAUDE_DEFAULT_MAX_TOKENS,
  DEFAULT_HEALTH_CHECK_MODEL,
  ACCOUNT_TYPES,
  FREE_BLOCKED_MODELS,
  DEFAULT_FREE_ALLOWED_MODELS,
  mapSubscriptionTypeToAccountType,
};
