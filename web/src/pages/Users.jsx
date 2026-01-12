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
import { usersApi } from "../api/client";

const { Title } = Typography;

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const { t } = useTranslation();
  const [form] = Form.useForm();

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await usersApi.getAll();
      if (response.success) {
        setUsers(response.users);
      }
    } catch (err) {
      setError(err.message || t("errors.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveUser = async (values) => {
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
    } catch (err) {
      message.error(err.message || t("errors.saveFailed"));
    }
  };

  const handleDeleteUser = async (id) => {
    try {
      await usersApi.delete(id);
      message.success(t("common.delete"));
      loadUsers();
    } catch (err) {
      message.error(err.message || t("errors.deleteFailed"));
    }
  };

  const openEditModal = (user) => {
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
      render: (text) => (
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
      render: (role) => (
        <Tag color={role === "admin" ? "blue" : "default"}>
          {role === "admin" ? t("users.roleAdmin") : t("users.roleUser")}
        </Tag>
      ),
    },
    {
      title: t("common.status"),
      key: "status",
      render: (_, record) => (
        <Tag color={record.is_active ? "success" : "warning"}>
          {record.is_active ? t("common.active") : t("common.inactive")}
        </Tag>
      ),
    },
    {
      title: t("users.created"),
      dataIndex: "created_at",
      key: "created_at",
      render: (text) => new Date(text).toLocaleString(),
    },
    {
      title: t("common.actions"),
      key: "actions",
      render: (_, record) => (
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
        destroyOnClose
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
