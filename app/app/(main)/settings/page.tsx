'use client';

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Card,
  Form,
  Select,
  InputNumber,
  Button,
  Typography,
  Alert,
  Spin,
  Divider,
  message,
  Descriptions,
  Switch,
  Input,
  Space,
} from "antd";
import {
  SettingOutlined,
  SaveOutlined,
  ReloadOutlined,
  DownloadOutlined,
  RocketOutlined,
} from "@ant-design/icons";

const { Title, Text } = Typography;

// API Client Functions
const API_BASE = "/api";

const getAuthHeaders = () => {
  const token = localStorage.getItem("session_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const settingsApi = {
  getConfig: async () => {
    const response = await fetch(`${API_BASE}/config`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error("Failed to fetch config");
    }
    return response.json();
  },
  updateConfig: async (data: any) => {
    const response = await fetch(`${API_BASE}/config`, {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error("Failed to update config");
    }
    return response.json();
  },
};

// 检测是否在 Electron 环境中
const isElectron = () => {
  return typeof window !== 'undefined' && (window as any).electronAPI !== undefined;
};

interface Config {
  providerStrategy?: string;
  usageSyncIntervalMinutes?: number;
  healthCheckIntervalMinutes?: number;
  maxErrorCount?: number;
  requestMaxRetries?: number;
  port?: number;
  host?: string;
  sessionExpireHours?: number;
  dbPath?: string;
  systemPrompt?: string;
}

interface UpdateStatus {
  type: string;
  version?: string;
  error?: string;
}

export default function Settings() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { t } = useTranslation();
  const [form] = Form.useForm();

  // Electron 相关状态
  const [appVersion, setAppVersion] = useState("");
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [autoLaunchLoading, setAutoLaunchLoading] = useState(false);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    loadConfig();
    if (isElectron()) {
      loadElectronSettings();
    }
  }, []);

  // 当 config 加载完成且不在 loading 状态时，设置表单值
  useEffect(() => {
    if (config && !loading) {
      form.setFieldsValue({
        providerStrategy: config.providerStrategy || "lru",
        usageSyncIntervalMinutes: config.usageSyncIntervalMinutes || 10,
        healthCheckIntervalMinutes: config.healthCheckIntervalMinutes || 10,
        maxErrorCount: config.maxErrorCount || 3,
        requestMaxRetries: config.requestMaxRetries || 3,
        systemPrompt: config.systemPrompt || "",
      });
    }
  }, [config, loading, form]);

  const loadConfig = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await settingsApi.getConfig();
      if (response.success) {
        setConfig(response.config);
      }
    } catch (err: any) {
      setError(err.message || t("errors.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  const loadElectronSettings = async () => {
    try {
      // 获取应用版本
      const version = await (window as any).electronAPI.getAppVersion();
      setAppVersion(version);

      // 获取开机自启状态
      const autoLaunchEnabled = await (window as any).electronAPI.getAutoLaunch();
      setAutoLaunch(autoLaunchEnabled);
    } catch (err) {
      console.error("Failed to load Electron settings:", err);
    }
  };

  const handleSave = async (values: any) => {
    try {
      setSaving(true);
      const response = await settingsApi.updateConfig(values);
      if (response.success) {
        setConfig(response.config);
        message.success(t("common.save"));
      }
    } catch (err: any) {
      message.error(err.message || t("errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleAutoLaunchChange = async (checked: boolean) => {
    try {
      setAutoLaunchLoading(true);
      const result = await (window as any).electronAPI.setAutoLaunch(checked);
      if (result.success) {
        setAutoLaunch(result.enabled);
        message.success(
          checked
            ? t("settings.autoLaunchEnabled")
            : t("settings.autoLaunchDisabled"),
        );
      } else {
        message.error(result.error || t("errors.operationFailed"));
      }
    } catch (err: any) {
      message.error(err.message || t("errors.operationFailed"));
    } finally {
      setAutoLaunchLoading(false);
    }
  };

  const handleCheckUpdate = async () => {
    try {
      setUpdateChecking(true);
      setUpdateStatus(null);
      const result = await (window as any).electronAPI.checkForUpdates();
      if (result.success) {
        if (result.updateAvailable) {
          setUpdateStatus({
            type: "available",
            version: result.version,
          });
          message.info(
            t("settings.updateAvailable", { version: result.version }),
          );
        } else {
          setUpdateStatus({
            type: "upToDate",
          });
          message.success(t("settings.upToDate"));
        }
      } else {
        setUpdateStatus({
          type: "error",
          error: result.error,
        });
        message.error(result.error || t("errors.checkUpdateFailed"));
      }
    } catch (err: any) {
      setUpdateStatus({
        type: "error",
        error: err.message,
      });
      message.error(err.message || t("errors.checkUpdateFailed"));
    } finally {
      setUpdateChecking(false);
    }
  };

  const strategyOptions = [
    {
      value: "lru",
      label: t("settings.strategies.lru"),
      description: t("settings.strategies.lruDesc"),
    },
    {
      value: "round_robin",
      label: t("settings.strategies.roundRobin"),
      description: t("settings.strategies.roundRobinDesc"),
    },
    {
      value: "least_usage",
      label: t("settings.strategies.leastUsage"),
      description: t("settings.strategies.leastUsageDesc"),
    },
    {
      value: "most_usage",
      label: t("settings.strategies.mostUsage"),
      description: t("settings.strategies.mostUsageDesc"),
    },
    {
      value: "oldest_first",
      label: t("settings.strategies.oldestFirst"),
      description: t("settings.strategies.oldestFirstDesc"),
    },
  ];

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: 400,
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

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
          <SettingOutlined style={{ marginRight: 8 }} />
          {t("settings.title")}
        </Title>
        <Button icon={<ReloadOutlined />} onClick={loadConfig}>
          {t("common.refresh")}
        </Button>
      </div>

      {error && (
        <Alert
          message={error}
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Electron 设置 */}
      {isElectron() && (
        <Card style={{ marginBottom: 16 }}>
          <Divider titlePlacement="left">
            <RocketOutlined style={{ marginRight: 8 }} />
            {t("settings.appSettings")}
          </Divider>

          <div style={{ marginBottom: 24 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <div>
                <Text strong>{t("settings.appVersion")}</Text>
                <br />
                <Text type="secondary">v{appVersion}</Text>
              </div>
              <Button
                icon={<DownloadOutlined />}
                onClick={handleCheckUpdate}
                loading={updateChecking}
              >
                {t("settings.checkUpdate")}
              </Button>
            </div>

            {updateStatus && (
              <Alert
                type={
                  updateStatus.type === "available"
                    ? "info"
                    : updateStatus.type === "error"
                      ? "error"
                      : "success"
                }
                message={
                  updateStatus.type === "available"
                    ? t("settings.updateAvailableMsg", {
                        version: updateStatus.version,
                      })
                    : updateStatus.type === "error"
                      ? updateStatus.error
                      : t("settings.upToDateMsg")
                }
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <Text strong>{t("settings.autoLaunch")}</Text>
              <br />
              <Text type="secondary">{t("settings.autoLaunchDesc")}</Text>
            </div>
            <Switch
              checked={autoLaunch}
              onChange={handleAutoLaunchChange}
              loading={autoLaunchLoading}
            />
          </div>
        </Card>
      )}

      <Card>
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Divider titlePlacement="left">{t("settings.providerStrategy")}</Divider>

          <Form.Item
            name="providerStrategy"
            label={t("settings.selectStrategy")}
            extra={
              <div style={{ marginTop: 8 }}>
                {strategyOptions.map((opt) => (
                  <div key={opt.value} style={{ marginBottom: 4 }}>
                    <Text strong>{opt.label}</Text>:{" "}
                    <Text type="secondary">{opt.description}</Text>
                  </div>
                ))}
              </div>
            }
          >
            <Select style={{ maxWidth: 400 }}>
              {strategyOptions.map((opt) => (
                <Select.Option key={opt.value} value={opt.value}>
                  {opt.label}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Divider titlePlacement="left">{t("settings.syncSettings")}</Divider>

          <Form.Item
            name="usageSyncIntervalMinutes"
            label={t("settings.usageSyncInterval")}
            extra={t("settings.usageSyncIntervalDesc")}
          >
            <Space.Compact>
              <InputNumber min={1} max={60} style={{ width: 150 }} />
              <Button disabled>{t("settings.minutes")}</Button>
            </Space.Compact>
          </Form.Item>

          <Form.Item
            name="healthCheckIntervalMinutes"
            label={t("settings.healthCheckInterval")}
            extra={t("settings.healthCheckIntervalDesc")}
          >
            <Space.Compact>
              <InputNumber min={1} max={60} style={{ width: 150 }} />
              <Button disabled>{t("settings.minutes")}</Button>
            </Space.Compact>
          </Form.Item>

          <Divider titlePlacement="left">{t("settings.errorHandling")}</Divider>

          <Form.Item
            name="maxErrorCount"
            label={t("settings.maxErrorCount")}
            extra={t("settings.maxErrorCountDesc")}
          >
            <InputNumber min={1} max={10} style={{ width: 200 }} />
          </Form.Item>

          <Form.Item
            name="requestMaxRetries"
            label={t("settings.requestMaxRetries")}
            extra={t("settings.requestMaxRetriesDesc")}
          >
            <InputNumber min={1} max={10} style={{ width: 200 }} />
          </Form.Item>

          <Divider titlePlacement="left">{t("settings.apiSettings")}</Divider>

          <Form.Item
            name="systemPrompt"
            label={t("settings.systemPrompt")}
            extra={t("settings.systemPromptDesc")}
          >
            <Input.TextArea
              rows={4}
              placeholder={t("settings.systemPromptPlaceholder")}
              style={{ maxWidth: 600 }}
            />
          </Form.Item>

          <Form.Item style={{ marginTop: 24 }}>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SaveOutlined />}
              loading={saving}
            >
              {t("common.save")}
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {config && (
        <Card title={t("settings.currentConfig")} style={{ marginTop: 16 }}>
          <Descriptions column={2} size="small">
            <Descriptions.Item label={t("settings.port")}>
              {config.port}
            </Descriptions.Item>
            <Descriptions.Item label={t("settings.host")}>
              {config.host}
            </Descriptions.Item>
            <Descriptions.Item label={t("settings.sessionExpireHours")}>
              {config.sessionExpireHours} {t("settings.hours")}
            </Descriptions.Item>
            <Descriptions.Item label={t("settings.dbPath")}>
              {config.dbPath}
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}
    </div>
  );
}
