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
  UserOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  SyncOutlined,
  AppstoreOutlined,
  BarsOutlined,
} from "@ant-design/icons";
import { usageApi } from "../api/client";

const { Title, Text } = Typography;

export default function Usage() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshingProviders, setRefreshingProviders] = useState({});
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState("detailed"); // "detailed" or "compact"
  const { t } = useTranslation();

  useEffect(() => {
    loadUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadUsage = async () => {
    try {
      setLoading(true);
      const response = await usageApi.getAll();
      if (response.success) {
        setProviders(response.providers);
      }
    } catch (err) {
      setError(err.message || t("errors.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  const refreshAllUsage = async () => {
    setRefreshingAll(true);
    setError("");

    try {
      // 逐个刷新所有提供商
      const updatedProviders = [...providers];
      for (let i = 0; i < updatedProviders.length; i++) {
        const provider = updatedProviders[i];
        try {
          setRefreshingProviders((prev) => ({
            ...prev,
            [provider.providerId]: true,
          }));
          const response = await usageApi.refresh(provider.providerId);
          if (response.success) {
            updatedProviders[i] = {
              ...provider,
              usage: response.usage,
              lastSync: response.lastSync,
              cached: false,
              needsRefresh: false,
              error: null,
            };
            setProviders([...updatedProviders]);
          }
        } catch (err) {
          updatedProviders[i] = {
            ...provider,
            error: err.error || err.message,
          };
          setProviders([...updatedProviders]);
        } finally {
          setRefreshingProviders((prev) => ({
            ...prev,
            [provider.providerId]: false,
          }));
        }
      }
      message.success(t("usage.refreshSuccess"));
    } catch (err) {
      setError(err.message || t("errors.loadFailed"));
    } finally {
      setRefreshingAll(false);
    }
  };

  const refreshProviderUsage = async (providerId) => {
    setRefreshingProviders((prev) => ({ ...prev, [providerId]: true }));

    try {
      const response = await usageApi.refresh(providerId);
      if (response.success) {
        setProviders((prev) =>
          prev.map((p) =>
            p.providerId === providerId
              ? {
                  ...p,
                  usage: response.usage,
                  lastSync: response.lastSync,
                  cached: false,
                  needsRefresh: false,
                  error: null,
                }
              : p,
          ),
        );
        message.success(t("usage.providerRefreshSuccess"));
      }
    } catch (err) {
      setProviders((prev) =>
        prev.map((p) =>
          p.providerId === providerId
            ? { ...p, error: err.error || err.message }
            : p,
        ),
      );
      message.error(err.error || err.message || t("errors.loadFailed"));
    } finally {
      setRefreshingProviders((prev) => ({ ...prev, [providerId]: false }));
    }
  };

  const formatLastSync = (lastSync) => {
    if (!lastSync) return null;
    const date = new Date(lastSync);
    return date.toLocaleString();
  };

  // 计算总用量信息（用于紧凑模式）
  const calculateTotalUsage = (usage) => {
    if (!usage || !usage.usageBreakdown)
      return { used: 0, limit: 0, percent: 0 };

    let totalUsed = 0;
    let totalLimit = 0;

    for (const item of usage.usageBreakdown) {
      totalUsed += item.currentUsage || 0;
      totalLimit += item.usageLimit || 0;

      if (item.freeTrial) {
        totalUsed += item.freeTrial.currentUsage || 0;
        totalLimit += item.freeTrial.usageLimit || 0;
      }

      if (item.bonuses && item.bonuses.length > 0) {
        for (const bonus of item.bonuses) {
          totalUsed += bonus.currentUsage || 0;
          totalLimit += bonus.usageLimit || 0;
        }
      }
    }

    const percent =
      totalLimit > 0 ? Math.min(100, (totalUsed / totalLimit) * 100) : 0;
    return {
      used: Math.round(totalUsed * 100) / 100,
      limit: totalLimit,
      percent,
    };
  };

  const formatUsageBreakdown = (usage) => {
    if (!usage || !usage.usageBreakdown) return null;

    return usage.usageBreakdown.map((item, index) => {
      let totalUsed = item.currentUsage || 0;
      let totalLimit = item.usageLimit || 0;

      if (item.freeTrial) {
        totalUsed += item.freeTrial.currentUsage || 0;
        totalLimit += item.freeTrial.usageLimit || 0;
      }

      if (item.bonuses && item.bonuses.length > 0) {
        for (const bonus of item.bonuses) {
          totalUsed += bonus.currentUsage || 0;
          totalLimit += bonus.usageLimit || 0;
        }
      }

      const percent =
        totalLimit > 0 ? Math.min(100, (totalUsed / totalLimit) * 100) : 0;
      const isOverLimit = totalUsed >= totalLimit;

      return (
        <div key={index} style={{ marginBottom: 16 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 4,
            }}
          >
            <Text strong>{item.displayName || item.resourceType}</Text>
            <Text type={isOverLimit ? "danger" : "secondary"}>
              {Math.round(totalUsed * 100) / 100} / {totalLimit}
            </Text>
          </div>
          <Progress
            percent={percent}
            status={isOverLimit ? "exception" : "active"}
            showInfo={false}
            strokeColor={isOverLimit ? "#ff4d4f" : "#1668dc"}
          />
          <Space wrap style={{ marginTop: 8 }}>
            <Tag>
              {t("usage.base")}: {item.currentUsage || 0}/{item.usageLimit || 0}
            </Tag>
            {item.freeTrial && (
              <Tag color="green">
                {t("usage.freeTrial")}:{" "}
                {Math.round((item.freeTrial.currentUsage || 0) * 100) / 100}/
                {item.freeTrial.usageLimit || 0}
              </Tag>
            )}
            {item.bonuses &&
              item.bonuses.length > 0 &&
              item.bonuses.map((b, i) => (
                <Tag key={i} color="blue">
                  {t("usage.bonus")}: {b.currentUsage || 0}/{b.usageLimit || 0}
                </Tag>
              ))}
          </Space>
        </div>
      );
    });
  };

  const formatResetDate = (usage) => {
    if (!usage) return null;
    // 优先使用具体日期
    if (usage.nextDateReset) {
      return t("usage.resetsOn", {
        date: new Date(usage.nextDateReset).toLocaleDateString(),
      });
    }
    // 如果有天数且大于0才显示
    if (usage.daysUntilReset !== undefined && usage.daysUntilReset > 0) {
      return t("usage.resetsIn", { days: usage.daysUntilReset });
    }
    return null;
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

  // 紧凑模式视图 - 小卡片网格
  const renderCompactView = () => (
    <Row gutter={[12, 12]}>
      {providers.map((provider) => {
        const { used, limit, percent } = calculateTotalUsage(provider.usage);
        const isOverLimit = used >= limit;
        const hasError = !!provider.error;
        const noData = !provider.usage;

        return (
          <Col xs={24} sm={12} md={8} lg={6} xl={4} key={provider.providerId}>
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
                        spin={refreshingProviders[provider.providerId]}
                        style={{ fontSize: 12 }}
                      />
                    }
                    onClick={() => refreshProviderUsage(provider.providerId)}
                    loading={refreshingProviders[provider.providerId]}
                    disabled={refreshingAll}
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
                  {provider.cached && (
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
      {providers.map((provider) => (
        <Col xs={24} lg={12} key={provider.providerId}>
          <Card
            title={
              <Space>
                <span>{provider.name}</span>
                <Tag>{provider.region}</Tag>
              </Space>
            }
            extra={
              <Tooltip title={t("usage.refreshProvider")}>
                <Button
                  type="text"
                  icon={
                    <SyncOutlined
                      spin={refreshingProviders[provider.providerId]}
                    />
                  }
                  onClick={() => refreshProviderUsage(provider.providerId)}
                  loading={refreshingProviders[provider.providerId]}
                  disabled={refreshingAll}
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
            ) : provider.needsRefresh || !provider.usage ? (
              <div style={{ textAlign: "center", padding: 20 }}>
                <Text type="secondary">{t("usage.noData")}</Text>
                <br />
                <Button
                  type="primary"
                  icon={<SyncOutlined />}
                  onClick={() => refreshProviderUsage(provider.providerId)}
                  loading={refreshingProviders[provider.providerId]}
                  style={{ marginTop: 12 }}
                >
                  {t("usage.loadData")}
                </Button>
              </div>
            ) : (
              <>
                {provider.usage?.user?.email && (
                  <div style={{ marginBottom: 16 }}>
                    <Space>
                      <UserOutlined />
                      <Text>{provider.usage.user.email}</Text>
                    </Space>
                  </div>
                )}

                {provider.usage?.subscription && (
                  <div style={{ marginBottom: 16 }}>
                    <Tag
                      color={
                        provider.usage.subscription.type?.includes("FREE")
                          ? "default"
                          : "blue"
                      }
                    >
                      {provider.usage.subscription.title ||
                        provider.usage.subscription.type}
                    </Tag>
                  </div>
                )}

                <div style={{ marginBottom: 16 }}>
                  {formatUsageBreakdown(provider.usage)}
                </div>

                {formatResetDate(provider.usage) && (
                  <div
                    style={{
                      borderTop: "1px solid #303030",
                      paddingTop: 12,
                    }}
                  >
                    <Text type="secondary">
                      <ClockCircleOutlined style={{ marginRight: 4 }} />
                      {formatResetDate(provider.usage)}
                    </Text>
                  </div>
                )}

                {provider.lastSync && (
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {t("usage.lastSync")}: {formatLastSync(provider.lastSync)}
                      {provider.cached && (
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
      ))}
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
            onChange={setViewMode}
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
