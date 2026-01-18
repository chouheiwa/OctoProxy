'use client'

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Table,
  Button,
  Space,
  Tag,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  Card,
  Typography,
  Alert,
  Spin,
  message,
  Popconfirm,
  Checkbox,
  Tooltip,
  Progress,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  GoogleOutlined,
  GithubOutlined,
  CloudOutlined,
  LinkOutlined,
  ExportOutlined,
  ImportOutlined,
  SearchOutlined,
  ReloadOutlined,
  BankOutlined,
  SyncOutlined,
} from "@ant-design/icons";

const { Title, Text } = Typography;
const { TextArea } = Input;

// 所有支持的模型列表
const ALL_MODELS = [
  'claude-opus-4-5',
  'claude-opus-4-5-20251101',
  'claude-haiku-4-5',
  'claude-sonnet-4-5',
  'claude-sonnet-4-5-20250929',
  'claude-sonnet-4-20250514',
  'claude-3-7-sonnet-20250219'
];

// FREE 账户默认允许的模型
const DEFAULT_FREE_ALLOWED_MODELS = ALL_MODELS.filter(
  (model) => !model.includes('opus')
);

// 解析 allowed_models 字段
function parseAllowedModels(allowedModels: string | null | undefined): string[] | null {
  if (allowedModels === null || allowedModels === undefined) {
    return null; // null 表示允许所有模型
  }
  try {
    return JSON.parse(allowedModels) as string[];
  } catch {
    return null;
  }
}

// 获取账户类型的颜色
function getAccountTypeColor(accountType: string | undefined): string {
  switch (accountType) {
    case 'FREE':
      return 'warning';
    case 'PRO':
      return 'success';
    default:
      return 'default';
  }
}

interface Provider {
  id: number;
  uuid?: string;
  name: string;
  account_email?: string;
  account_type?: 'FREE' | 'PRO' | 'UNKNOWN';
  allowed_models?: string | null;
  region: string;
  is_healthy: boolean;
  is_disabled: boolean;
  error_count: number;
  usage_count: number;
  last_used?: string;
  check_health: boolean;
  cached_usage_data?: string | null;
  cached_usage_used?: number;
  cached_usage_limit?: number;
  cached_usage_percent?: number;
  usage_exhausted?: boolean;
  last_usage_sync?: string | null;
  credentials?: any;
}

interface OAuthSession {
  sessionId: string;
  status: string;
  error?: string;
}

interface DetectedToken {
  source: string;
  fileName: string;
  data: {
    region?: string;
    refreshToken?: string;
    expiresAt?: string;
    expiration?: string;
    authMethod?: string;
    clientId?: string;
    clientSecret?: string;
  };
  isExpired: boolean;
  isUsable: boolean;
  hasClientCredentials?: boolean;
  clientCredentialsExpiresAt?: string;
}

declare global {
  interface Window {
    electronAPI?: {
      scanKiroTokens: () => Promise<{ success: boolean; tokens: DetectedToken[] }>;
      openOAuthWindow: (sessionId: string, authUrl: string) => Promise<void>;
      closeOAuthWindow: (sessionId: string) => Promise<void>;
    };
  }
}

