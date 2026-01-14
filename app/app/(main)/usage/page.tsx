'use client'

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Card,
  Row,
  Col,
  Typography,
  Alert,
  Button,
  Spin,
  Progress,
  Tag,
  Space,
  Tooltip,
  message,
  Segmented,
} from "antd";
import {
  ReloadOutlined,
  ExclamationCircleOutlined,
  SyncOutlined,
  AppstoreOutlined,
  BarsOutlined,
} from "@ant-design/icons";

const { Title, Text } = Typography;

interface UsageData {
  used: number;
  limit: number;
  percent: number;
}

interface SubscriptionInfo {
  title: string;
  type: string;
  upgradeCapability?: string;
  overageCapability?: string;
}

interface Provider {
  id: number;
  name: string;
  account_email?: string;
  subscription?: SubscriptionInfo | null;
  usage: UsageData | null;
  exhausted: boolean;
  lastSync: string | null;
  fromCache: boolean;
  error?: string;
}

export default function UsagePage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshingProviders, setRefreshingProviders] = useState<Record<number, boolean>>({});
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<"detailed" | "compact">("detailed");
  const { t } = useTranslation();

  useEffect(() => {
    loadUsage();
  }, []);

  const loadUsage = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/usage');
      const response = await res.json();
      if (!res.ok) {
        throw new Error(response.error || 'Failed to load usage');
      }
      if (response.success) {
        setProviders(response.usage || []);
      }
    } catch (err: any) {
      setError(err.message || t("errors.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  const refreshAllUsage = async () => {
    setRefreshingAll(true);
    setError("");

    try {
      const updatedProviders = [...providers];
      for (let i = 0; i < updatedProviders.length; i++) {
        const provider = updatedProviders[i];
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
            updatedProviders[i] = {
              ...provider,
              account_email: response.account_email || provider.account_email,
              subscription: response.subscription || provider.subscription,
              usage: response.usage,
              lastSync: response.lastSync,
              fromCache: false,
              exhausted: response.exhausted || false,
              error: undefined,
            };
            setProviders([...updatedProviders]);
          }
        } catch (err: any) {
          updatedProviders[i] = {
            ...provider,
            error: err.error || err.message,
          };
          setProviders([...updatedProviders]);
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
        setProviders((prev) =>
          prev.map((p) =>
            p.id === providerId
              ? {
                  ...p,
                  account_email: response.account_email || p.account_email,
                  subscription: response.subscription || p.subscription,
                  usage: response.usage,
                  lastSync: response.lastSync,
                  fromCache: false,
                  exhausted: response.exhausted || false,
                  error: undefined,
                }
              : p,
          ),
        );
        message.success(t("usage.providerRefreshSuccess"));
      }
    } catch (err: any) {
      setProviders((prev) =>
        prev.map((p) =>
          p.id === providerId
            ? { ...p, error: err.error || err.message }
            : p,
        ),
      );
      message.error(err.error || err.message || t("errors.loadFailed"));
    } finally {
      setRefreshingProviders((prev) => ({ ...prev, [providerId]: false }));
    }
  };

  const formatLastSync = (lastSync?: string | null) => {
    if (!lastSync) return null;
    const date = new Date(lastSync);
    return date.toLocaleString();
  };

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

  // 紧凑模式视图
  const renderCompactView = () => (
    <Row gutter={[12, 12]}>
      {providers.map((provider) => {
        const usage = provider.usage;
        const used = usage?.used || 0;
        const limit = usage?.limit || 0;
        const percent = usage?.percent || 0;
        const isOverLimit = provider.exhausted;
        const hasError = !!provider.error;
        const noData = !usage;

        return (
          <Col xs={24} sm={12} md={8} lg={6} xl={4} key={provider.id}>
            <Card
              size="small"
              style={{ height: "100%" }}
              styles={{ body: { padding: 12 } }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 8,
                }}
              >
                <Text
                  strong
                  style={{
                    fontSize: 13,
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {provider.name}
                </Text>
                <Tooltip title={t("usage.refreshProvider")}>
                  <Button
                    type="text"
                    size="small"
                    style={{ padding: 0, height: 20, width: 20 }}
                    icon={
                      <SyncOutlined
                        spin={refreshingProviders[provider.id]}
                        style={{ fontSize: 12 }}
                      />
                    }
                    onClick={() => refreshProviderUsage(provider.id)}
                    disabled={refreshingAll || refreshingProviders[provider.id]}
                  />
                </Tooltip>
              </div>

              {hasError ? (
                <Tag color="error" style={{ fontSize: 11 }}>
                  {t("common.unhealthy")}
                </Tag>
              ) : noData ? (
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {t("usage.noData")}
                </Text>
              ) : (
                <>
                  <Progress
                    percent={percent}
                    size="small"
                    status={isOverLimit ? "exception" : "active"}
                    showInfo={false}
                    strokeColor={isOverLimit ? "#ff4d4f" : "#1668dc"}
                    style={{ marginBottom: 4 }}
                  />
                  <Text
                    type={isOverLimit ? "danger" : "secondary"}
                    style={{ fontSize: 11 }}
                  >
                    {used} / {limit}
                  </Text>
                  {provider.fromCache && (
                    <Tag color="orange" style={{ fontSize: 10, marginLeft: 4 }}>
                      {t("usage.cached")}
                    </Tag>
                  )}
                </>
              )}
            </Card>
          </Col>
        );
      })}
    </Row>
  );

  // 详细模式视图
  const renderDetailedView = () => (
    <Row gutter={[16, 16]}>
      {providers.map((provider) => {
        const usage = provider.usage;
        const used = usage?.used || 0;
        const limit = usage?.limit || 0;
        const percent = usage?.percent || 0;
        const isOverLimit = provider.exhausted;

        return (
          <Col xs={24} lg={12} key={provider.id}>
            <Card
              title={
                <Space>
                  <span>{provider.name}</span>
                  {provider.account_email && (
                    <Text type="secondary" style={{ fontSize: 13, fontWeight: 'normal' }}>
                      ({provider.account_email})
                    </Text>
                  )}
                </Space>
              }
              extra={
                <Tooltip title={t("usage.refreshProvider")}>
                  <Button
                    type="text"
                    icon={
                      <SyncOutlined
                        spin={refreshingProviders[provider.id]}
                      />
                    }
                    onClick={() => refreshProviderUsage(provider.id)}
                    disabled={refreshingAll || refreshingProviders[provider.id]}
                  />
                </Tooltip>
              }
              style={{ height: "100%" }}
            >
              {provider.error ? (
                <Alert
                  type="error"
                  showIcon
                  icon={<ExclamationCircleOutlined />}
                  message={provider.error}
                />
              ) : !usage ? (
                <div style={{ textAlign: "center", padding: 20 }}>
                  <Text type="secondary">{t("usage.noData")}</Text>
                  <br />
                  <Button
                    type="primary"
                    icon={<SyncOutlined />}
                    onClick={() => refreshProviderUsage(provider.id)}
                    loading={refreshingProviders[provider.id]}
                    style={{ marginTop: 12 }}
                  >
                    {t("usage.loadData")}
                  </Button>
                </div>
              ) : (
                <>
                  {/* 订阅类型 */}
                  {provider.subscription?.title && (
                    <div style={{ marginBottom: 16 }}>
                      <Tag color="blue">{provider.subscription.title}</Tag>
                    </div>
                  )}

                  <div style={{ marginBottom: 16 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 4,
                      }}
                    >
                      <Text strong>{t("usage.base")}</Text>
                      <Text type={isOverLimit ? "danger" : "secondary"}>
                        {used} / {limit}
                      </Text>
                    </div>
                    <Progress
                      percent={percent}
                      status={isOverLimit ? "exception" : "active"}
                      showInfo={false}
                      strokeColor={isOverLimit ? "#ff4d4f" : "#1668dc"}
                    />
                  </div>

                  {provider.lastSync && (
                    <div style={{ marginTop: 8 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {t("usage.lastSync")}: {formatLastSync(provider.lastSync)}
                        {provider.fromCache && (
                          <Tag style={{ marginLeft: 8 }} color="orange">
                            {t("usage.cached")}
                          </Tag>
                        )}
                      </Text>
                    </div>
                  )}
                </>
              )}
            </Card>
          </Col>
        );
      })}
    </Row>
  );

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
          {t("usage.title")}
        </Title>
        <Space>
          <Segmented
            value={viewMode}
            onChange={(value) => setViewMode(value as "detailed" | "compact")}
            options={[
              {
                value: "detailed",
                icon: <AppstoreOutlined />,
                label: t("usage.viewDetailed"),
              },
              {
                value: "compact",
                icon: <BarsOutlined />,
                label: t("usage.viewCompact"),
              },
            ]}
          />
          <Button
            icon={<ReloadOutlined spin={refreshingAll} />}
            onClick={refreshAllUsage}
            loading={refreshingAll}
          >
            {t("usage.refreshAll")}
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

      {providers.length === 0 ? (
        <Card>
          <div style={{ textAlign: "center", padding: 40 }}>
            <Text type="secondary">{t("usage.noProviders")}</Text>
          </div>
        </Card>
      ) : viewMode === "compact" ? (
        renderCompactView()
      ) : (
        renderDetailedView()
      )}
    </div>
  );
}
