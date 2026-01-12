import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
    Popconfirm
} from 'antd';
import {
    PlusOutlined,
    DeleteOutlined,
    CopyOutlined
} from '@ant-design/icons';
import { apiKeysApi } from '../api/client';

const { Title, Text, Paragraph } = Typography;

export default function ApiKeys() {
    const [apiKeys, setApiKeys] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [newKeyData, setNewKeyData] = useState(null);
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
        } catch (err) {
            setError(err.message || t('errors.loadFailed'));
        } finally {
            setLoading(false);
        }
    };

    const handleCreateKey = async (values) => {
        try {
            const response = await apiKeysApi.create(values);
            if (response.success) {
                setNewKeyData(response.apiKey);
                setModalOpen(false);
                form.resetFields();
                loadApiKeys();
            }
        } catch (err) {
            message.error(err.message || t('errors.saveFailed'));
        }
    };

    const handleDeleteKey = async (id) => {
        try {
            await apiKeysApi.delete(id);
            message.success(t('common.delete'));
            loadApiKeys();
        } catch (err) {
            message.error(err.message || t('errors.deleteFailed'));
        }
    };

    const handleToggleKey = async (apiKey) => {
        try {
            await apiKeysApi.update(apiKey.id, { isActive: !apiKey.is_active });
            loadApiKeys();
        } catch (err) {
            message.error(err.message || t('errors.saveFailed'));
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        message.success(t('common.copied'));
    };

    const columns = [
        {
            title: t('common.name'),
            dataIndex: 'name',
            key: 'name',
            render: (text) => text || 'Unnamed',
        },
        {
            title: t('apiKeys.keyPrefix'),
            dataIndex: 'key_prefix',
            key: 'key_prefix',
            render: (text) => <Text code>{text}...</Text>,
        },
        {
            title: t('common.status'),
            key: 'status',
            render: (_, record) => (
                <Tag color={record.is_active ? 'success' : 'warning'}>
                    {record.is_active ? t('common.active') : t('common.inactive')}
                </Tag>
            ),
        },
        {
            title: t('apiKeys.dailyLimit'),
            dataIndex: 'daily_limit',
            key: 'daily_limit',
        },
        {
            title: t('apiKeys.todayUsage'),
            dataIndex: 'today_usage',
            key: 'today_usage',
            render: (text) => text || 0,
        },
        {
            title: t('apiKeys.totalUsage'),
            dataIndex: 'total_usage',
            key: 'total_usage',
            render: (text) => text || 0,
        },
        {
            title: t('apiKeys.lastUsed'),
            dataIndex: 'last_used_at',
            key: 'last_used_at',
            render: (text) => text ? new Date(text).toLocaleString() : t('common.never'),
        },
        {
            title: t('common.actions'),
            key: 'actions',
            render: (_, record) => (
                <Space size="small">
                    <Button size="small" onClick={() => handleToggleKey(record)}>
                        {record.is_active ? t('common.disable') : t('common.enable')}
                    </Button>
                    <Popconfirm
                        title={t('apiKeys.deleteConfirm')}
                        onConfirm={() => handleDeleteKey(record.id)}
                        okText={t('common.confirm')}
                        cancelText={t('common.cancel')}
                    >
                        <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Title level={4} style={{ margin: 0 }}>{t('apiKeys.title')}</Title>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
                    {t('apiKeys.createApiKey')}
                </Button>
            </div>

            {error && <Alert message={error} type="error" showIcon style={{ marginBottom: 16 }} />}

            {newKeyData && newKeyData.key && (
                <Alert
                    type="success"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message={t('apiKeys.newKeyCreated')}
                    description={
                        <div>
                            <Paragraph type="secondary">{t('apiKeys.copyWarning')}</Paragraph>
                            <Space>
                                <Text code copyable={{ text: newKeyData.key }}>{newKeyData.key}</Text>
                            </Space>
                            <div style={{ marginTop: 12 }}>
                                <Button size="small" onClick={() => setNewKeyData(null)}>
                                    {t('apiKeys.dismiss')}
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
                    locale={{ emptyText: t('apiKeys.noApiKeys') }}
                    pagination={{ pageSize: 10 }}
                />
            </Card>

            <Modal
                title={t('apiKeys.createApiKey')}
                open={modalOpen}
                onCancel={() => setModalOpen(false)}
                footer={null}
                destroyOnClose
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleCreateKey}
                    initialValues={{ dailyLimit: -1 }}
                >
                    <Form.Item name="name" label={t('common.name')}>
                        <Input placeholder={t('apiKeys.namePlaceholder')} />
                    </Form.Item>
                    <Form.Item name="dailyLimit" label={t('apiKeys.dailyLimit')}>
                        <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                        <Space>
                            <Button onClick={() => setModalOpen(false)}>{t('common.cancel')}</Button>
                            <Button type="primary" htmlType="submit">{t('common.create')}</Button>
                        </Space>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
}
