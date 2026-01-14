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
  Select,
  Switch,
  Card,
  Typography,
  Alert,
  message,
  Popconfirm,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  UserOutlined,
} from "@ant-design/icons";

const { Title } = Typography;

// API Client Functions
const API_BASE = "/api";

const getAuthHeaders = () => {
  const token = localStorage.getItem("session_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const usersApi = {
  getAll: async () => {
    const response = await fetch(`${API_BASE}/users`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error("Failed to fetch users");
    }
    return response.json();
  },
  create: async (data: any) => {
    const response = await fetch(`${API_BASE}/users`, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error("Failed to create user");
    }
    return response.json();
  },
  update: async (id: number, data: any) => {
    const response = await fetch(`${API_BASE}/users/${id}`, {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error("Failed to update user");
    }
    return response.json();
  },
  delete: async (id: number) => {
    const response = await fetch(`${API_BASE}/users/${id}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      throw new Error("Failed to delete user");
    }
    return response.json();
  },
};

interface User {
  id: number;
  username: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const { t } = useTranslation();
  const [form] = Form.useForm();

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await usersApi.getAll();
      if (response.success) {
        setUsers(response.users);
      }
    } catch (err: any) {
      setError(err.message || t("errors.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveUser = async (values: any) => {
    try {
      const data = { ...values };
      if (editingUser && !data.password) {
        delete data.password;
      }

      if (editingUser) {
        await usersApi.update(editingUser.id, data);
      } else {
        await usersApi.create(data);
      }

      setModalOpen(false);
      setEditingUser(null);
      form.resetFields();
      message.success(t("common.save"));
      loadUsers();
    } catch (err: any) {
      message.error(err.message || t("errors.saveFailed"));
    }
  };

  const handleDeleteUser = async (id: number) => {
    try {
      await usersApi.delete(id);
      message.success(t("common.delete"));
      loadUsers();
    } catch (err: any) {
      message.error(err.message || t("errors.deleteFailed"));
    }
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    form.setFieldsValue({
      username: user.username,
      password: "",
      role: user.role,
      isActive: user.is_active,
    });
    setModalOpen(true);
  };

  const openAddModal = () => {
    setEditingUser(null);
    form.resetFields();
    form.setFieldsValue({
      role: "user",
      isActive: true,
    });
    setModalOpen(true);
  };

  const columns = [
    {
      title: t("users.username"),
      dataIndex: "username",
      key: "username",
      render: (text: string) => (
        <Space>
          <UserOutlined />
          {text}
        </Space>
      ),
    },
    {
      title: t("users.role"),
      dataIndex: "role",
      key: "role",
      render: (role: string) => (
        <Tag color={role === "admin" ? "blue" : "default"}>
          {role === "admin" ? t("users.roleAdmin") : t("users.roleUser")}
        </Tag>
      ),
    },
    {
      title: t("common.status"),
      key: "status",
      render: (_: any, record: User) => (
        <Tag color={record.is_active ? "success" : "warning"}>
          {record.is_active ? t("common.active") : t("common.inactive")}
        </Tag>
      ),
    },
    {
      title: t("users.created"),
      dataIndex: "created_at",
      key: "created_at",
      render: (text: string) => new Date(text).toLocaleString(),
    },
    {
      title: t("common.actions"),
      key: "actions",
      render: (_: any, record: User) => (
        <Space size="small">
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEditModal(record)}
          />
          <Popconfirm
            title={t("users.deleteConfirm")}
            onConfirm={() => handleDeleteUser(record.id)}
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
          {t("users.title")}
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>
          {t("users.addUser")}
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

      <Card>
        <Table
          columns={columns}
          dataSource={users}
          rowKey="id"
          loading={loading}
          locale={{ emptyText: t("users.noUsers") }}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title={editingUser ? t("users.editUser") : t("users.addUser")}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        destroyOnHidden
        forceRender
      >
        <Form form={form} layout="vertical" onFinish={handleSaveUser}>
          <Form.Item
            name="username"
            label={t("users.username")}
            rules={[{ required: true, message: t("users.usernameRequired") }]}
          >
            <Input disabled={!!editingUser} />
          </Form.Item>
          <Form.Item
            name="password"
            label={t("users.password")}
            extra={editingUser && t("users.passwordHint")}
            rules={
              editingUser
                ? []
                : [{ required: true, message: t("users.passwordRequired") }]
            }
          >
            <Input.Password />
          </Form.Item>
          <Form.Item name="role" label={t("users.role")}>
            <Select>
              <Select.Option value="user">{t("users.roleUser")}</Select.Option>
              <Select.Option value="admin">
                {t("users.roleAdmin")}
              </Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="isActive"
            label={t("common.status")}
            valuePropName="checked"
          >
            <Switch
              checkedChildren={t("common.active")}
              unCheckedChildren={t("common.inactive")}
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: "right" }}>
            <Space>
              <Button onClick={() => setModalOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="primary" htmlType="submit">
                {t("common.save")}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
