'use client';

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
  InputNumber,
  Card,
  Typography,
  Alert,
  message,
  Popconfirm,
} from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";

const { Title, Text, Paragraph } = Typography;

// API Client Functions
const API_BASE = "/api";

const getAuthHeaders = () => {
  const token = localStorage.getItem("session_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const apiKeysApi = {
  getAll: async () => {
    const response = await fetch(`${API_BASE}/api-keys`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error("Failed to fetch API keys");
    }
    return response.json();
  },
  create: async (data: any) => {
    const response = await fetch(`${API_BASE}/api-keys`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error("Failed to create API key");
    }
    return response.json();
  },
  update: async (id: number, data: any) => {
    const response = await fetch(`${API_BASE}/api-keys/${id}`, {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error("Failed to update API key");
    }
    return response.json();
  },
  delete: async (id: number) => {
    const response = await fetch(`${API_BASE}/api-keys/${id}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error("Failed to delete API key");
    }
    return response.json();
  },
};

interface ApiKey {
  id: number;
  name: string;
  key_prefix: string;
  is_active: boolean;
  daily_limit: number;
  today_usage: number;
  total_usage: number;
  last_used_at: string;
}

interface NewKeyData {
  key?: string;
}

export default function ApiKeys() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [newKeyData, setNewKeyData] = useState<NewKeyData | null>(null);
  const { t } = useTranslation();
  const [form] = Form.useForm();

  useEffect(() => {
    loadApiKeys();
  }, []);

  const loadApiKeys = async () => {
    try {
      setLoading(true);
      const response = await apiKeysApi.getAll();
      if (response.success) {
        setApiKeys(response.apiKeys);
      }
    } catch (err: any) {
      setError(err.message || t("errors.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateKey = async (values: any) => {
    try {
      const response = await apiKeysApi.create(values);
      if (response.success) {
        setNewKeyData(response.apiKey);
        setModalOpen(false);
        form.resetFields();
        loadApiKeys();
      }
    } catch (err: any) {
      message.error(err.message || t("errors.saveFailed"));
    }
  };

  const handleDeleteKey = async (id: number) => {
    try {
      await apiKeysApi.delete(id);
      message.success(t("common.delete"));
      loadApiKeys();
    } catch (err: any) {
      message.error(err.message || t("errors.deleteFailed"));
    }
  };

  const handleToggleKey = async (apiKey: ApiKey) => {
    try {
      await apiKeysApi.update(apiKey.id, { isActive: !apiKey.is_active });
      loadApiKeys();
    } catch (err: any) {
      message.error(err.message || t("errors.saveFailed"));
    }
  };

  const columns = [
    {
      title: t("common.name"),
      dataIndex: "name",
      key: "name",
      render: (text: string) => text || "Unnamed",
    },
    {
      title: t("apiKeys.keyPrefix"),
      dataIndex: "key_prefix",
      key: "key_prefix",
      render: (text: string) => <Text code>{text}...</Text>,
    },
    {
      title: t("common.status"),
      key: "status",
      render: (_: any, record: ApiKey) => (
        <Tag color={record.is_active ? "success" : "warning"}>
          {record.is_active ? t("common.active") : t("common.inactive")}
        </Tag>
      ),
    },
    {
      title: t("apiKeys.dailyLimit"),
      dataIndex: "daily_limit",
      key: "daily_limit",
    },
    {
      title: t("apiKeys.todayUsage"),
      dataIndex: "today_usage",
      key: "today_usage",
      render: (text: number) => text || 0,
    },
    {
      title: t("apiKeys.totalUsage"),
      dataIndex: "total_usage",
      key: "total_usage",
      render: (text: number) => text || 0,
    },
    {
      title: t("apiKeys.lastUsed"),
      dataIndex: "last_used_at",
      key: "last_used_at",
      render: (text: string) =>
        text ? new Date(text).toLocaleString() : t("common.never"),
    },
    {
      title: t("common.actions"),
      key: "actions",
      render: (_: any, record: ApiKey) => {
        const isElectronKey = record.name === "Electron Auto Key";
        return (
          <Space size="small">
            <Button size="small" onClick={() => handleToggleKey(record)}>
              {record.is_active ? t("common.disable") : t("common.enable")}
            </Button>
            {!isElectronKey && (
              <Popconfirm
                title={t("apiKeys.deleteConfirm")}
                onConfirm={() => handleDeleteKey(record.id)}
                okText={t("common.confirm")}
                cancelText={t("common.cancel")}
              >
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            )}
          </Space>
        );
      },
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
          {t("apiKeys.title")}
        </Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setModalOpen(true)}
        >
          {t("apiKeys.createApiKey")}
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

      {newKeyData && newKeyData.key && (
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
          message={t("apiKeys.newKeyCreated")}
          description={
            <div>
              <Paragraph type="secondary">{t("apiKeys.copyWarning")}</Paragraph>
              <Space>
                <Text code copyable={{ text: newKeyData.key }}>
                  {newKeyData.key}
                </Text>
              </Space>
              <div style={{ marginTop: 12 }}>
                <Button size="small" onClick={() => setNewKeyData(null)}>
                  {t("apiKeys.dismiss")}
                </Button>
              </div>
            </div>
          }
        />
      )}

      <Card>
        <Table
          columns={columns}
          dataSource={apiKeys}
          rowKey="id"
          loading={loading}
          locale={{ emptyText: t("apiKeys.noApiKeys") }}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title={t("apiKeys.createApiKey")}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        destroyOnHidden
        forceRender
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreateKey}
          initialValues={{ dailyLimit: -1 }}
        >
          <Form.Item name="name" label={t("common.name")}>
            <Input placeholder={t("apiKeys.namePlaceholder")} />
          </Form.Item>
          <Form.Item name="dailyLimit" label={t("apiKeys.dailyLimit")}>
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: "right" }}>
            <Space>
              <Button onClick={() => setModalOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="primary" htmlType="submit">
                {t("common.create")}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
