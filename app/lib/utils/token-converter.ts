/**
 * Token 转换工具
 * 将外部 token 格式转换为 OctoProxy credentials 格式
 */

/**
 * Token 文件接口
 */
export interface TokenFile {
  data: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: string;
    expiration?: string;
    region?: string;
    startUrl?: string;
    profileArn?: string;
    clientId?: string;
  };
  source: string;
  fileName: string;
}

/**
 * Provider 信息接口
 */
export interface ProviderInfo {
  name: string;
  region: string;
  credentials: string;
}

/**
 * 转换结果接口
 */
export interface ConversionResult {
  success: boolean;
  provider?: ProviderInfo;
  error?: string;
}

/**
 * 批量转换结果接口
 */
export interface BatchConversionResult {
  success: number;
  failed: number;
  providers: ProviderInfo[];
  errors: Array<{
    token: string;
    error: string;
  }>;
}

/**
 * 转换单个 token
 */
export function convertToken(tokenFile: TokenFile): ConversionResult {
  try {
    const { data, source, fileName } = tokenFile;

    // 基础 credentials 结构
    const credentials: any = {
      accessToken: data.accessToken || '',
      refreshToken: data.refreshToken || '',
      expiresAt: data.expiresAt || data.expiration || '',
      region: data.region || 'us-east-1'
    };

    // 根据来源补充字段
    if (source === 'AWS SSO') {
      credentials.startUrl = data.startUrl || '';
      credentials.ssoRegion = data.region || 'us-east-1';
    } else if (source === 'Kiro IDE') {
      // Kiro IDE 可能有额外字段
      credentials.profileArn = data.profileArn || '';
      credentials.clientId = data.clientId || '';
    }

    // 生成 provider 名称
    const timestamp = new Date().toISOString().slice(0, 10);
    const name = `[Auto] ${source} - ${fileName.replace('.json', '')} (${timestamp})`;

    return {
      success: true,
      provider: {
        name: name,
        region: credentials.region,
        credentials: JSON.stringify(credentials)
      }
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * 批量转换 tokens
 */
export function batchConvert(tokens: TokenFile[]): BatchConversionResult {
  const result: BatchConversionResult = {
    success: 0,
    failed: 0,
    providers: [],
    errors: []
  };

  for (const token of tokens) {
    const conversion = convertToken(token);
    if (conversion.success && conversion.provider) {
      result.success++;
      result.providers.push(conversion.provider);
    } else {
      result.failed++;
      result.errors.push({
        token: token.fileName,
        error: conversion.error || 'Unknown error'
      });
    }
  }

  return result;
}