export default function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { t } = useTranslation();

  // 用量刷新状态
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshingProviders, setRefreshingProviders] = useState<Record<number, boolean>>({});

  // 检测是否在 Electron 环境
  const isElectron = typeof window !== "undefined" && window.electronAPI;

  // Modal states
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [oauthModalOpen, setOauthModalOpen] = useState(false);
  const [progressModalOpen, setProgressModalOpen] = useState(false);
  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [tokenPreviewModalOpen, setTokenPreviewModalOpen] = useState(false);
  const [detectedTokens, setDetectedTokens] = useState<DetectedToken[]>([]);
  const [selectedTokens, setSelectedTokens] = useState<number[]>([]);

  // Form
  const [form] = Form.useForm();
  const [completeForm] = Form.useForm();
  const [idcForm] = Form.useForm();

  // IdC states
  const [idcModalOpen, setIdcModalOpen] = useState(false);

  // OAuth states
  const [oauthSessionId, setOauthSessionId] = useState<string | null>(null);
  const [oauthStatus, setOauthStatus] = useState("");
  const [oauthUserCode, setOauthUserCode] = useState("");
  const [oauthAuthUrl, setOauthAuthUrl] = useState("");
  const [oauthLoading, setOauthLoading] = useState(false);

  useEffect(() => {
    loadProviders();
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (oauthSessionId && progressModalOpen) {
      interval = setInterval(pollOAuthStatus, 3000);
    }
    return () => clearInterval(interval);
  }, [oauthSessionId, progressModalOpen]);

  const loadProviders = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/providers');
      const response = await res.json();
      if (!res.ok) {
        throw new Error(response.error || 'Failed to load providers');
      }
      if (response.success) {
        setProviders(response.providers);
      }
    } catch (err: any) {
      setError(err.message || t("errors.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  const pollOAuthStatus = async () => {
    if (!oauthSessionId) return;
    try {
      const res = await fetch(`/api/oauth/session/${oauthSessionId}`);
      const response = await res.json();
      if (response.success && response.session) {
        const status = response.session.status;
        if (status === "completed") {
          setProgressModalOpen(false);
          setCompleteModalOpen(true);
        } else if (["error", "expired", "cancelled"].includes(status)) {
          setProgressModalOpen(false);
          message.error(
            t("errors.authFailed", { error: response.session.error || status }),
          );
          setOauthSessionId(null);
        }
      }
    } catch (err) {
      console.error("Error polling OAuth status:", err);
    }
  };

  const handleStartSocialAuth = async (provider: string) => {
    setOauthLoading(true);
    try {
      const res = await fetch('/api/oauth/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, region: "us-east-1" }),
      });
      const response = await res.json();
      if (!res.ok) {
        throw new Error(response.error || 'OAuth failed');
      }
      if (response.success) {
        setOauthSessionId(response.sessionId);
        setOauthAuthUrl(response.authUrl);
        setOauthUserCode("");
        setOauthStatus(t("providers.oauth.completeInBrowser"));
        setOauthModalOpen(false);
        setProgressModalOpen(true);

        // 在 Electron 环境下使用无痕窗口
        console.log("[OAuth] electronAPI:", window.electronAPI);
        console.log(
          "[OAuth] openOAuthWindow:",
          window.electronAPI?.openOAuthWindow,
        );
        if (window.electronAPI?.openOAuthWindow) {
          console.log("[OAuth] Using Electron window for:", response.sessionId);
          await window.electronAPI.openOAuthWindow(
            response.sessionId,
            response.authUrl,
          );
        } else {
          console.log("[OAuth] Using window.open for:", response.authUrl);
          window.open(response.authUrl, "_blank");
        }
      } else {
        message.error(response.error || t("errors.authFailed", { error: "" }));
      }
    } catch (err: any) {
      message.error(err.message || t("errors.authFailed", { error: "" }));
    } finally {
      setOauthLoading(false);
    }
  };

  const handleStartBuilderID = async () => {
    setOauthLoading(true);
    try {
      const res = await fetch('/api/oauth/builder-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region: "us-east-1" }),
      });
      const response = await res.json();
      if (!res.ok) {
        throw new Error(response.error || 'OAuth failed');
      }
      if (response.success) {
        setOauthSessionId(response.sessionId);
        setOauthAuthUrl(response.authUrl);
        setOauthUserCode(response.userCode);
        setOauthStatus(t("providers.oauth.enterCodeDesc"));
        setOauthModalOpen(false);
        setProgressModalOpen(true);

        // 在 Electron 环境下使用无痕窗口
        if (window.electronAPI?.openOAuthWindow) {
          await window.electronAPI.openOAuthWindow(
            response.sessionId,
            response.authUrl,
          );
        } else {
          window.open(response.authUrl, "_blank");
        }
      } else {
        message.error(response.error || t("errors.authFailed", { error: "" }));
      }
    } catch (err: any) {
      message.error(err.message || t("errors.authFailed", { error: "" }));
    } finally {
      setOauthLoading(false);
    }
  };

  const handleStartIdC = async (values: { startUrl: string; region: string }) => {
    setOauthLoading(true);
    try {
      const res = await fetch('/api/oauth/identity-center', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const response = await res.json();
      if (!res.ok) {
        throw new Error(response.error || 'OAuth failed');
      }
      if (response.success) {
        setOauthSessionId(response.sessionId);
        setOauthAuthUrl(response.authUrl);
        setOauthUserCode(response.userCode);
        setOauthStatus(t("providers.oauth.enterCodeDesc"));
        setIdcModalOpen(false);
        setOauthModalOpen(false);
        setProgressModalOpen(true);

        // 在 Electron 环境下使用无痕窗口
        if (window.electronAPI?.openOAuthWindow) {
          await window.electronAPI.openOAuthWindow(
            response.sessionId,
            response.authUrl,
          );
        } else {
          window.open(response.authUrl, "_blank");
        }
      } else {
        message.error(response.error || t("errors.authFailed", { error: "" }));
      }
    } catch (err: any) {
      message.error(err.message || t("errors.authFailed", { error: "" }));
    } finally {
      setOauthLoading(false);
    }
  };

  const handleCancelOAuth = async () => {
    if (oauthSessionId) {
      try {
        // 在 Electron 环境下关闭无痕窗口
        if (window.electronAPI?.closeOAuthWindow) {
          await window.electronAPI.closeOAuthWindow(oauthSessionId);
        }
        await fetch(`/api/oauth/session/${oauthSessionId}`, {
          method: 'DELETE',
        });
      } catch (err) {
        console.error("Error cancelling OAuth:", err);
      }
    }
    setOauthSessionId(null);
    setProgressModalOpen(false);
  };

  const handleCompleteOAuth = async (values: any) => {
    try {
      const res = await fetch('/api/oauth/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: oauthSessionId,
          name: values.name,
          checkHealth: true,
        }),
      });
      const response = await res.json();
      if (!res.ok) {
        throw new Error(response.error || 'Failed to complete OAuth');
      }
      if (response.success) {
        setCompleteModalOpen(false);
        setOauthSessionId(null);
        completeForm.resetFields();
        message.success(t("common.save"));
        await loadProviders();

        // 自动刷新新提供商的用量
        if (response.provider?.id) {
          refreshProviderUsage(response.provider.id);
        }
      } else {
        message.error(response.error || t("errors.saveFailed"));
      }
    } catch (err: any) {
      message.error(err.message || t("errors.saveFailed"));
    }
  };

  const handleSaveProvider = async (values: any) => {
    try {
      let credentials = values.credentials;
      if (credentials) {
        try {
          credentials = JSON.parse(credentials);
        } catch {
          message.error(t("providers.invalidJson"));
          return;
        }
      }

      // 处理模型访问权限
      let allowedModels: string[] | null = null;
      if (!values.allowAllModels) {
        allowedModels = values.allowedModels || [];
      }

      const data: any = {
        name: values.name,
        region: values.region,
        checkHealth: values.checkHealth,
        ...(credentials && { credentials }),
        // 只有在编辑时才更新 allowedModels
        ...(editingProvider && { allowedModels }),
      };

      const url = editingProvider
        ? `/api/providers/${editingProvider.id}`
        : '/api/providers';
      const method = editingProvider ? 'PUT' : 'POST';

      const isCreating = !editingProvider;
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const response = await res.json();
      if (!res.ok) {
        throw new Error(response.error || 'Failed to save provider');
      }

      setManualModalOpen(false);
      setEditingProvider(null);
      form.resetFields();
      message.success(t("common.save"));
      await loadProviders();

      // 新创建的提供商自动刷新用量
      if (isCreating && response.provider?.id) {
        refreshProviderUsage(response.provider.id);
      }
    } catch (err: any) {
      message.error(err.message || t("errors.saveFailed"));
    }
  };

  const handleDeleteProvider = async (id: number) => {
    try {
      const res = await fetch(`/api/providers/${id}`, {
        method: 'DELETE',
      });
      const response = await res.json();
      if (!res.ok) {
        throw new Error(response.error || 'Failed to delete provider');
      }
      message.success(t("common.delete") + " " + t("common.success"));
      // 立即从本地状态移除，避免等待 API 响应
      setProviders((prev) => prev.filter((p) => p.id !== id));
    } catch (err: any) {
      message.error(err.message || t("errors.deleteFailed"));
    }
  };

  const handleHealthCheck = async (id: number) => {
    try {
      const res = await fetch(`/api/providers/${id}/health-check`, {
        method: 'POST',
      });
      const response = await res.json();
      if (!res.ok) {
        throw new Error(response.error || 'Health check failed');
      }
      if (response.success) {
        message.info(
          response.healthy
            ? t("providers.healthCheckSuccess")
            : t("providers.healthCheckFailed"),
        );
        loadProviders();
      }
    } catch (err: any) {
      message.error(err.message || t("errors.loadFailed"));
    }
  };

  const handleToggleProvider = async (provider: Provider) => {
    try {
      const res = await fetch(`/api/providers/${provider.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isDisabled: !provider.is_disabled,
        }),
      });
      const response = await res.json();
      if (!res.ok) {
        throw new Error(response.error || 'Failed to toggle provider');
      }
      loadProviders();
    } catch (err: any) {
      message.error(err.message || t("errors.saveFailed"));
    }
  };

  // 刷新单个提供商用量
  const refreshProviderUsage = async (providerId: number) => {
    setRefreshingProviders((prev) => ({ ...prev, [providerId]: true }));

    try {
      const res = await fetch(`/api/usage/${providerId}`, {
        method: 'POST',
      });
      const response = await res.json();
      if (!res.ok) {
        throw new Error(response.error || 'Refresh failed');
      }
      if (response.success) {
        // 更新本地 provider 数据
        setProviders((prev) =>
          prev.map((p) =>
            p.id === providerId
              ? {
                  ...p,
                  account_email: response.account_email || p.account_email,
                  account_type: response.account_type || p.account_type,
                  cached_usage_used: response.usage?.used,
                  cached_usage_limit: response.usage?.limit,
                  cached_usage_percent: response.usage?.percent,
                  usage_exhausted: response.exhausted || false,
                  last_usage_sync: response.lastSync,
                }
              : p,
          ),
        );
        message.success(t("usage.providerRefreshSuccess"));
      }
    } catch (err: any) {
      message.error(err.message || t("errors.loadFailed"));
    } finally {
      setRefreshingProviders((prev) => ({ ...prev, [providerId]: false }));
    }
  };

  // 刷新所有提供商用量
  const refreshAllUsage = async () => {
    setRefreshingAll(true);
    setError("");

    try {
      for (const provider of providers) {
        try {
          setRefreshingProviders((prev) => ({
            ...prev,
            [provider.id]: true,
          }));
          const res = await fetch(`/api/usage/${provider.id}`, {
            method: 'POST',
          });
          const response = await res.json();
          if (response.success) {
            setProviders((prev) =>
              prev.map((p) =>
                p.id === provider.id
                  ? {
                      ...p,
                      account_email: response.account_email || p.account_email,
                      account_type: response.account_type || p.account_type,
                      cached_usage_used: response.usage?.used,
                      cached_usage_limit: response.usage?.limit,
                      cached_usage_percent: response.usage?.percent,
                      usage_exhausted: response.exhausted || false,
                      last_usage_sync: response.lastSync,
                    }
                  : p,
              ),
            );
          }
        } catch (err: any) {
          console.error(`Failed to refresh usage for provider ${provider.id}:`, err);
        } finally {
          setRefreshingProviders((prev) => ({
            ...prev,
            [provider.id]: false,
          }));
        }
      }
      message.success(t("usage.refreshSuccess"));
    } catch (err: any) {
      setError(err.message || t("errors.loadFailed"));
    } finally {
      setRefreshingAll(false);
    }
  };

  const handleExport = async () => {
    try {
      const res = await fetch('/api/providers/export');
      const response = await res.json();
      if (!res.ok) {
        throw new Error(response.error || 'Export failed');
      }
      if (response.success) {
        // 创建下载
        const blob = new Blob([JSON.stringify(response, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        a.download = `octo-proxy-providers-${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        message.success(t("providers.exportSuccess"));

        // 显示安全提醒
        Modal.warning({
          title: t("providers.export"),
          content: t("providers.exportWarning"),
        });
      }
    } catch (err: any) {
      message.error(err.message || t("errors.operationFailed"));
    }
  };

  const handleImport = () => {
    // 创建文件输入框
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        // 验证格式
        if (!data.providers || !Array.isArray(data.providers)) {
          message.error(t("providers.importInvalidFile"));
          return;
        }

        // 显示确认对话框
        Modal.confirm({
          title: t("providers.import"),
          content: (
            <div>
              <p>
                {t("providers.importSelectFile")}: {file.name}
              </p>
              <p>
                {t("common.name")}: {data.providers.length}{" "}
                {t("providers.title").toLowerCase()}
              </p>
            </div>
          ),
          okText: t("common.confirm"),
          cancelText: t("common.cancel"),
          onOk: async () => {
            try {
              const res = await fetch('/api/providers/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  providers: data.providers,
                  skipExisting: true,
                }),
              });
              const response = await res.json();
              if (!res.ok) {
                throw new Error(response.error || 'Import failed');
              }
              if (response.success) {
                message.success(
                  t("providers.importSuccess", {
                    imported: response.imported,
                    skipped: response.skipped,
                    failed: response.failed,
                  }),
                );
                loadProviders();
              } else {
                message.error(response.error || t("providers.importError"));
              }
            } catch (err: any) {
              message.error(err.message || t("providers.importError"));
            }
          },
        });
      } catch {
        message.error(t("providers.importInvalidFile"));
      }
    };
    input.click();
  };

  const handleAutoDetect = async () => {
    if (!isElectron) {
      message.warning(t("providers.autoDetectOnlyInElectron"));
      return;
    }

    try {
      setLoading(true);
      const result = await window.electronAPI!.scanKiroTokens();

      if (!result.success || result.tokens.length === 0) {
        message.info(t("providers.noTokensDetected"));
        return;
      }

      // 过滤掉不可用的 token（既过期又没有 refresh token）
      const usableTokens = result.tokens.filter((token) => token.isUsable);
      const unusableCount = result.tokens.length - usableTokens.length;

      if (usableTokens.length === 0) {
        message.warning(
          `${t("providers.allTokensExpired")}（共找到 ${result.tokens.length} 个 token，全部不可用）`
        );
        return;
      }

      // 统计过期但可用的 token（有 refresh token）
      const expiredButUsable = usableTokens.filter((token) => token.isExpired).length;

      // 如果有不可用的 token，提示用户
      if (unusableCount > 0 || expiredButUsable > 0) {
        const parts = [];
        parts.push(`找到 ${result.tokens.length} 个 token`);
        if (expiredButUsable > 0) {
          parts.push(`${expiredButUsable} 个已过期但可刷新`);
        }
        if (unusableCount > 0) {
          parts.push(`${unusableCount} 个不可用`);
        }
        parts.push(`${usableTokens.length - expiredButUsable} 个有效`);
        message.info(parts.join('，'));
      }

      // 设置检测到的 tokens 并打开预览对话框
      setDetectedTokens(usableTokens);
      setSelectedTokens(usableTokens.map((_, index) => index));
      setTokenPreviewModalOpen(true);
    } catch (err: any) {
      message.error(err.message || t("providers.autoDetectFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleImportSelectedTokens = async () => {
    if (selectedTokens.length === 0) {
      message.warning(t("providers.pleaseSelectTokens"));
      return;
    }

    try {
      const tokensToImport = selectedTokens.map((index) => detectedTokens[index]);
      const res = await fetch('/api/providers/import-from-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tokensToImport),
      });
      const response = await res.json();
      if (!res.ok) {
        throw new Error(response.error || 'Import failed');
      }

      if (response.success) {
        message.success(
          t("providers.importSuccess", {
            imported: response.imported,
            failed: response.failed,
          }),
        );
        setTokenPreviewModalOpen(false);
        await loadProviders();

        // 导入后刷新所有用量
        if (response.imported > 0) {
          refreshAllUsage();
        }
      } else {
        message.error(response.error || t("providers.importError"));
      }
    } catch (err: any) {
      message.error(err.message || t("providers.importError"));
    }
  };

  const openEditModal = (provider: Provider) => {
    setEditingProvider(provider);
    const allowedModels = parseAllowedModels(provider.allowed_models);
    form.setFieldsValue({
      name: provider.name || "",
      region: provider.region || "us-east-1",
      credentials: "",
      checkHealth: provider.check_health,
      allowedModels: allowedModels === null ? ALL_MODELS : allowedModels,
      allowAllModels: allowedModels === null,
    });
    setManualModalOpen(true);
  };

  const openAddModal = () => {
    setEditingProvider(null);
    form.resetFields();
    form.setFieldsValue({
      region: "us-east-1",
      checkHealth: true,
      allowedModels: ALL_MODELS,
      allowAllModels: true,
    });
    setManualModalOpen(true);
  };

  const columns = [
    {
      title: t("common.name"),
      dataIndex: "name",
      key: "name",
      render: (text: string, record: Provider) => text || `Provider #${record.id}`,
    },
    {
      title: t("providers.accountEmail"),
      dataIndex: "account_email",
      key: "account_email",
      render: (text: string) => text || <Text type="secondary">-</Text>,
    },
    {
      title: t("providers.region"),
      dataIndex: "region",
      key: "region",
    },
    {
      title: t("providers.accountType"),
      dataIndex: "account_type",
      key: "account_type",
      render: (accountType: string | undefined) => (
        <Tag color={getAccountTypeColor(accountType)}>
          {accountType || 'UNKNOWN'}
        </Tag>
      ),
    },
    {
      title: t("providers.modelAccess"),
      key: "model_access",
      render: (_: any, record: Provider) => {
        const allowedModels = parseAllowedModels(record.allowed_models);
        if (allowedModels === null) {
          return <Tag color="blue">{t("providers.allModels")}</Tag>;
        }
        return (
          <Tooltip title={allowedModels.join(', ')}>
            <Tag color="cyan">
              {allowedModels.length} {t("providers.models")}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: t("common.status"),
      key: "status",
      render: (_: any, record: Provider) => (
        <Tag color={record.is_healthy ? "success" : "error"}>
          {record.is_healthy ? t("common.healthy") : t("common.unhealthy")}
        </Tag>
      ),
    },
    {
      title: t("common.enabled"),
      key: "enabled",
      render: (_: any, record: Provider) => (
        <Tag color={record.is_disabled ? "warning" : "success"}>
          {record.is_disabled ? t("common.disabled") : t("common.enabled")}
        </Tag>
      ),
    },
    {
      title: t("providers.usage"),
      key: "usage_quota",
      width: 180,
      render: (_: any, record: Provider) => {
        const used = record.cached_usage_used || 0;
        const limit = record.cached_usage_limit || 0;
        const percent = record.cached_usage_percent || 0;
        const isOverLimit = record.usage_exhausted;
        const isRefreshing = refreshingProviders[record.id];

        // 如果没有用量数据
        if (!record.cached_usage_limit) {
          return (
            <Tooltip title={t("usage.noData")}>
              <Text type="secondary">-</Text>
            </Tooltip>
          );
        }

        return (
          <Space direction="vertical" size={0} style={{ width: '100%' }}>
            <Progress
              percent={percent}
              size="small"
              status={isOverLimit ? "exception" : "active"}
              showInfo={false}
              strokeColor={isOverLimit ? "#ff4d4f" : "#1668dc"}
            />
            <Space size={4}>
              <Text
                type={isOverLimit ? "danger" : "secondary"}
                style={{ fontSize: 12 }}
              >
                {used} / {limit}
              </Text>
              <Tooltip title={t("usage.refreshProvider")}>
                <Button
                  type="text"
                  size="small"
                  style={{ padding: 0, height: 16, width: 16, minWidth: 16 }}
                  icon={<SyncOutlined spin={isRefreshing} style={{ fontSize: 10 }} />}
                  onClick={() => refreshProviderUsage(record.id)}
                  disabled={refreshingAll || isRefreshing}
                />
              </Tooltip>
            </Space>
          </Space>
        );
      },
    },
    {
      title: t("providers.lastUsed"),
      dataIndex: "last_used",
      key: "last_used",
      render: (text: string) =>
        text ? new Date(text).toLocaleString() : t("common.never"),
    },
    {
      title: t("common.actions"),
      key: "actions",
      render: (_: any, record: Provider) => (
        <Space size="small">
          <Button size="small" onClick={() => handleHealthCheck(record.id)}>
            {t("common.check")}
          </Button>
          <Button size="small" onClick={() => handleToggleProvider(record)}>
            {record.is_disabled ? t("common.enable") : t("common.disable")}
          </Button>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEditModal(record)}
          />
          <Popconfirm
            title={t("providers.deleteConfirm")}
            onConfirm={() => handleDeleteProvider(record.id)}
            okText={t("common.confirm")}
            cancelText={t("common.cancel")}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <Title level={4} style={{ margin: 0 }}>
          {t("providers.title")}
        </Title>
        <Space>
          <Button
            icon={<SyncOutlined spin={refreshingAll} />}
            onClick={refreshAllUsage}
            loading={refreshingAll}
          >
            {t("usage.refreshAll")}
          </Button>
          <Button icon={<ExportOutlined />} onClick={handleExport}>
            {t("providers.export")}
          </Button>
          <Button icon={<ImportOutlined />} onClick={handleImport}>
            {t("providers.import")}
          </Button>
          {isElectron && (
            <Button
              icon={<SearchOutlined />}
              onClick={handleAutoDetect}
              type="dashed"
            >
              {t("providers.autoDetect")}
            </Button>
          )}
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setOauthModalOpen(true)}
          >
            {t("providers.addViaOAuth")}
          </Button>
          <Button icon={<PlusOutlined />} onClick={openAddModal}>
            {t("providers.addManually")}
          </Button>
        </Space>
      </div>

      {error && (
        <Alert
          message={error}
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Card>
        <Table
          columns={columns}
          dataSource={providers}
          rowKey="id"
          loading={loading}
          locale={{ emptyText: t("providers.noProviders") }}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* Manual Add/Edit Modal */}
      <Modal
        title={
          editingProvider
            ? t("providers.editProvider")
            : t("providers.addProvider")
        }
        open={manualModalOpen}
        onCancel={() => setManualModalOpen(false)}
        footer={null}
        destroyOnHidden
        forceRender
      >
        <Form form={form} layout="vertical" onFinish={handleSaveProvider}>
          <Form.Item name="name" label={t("common.name")}>
            <Input placeholder="My Kiro Account" />
          </Form.Item>
          <Form.Item name="region" label={t("providers.region")}>
            <Select>
              <Select.Option value="us-east-1">us-east-1</Select.Option>
              <Select.Option value="us-west-2">us-west-2</Select.Option>
              <Select.Option value="eu-west-1">eu-west-1</Select.Option>
              <Select.Option value="ap-northeast-1">
                ap-northeast-1
              </Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="credentials"
            label={t("providers.credentials")}
            extra={editingProvider && t("providers.keepExistingCredentials")}
          >
            <TextArea
              rows={6}
              placeholder={t("providers.credentialsPlaceholder")}
            />
          </Form.Item>
          <Form.Item
            name="checkHealth"
            label={t("providers.enableHealthCheck")}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          {/* 模型访问配置 - 仅在编辑时显示 */}
          {editingProvider && (
            <>
              <Form.Item
                name="allowAllModels"
                label={t("providers.allowAllModels")}
                valuePropName="checked"
              >
                <Switch
                  onChange={(checked) => {
                    if (checked) {
                      form.setFieldsValue({ allowedModels: ALL_MODELS });
                    }
                  }}
                />
              </Form.Item>

              <Form.Item
                noStyle
                shouldUpdate={(prevValues, currentValues) =>
                  prevValues.allowAllModels !== currentValues.allowAllModels
                }
              >
                {({ getFieldValue }) =>
                  !getFieldValue("allowAllModels") && (
                    <Form.Item
                      name="allowedModels"
                      label={t("providers.allowedModels")}
                    >
                      <Checkbox.Group style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {ALL_MODELS.map((model) => (
                          <Checkbox key={model} value={model}>
                            {model}
                            {model.includes('opus') && editingProvider?.account_type === 'FREE' && (
                              <Tooltip title={t("providers.opusWarningForFree")}>
                                <Tag color="warning" style={{ marginLeft: 8 }}>
                                  {t("providers.mayNotWork")}
                                </Tag>
                              </Tooltip>
                            )}
                          </Checkbox>
                        ))}
                      </Checkbox.Group>
                    </Form.Item>
                  )
                }
              </Form.Item>

              <Space style={{ marginBottom: 16 }}>
                <Button
                  size="small"
                  onClick={() => {
                    const accountType = editingProvider?.account_type;
                    if (accountType === 'FREE') {
                      form.setFieldsValue({
                        allowAllModels: false,
                        allowedModels: DEFAULT_FREE_ALLOWED_MODELS,
                      });
                    } else {
                      form.setFieldsValue({
                        allowAllModels: true,
                        allowedModels: ALL_MODELS,
                      });
                    }
                  }}
                >
                  {t("providers.resetToDefaults")}
                </Button>
              </Space>
            </>
          )}

          <Form.Item style={{ marginBottom: 0, textAlign: "right" }}>
            <Space>
              <Button onClick={() => setManualModalOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="primary" htmlType="submit">
                {t("common.save")}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* OAuth Options Modal */}
      <Modal
        title={t("providers.oauth.title")}
        open={oauthModalOpen}
        onCancel={() => setOauthModalOpen(false)}
        footer={null}
        width={500}
      >
        {oauthLoading ? (
          <div style={{ textAlign: "center", padding: 40 }}>
            <Spin size="large" />
            <p style={{ marginTop: 16 }}>{t("providers.oauth.initializing")}</p>
          </div>
        ) : (
          <>
            <Text type="secondary">{t("providers.oauth.chooseMethod")}</Text>
            <div style={{ marginTop: 16 }}>
              <Card
                hoverable
                style={{ marginBottom: 12 }}
                onClick={() => handleStartSocialAuth("google")}
              >
                <Space>
                  <GoogleOutlined style={{ fontSize: 24, color: "#db4437" }} />
                  <div>
                    <Text strong>{t("providers.oauth.google")}</Text>
                    <br />
                    <Text type="secondary">
                      {t("providers.oauth.googleDesc")}
                    </Text>
                  </div>
                </Space>
              </Card>
              <Card
                hoverable
                style={{ marginBottom: 12 }}
                onClick={() => handleStartSocialAuth("github")}
              >
                <Space>
                  <GithubOutlined style={{ fontSize: 24 }} />
                  <div>
                    <Text strong>{t("providers.oauth.github")}</Text>
                    <br />
                    <Text type="secondary">
                      {t("providers.oauth.githubDesc")}
                    </Text>
                  </div>
                </Space>
              </Card>
              <Card
                hoverable
                style={{ marginBottom: 12 }}
                onClick={handleStartBuilderID}
              >
                <Space>
                  <CloudOutlined style={{ fontSize: 24, color: "#ff9900" }} />
                  <div>
                    <Text strong>{t("providers.oauth.awsBuilderID")}</Text>
                    <br />
                    <Text type="secondary">
                      {t("providers.oauth.awsBuilderIDDesc")}
                    </Text>
                    <br />
                    <Text
                      type="warning"
                      style={{ fontSize: 12, color: "#faad14" }}
                    >
                      {t("providers.oauth.awsBuilderIDWarning")}
                    </Text>
                  </div>
                </Space>
              </Card>
              <Card
                hoverable
                onClick={() => {
                  setOauthModalOpen(false);
                  setIdcModalOpen(true);
                }}
              >
                <Space>
                  <BankOutlined style={{ fontSize: 24, color: "#1890ff" }} />
                  <div>
                    <Text strong>{t("providers.oauth.identityCenter")}</Text>
                    <br />
                    <Text type="secondary">
                      {t("providers.oauth.identityCenterDesc")}
                    </Text>
                  </div>
                </Space>
              </Card>
            </div>
          </>
        )}
      </Modal>

      {/* OAuth Progress Modal */}
      <Modal
        title={t("providers.oauth.authTitle")}
        open={progressModalOpen}
        onCancel={handleCancelOAuth}
        footer={[
          <Button key="cancel" onClick={handleCancelOAuth}>
            {t("common.cancel")}
          </Button>,
        ]}
      >
        <div style={{ textAlign: "center", padding: 24 }}>
          <Spin size="large" />
          <p style={{ marginTop: 16 }}>{oauthStatus}</p>
          {oauthUserCode && (
            <div style={{ margin: "24px 0" }}>
              <Text type="secondary">{t("providers.oauth.enterCode")}</Text>
              <div
                style={{
                  fontSize: 32,
                  fontWeight: "bold",
                  letterSpacing: 4,
                  margin: "12px 0",
                  padding: 16,
                  background: "#1f1f1f",
                  borderRadius: 8,
                }}
              >
                {oauthUserCode}
              </div>
            </div>
          )}
          <Button
            type="primary"
            icon={<LinkOutlined />}
            href={oauthAuthUrl}
            target="_blank"
          >
            {t("providers.oauth.openAuthPage")}
          </Button>
        </div>
      </Modal>

      {/* OAuth Complete Modal */}
      <Modal
        title={t("providers.oauth.completeSetup")}
        open={completeModalOpen}
        onCancel={() => setCompleteModalOpen(false)}
        footer={null}
      >
        <Alert
          message={t("providers.oauth.authSuccess")}
          type="success"
          showIcon
          style={{ marginBottom: 24 }}
        />
        <Form
          form={completeForm}
          layout="vertical"
          onFinish={handleCompleteOAuth}
        >
          <Form.Item name="name" label={t("providers.oauth.providerName")}>
            <Input placeholder="My Kiro Account" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: "right" }}>
            <Space>
              <Button onClick={() => setCompleteModalOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="primary" htmlType="submit">
                {t("providers.oauth.createProvider")}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Token 预览对话框 */}
      <Modal
        title={t("providers.tokenPreview.title")}
        open={tokenPreviewModalOpen}
        onCancel={() => setTokenPreviewModalOpen(false)}
        width={800}
        footer={
          <Space>
            <Button onClick={() => setTokenPreviewModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="primary"
              onClick={handleImportSelectedTokens}
              disabled={selectedTokens.length === 0}
            >
              {t("providers.tokenPreview.import")} ({selectedTokens.length})
            </Button>
          </Space>
        }
      >
        <Alert
          message={t("providers.tokenPreview.description")}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Table
          rowSelection={{
            selectedRowKeys: selectedTokens,
            onChange: (selectedRowKeys) => setSelectedTokens(selectedRowKeys as number[]),
          }}
          columns={[
            {
              title: t("providers.tokenPreview.source"),
              dataIndex: "source",
              key: "source",
              render: (source: string) => <Tag color="blue">{source}</Tag>,
            },
            {
              title: t("providers.tokenPreview.fileName"),
              dataIndex: "fileName",
              key: "fileName",
            },
            {
              title: t("providers.tokenPreview.region"),
              dataIndex: ["data", "region"],
              key: "region",
              render: (region: string) => region || "us-east-1",
            },
            {
              title: t("providers.tokenPreview.status"),
              key: "status",
              render: (_: any, record: DetectedToken) => {
                if (!record.isExpired) {
                  return <Tag color="success">{t("providers.tokenPreview.statusValid")}</Tag>;
                }
                if (record.data.refreshToken) {
                  return <Tag color="warning">{t("providers.tokenPreview.statusExpiredRefreshable")}</Tag>;
                }
                return <Tag color="error">{t("providers.tokenPreview.statusExpired")}</Tag>;
              },
            },
            {
              title: t("providers.tokenPreview.clientCredentials"),
              key: "clientCredentials",
              render: (_: any, record: DetectedToken) => {
                const authMethod = record.data.authMethod || '';
                // social auth 不需要 client credentials
                if (authMethod === 'social') {
                  return <Tag color="default">{t("providers.tokenPreview.notRequired")}</Tag>;
                }
                // IdC/builder-id 需要 client credentials
                if (record.hasClientCredentials) {
                  return <Tag color="success">{t("providers.tokenPreview.clientCredentialsFound")}</Tag>;
                }
                return <Tag color="warning">{t("providers.tokenPreview.clientCredentialsMissing")}</Tag>;
              },
            },
            {
              title: t("providers.tokenPreview.hasRefreshToken"),
              dataIndex: ["data", "refreshToken"],
              key: "hasRefreshToken",
              render: (refreshToken: string) => (
                <Tag color={refreshToken ? "green" : "orange"}>
                  {refreshToken ? t("common.yes") : t("common.no")}
                </Tag>
              ),
            },
            {
              title: t("providers.tokenPreview.expiresAt"),
              dataIndex: ["data", "expiresAt"],
              key: "expiresAt",
              render: (expiresAt: string, record: DetectedToken) => {
                const expiry = expiresAt || record.data.expiration;
                if (!expiry) return "-";
                const date = new Date(expiry);
                const now = new Date();
                const isExpired = date < now;
                return (
                  <Text type={isExpired ? "danger" : "success"}>
                    {date.toLocaleString()}
                  </Text>
                );
              },
            },
          ]}
          dataSource={detectedTokens.map((token, index) => ({
            ...token,
            key: index,
          }))}
          pagination={false}
          size="small"
        />
      </Modal>

      {/* IdC 配置对话框 */}
      <Modal
        title={t("providers.oauth.identityCenterConfig")}
        open={idcModalOpen}
        onCancel={() => setIdcModalOpen(false)}
        footer={null}
        destroyOnHidden
      >
        {oauthLoading ? (
          <div style={{ textAlign: "center", padding: 40 }}>
            <Spin size="large" />
            <p style={{ marginTop: 16 }}>{t("providers.oauth.initializing")}</p>
          </div>
        ) : (
          <Form
            form={idcForm}
            layout="vertical"
            onFinish={handleStartIdC}
            initialValues={{ region: "us-east-1" }}
          >
            <Alert
              message={t("providers.oauth.identityCenterInfo")}
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Form.Item
              name="startUrl"
              label={t("providers.oauth.startUrl")}
              rules={[
                {
                  required: true,
                  message: t("providers.oauth.startUrlRequired"),
                },
                {
                  pattern: /^https:\/\/.+\/start/,
                  message: t("providers.oauth.startUrlInvalid"),
                },
              ]}
            >
              <Input placeholder={t("providers.oauth.startUrlPlaceholder")} />
            </Form.Item>
            <Form.Item
              name="region"
              label={t("providers.region")}
              rules={[{ required: true }]}
            >
              <Select>
                <Select.Option value="us-east-1">us-east-1</Select.Option>
                <Select.Option value="us-east-2">us-east-2</Select.Option>
                <Select.Option value="us-west-2">us-west-2</Select.Option>
                <Select.Option value="ap-south-1">ap-south-1</Select.Option>
                <Select.Option value="ap-northeast-1">ap-northeast-1</Select.Option>
                <Select.Option value="ap-northeast-2">ap-northeast-2</Select.Option>
                <Select.Option value="ap-southeast-1">ap-southeast-1</Select.Option>
                <Select.Option value="ap-southeast-2">ap-southeast-2</Select.Option>
                <Select.Option value="ca-central-1">ca-central-1</Select.Option>
                <Select.Option value="eu-central-1">eu-central-1</Select.Option>
                <Select.Option value="eu-west-1">eu-west-1</Select.Option>
                <Select.Option value="eu-west-2">eu-west-2</Select.Option>
                <Select.Option value="eu-west-3">eu-west-3</Select.Option>
                <Select.Option value="eu-north-1">eu-north-1</Select.Option>
                <Select.Option value="sa-east-1">sa-east-1</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item style={{ marginBottom: 0, textAlign: "right" }}>
              <Space>
                <Button onClick={() => setIdcModalOpen(false)}>
                  {t("common.cancel")}
                </Button>
                <Button type="primary" htmlType="submit">
                  {t("common.continue")}
                </Button>
              </Space>
            </Form.Item>
          </Form>
        )}
      </Modal>
    </div>
  );
}
