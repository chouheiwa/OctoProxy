import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Form, Input, Button, Card, Typography, Alert, Space } from 'antd';
import { UserOutlined, LockOutlined, GlobalOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';

const { Title, Text } = Typography;

export default function Login() {
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();

    const toggleLanguage = () => {
        const newLang = i18n.language === 'zh' ? 'en' : 'zh';
        i18n.changeLanguage(newLang);
    };

    const handleSubmit = async (values) => {
        setError('');
        setLoading(true);

        try {
            await login(values.username, values.password);
            navigate('/');
        } catch (err) {
            setError(err.message || t('login.failed'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        }}>
            <Card
                style={{
                    width: 400,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                }}
                styles={{ body: { padding: 40 } }}
            >
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <Title level={2} style={{ marginBottom: 8 }}>
                        {t('login.title')}
                    </Title>
                    <Text type="secondary">{t('login.subtitle')}</Text>
                </div>

                {error && (
                    <Alert
                        message={error}
                        type="error"
                        showIcon
                        style={{ marginBottom: 24 }}
                    />
                )}

                <Form
                    name="login"
                    onFinish={handleSubmit}
                    autoComplete="off"
                    layout="vertical"
                    size="large"
                >
                    <Form.Item
                        name="username"
                        rules={[{ required: true, message: t('login.username') }]}
                    >
                        <Input
                            prefix={<UserOutlined />}
                            placeholder={t('login.username')}
                        />
                    </Form.Item>

                    <Form.Item
                        name="password"
                        rules={[{ required: true, message: t('login.password') }]}
                    >
                        <Input.Password
                            prefix={<LockOutlined />}
                            placeholder={t('login.password')}
                        />
                    </Form.Item>

                    <Form.Item style={{ marginBottom: 16 }}>
                        <Button
                            type="primary"
                            htmlType="submit"
                            loading={loading}
                            block
                        >
                            {t('login.signIn')}
                        </Button>
                    </Form.Item>
                </Form>

                <div style={{ textAlign: 'center' }}>
                    <Button
                        type="text"
                        icon={<GlobalOutlined />}
                        onClick={toggleLanguage}
                    >
                        {i18n.language === 'zh' ? 'English' : '中文'}
                    </Button>
                </div>
            </Card>
        </div>
    );
}
