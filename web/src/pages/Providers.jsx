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
  Divider,
  message,
  Popconfirm,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  GoogleOutlined,
  GithubOutlined,
  CloudOutlined,
  LinkOutlined,
} from "@ant-design/icons";
import { providersApi, oauthApi } from "../api/client";

const { Title, Text } = Typography;
const { TextArea } = Input;

export default function Providers() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { t } = useTranslation();

  // Modal states
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [oauthModalOpen, setOauthModalOpen] = useState(false);
  const [progressModalOpen, setProgressModalOpen] = useState(false);
  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState(null);

  // Form
  const [form] = Form.useForm();
  const [completeForm] = Form.useForm();

  // OAuth states
  const [oauthSessionId, setOauthSessionId] = useState(null);
  const [oauthStatus, setOauthStatus] = useState("");
  const [oauthUserCode, setOauthUserCode] = useState("");
  const [oauthAuthUrl, setOauthAuthUrl] = useState("");
  const [oauthLoading, setOauthLoading] = useState(false);

  useEffect(() => {
    loadProviders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let interval;
    if (oauthSessionId && progressModalOpen) {
      interval = setInterval(pollOAuthStatus, 3000);
    }
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oauthSessionId, progressModalOpen]);

  const loadProviders = async () => {
    try {
      setLoading(true);
      const response = await providersApi.getAll();
      if (response.success) {
        setProviders(response.providers);
      }
    } catch (err) {
      setError(err.message || t("errors.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  const pollOAuthStatus = async () => {
    if (!oauthSessionId) return;
    try {
      const response = await oauthApi.getStatus(oauthSessionId);
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

  const handleStartSocialAuth = async (provider) => {
    setOauthLoading(true);
    try {
      const response = await oauthApi.startSocial(provider, "us-east-1");
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
    } catch (err) {
      message.error(err.message || t("errors.authFailed", { error: "" }));
    } finally {
      setOauthLoading(false);
    }
  };

  const handleStartBuilderID = async () => {
    setOauthLoading(true);
    try {
      const response = await oauthApi.startBuilderID("us-east-1");
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
    } catch (err) {
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
        await oauthApi.cancel(oauthSessionId);
      } catch (err) {
        console.error("Error cancelling OAuth:", err);
      }
    }
    setOauthSessionId(null);
    setProgressModalOpen(false);
  };

  const handleCompleteOAuth = async (values) => {
    try {
      const response = await oauthApi.complete({
        sessionId: oauthSessionId,
        name: values.name,
        checkHealth: true,
      });
      if (response.success) {
        setCompleteModalOpen(false);
        setOauthSessionId(null);
        completeForm.resetFields();
        message.success(t("common.save"));
        loadProviders();
      } else {
        message.error(response.error || t("errors.saveFailed"));
      }
    } catch (err) {
      message.error(err.message || t("errors.saveFailed"));
    }
  };

  const handleSaveProvider = async (values) => {
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

      const data = {
        name: values.name,
        region: values.region,
        checkHealth: values.checkHealth,
        ...(credentials && { credentials }),
      };

      if (editingProvider) {
        await providersApi.update(editingProvider.id, data);
      } else {
        await providersApi.create(data);
      }

      setManualModalOpen(false);
      setEditingProvider(null);
      form.resetFields();
      message.success(t("common.save"));
      loadProviders();
    } catch (err) {
      message.error(err.message || t("errors.saveFailed"));
    }
  };

  const handleDeleteProvider = async (id) => {
    try {
      await providersApi.delete(id);
      message.success(t("common.delete") + " " + t("common.success"));
      loadProviders();
    } catch (err) {
      message.error(err.message || t("errors.deleteFailed"));
    }
  };

  const handleHealthCheck = async (id) => {
    try {
      const response = await providersApi.healthCheck(id);
      if (response.success) {
        message.info(
          response.healthy
            ? t("providers.healthCheckSuccess")
            : t("providers.healthCheckFailed"),
        );
        loadProviders();
      }
    } catch (err) {
      message.error(err.message || t("errors.loadFailed"));
    }
  };

  const handleToggleProvider = async (provider) => {
    try {
      await providersApi.update(provider.id, {
        isDisabled: !provider.is_disabled,
      });
      loadProviders();
    } catch (err) {
      message.error(err.message || t("errors.saveFailed"));
    }
  };

  const openEditModal = (provider) => {
    setEditingProvider(provider);
    form.setFieldsValue({
      name: provider.name || "",
      region: provider.region || "us-east-1",
      credentials: "",
      checkHealth: provider.check_health,
    });
    setManualModalOpen(true);
  };

  const openAddModal = () => {
    setEditingProvider(null);
    form.resetFields();
    form.setFieldsValue({
      region: "us-east-1",
      checkHealth: true,
    });
    setManualModalOpen(true);
  };

  const columns = [
    {
      title: t("common.name"),
      dataIndex: "name",
      key: "name",
      render: (text, record) => text || `Provider #${record.id}`,
    },
    {
      title: t("providers.accountEmail"),
      dataIndex: "account_email",
      key: "account_email",
      render: (text) => text || <Text type="secondary">-</Text>,
    },
    {
      title: t("providers.region"),
      dataIndex: "region",
      key: "region",
    },
    {
      title: t("common.status"),
      key: "status",
      render: (_, record) => (
        <Tag color={record.is_healthy ? "success" : "error"}>
          {record.is_healthy ? t("common.healthy") : t("common.unhealthy")}
        </Tag>
      ),
    },
    {
      title: t("common.enabled"),
      key: "enabled",
      render: (_, record) => (
        <Tag color={record.is_disabled ? "warning" : "success"}>
          {record.is_disabled ? t("common.disabled") : t("common.enabled")}
        </Tag>
      ),
    },
    {
      title: t("providers.usage"),
      dataIndex: "usage_count",
      key: "usage_count",
      render: (text) => text || 0,
    },
    {
      title: t("providers.lastUsed"),
      dataIndex: "last_used",
      key: "last_used",
      render: (text) =>
        text ? new Date(text).toLocaleString() : t("common.never"),
    },
    {
      title: t("common.actions"),
      key: "actions",
      render: (_, record) => (
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
        destroyOnClose
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
              <Card hoverable onClick={handleStartBuilderID}>
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
    </div>
  );
}
