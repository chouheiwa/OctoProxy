import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Row, Col, Card, Statistic, Spin, Alert, Typography } from 'antd';
import {
    CloudServerOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    KeyOutlined,
    UserOutlined,
    ApiOutlined
} from '@ant-design/icons';
import { statsApi } from '../api/client';

const { Title } = Typography;

export default function Dashboard() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const { t } = useTranslation();

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        try {
            const response = await statsApi.get();
            if (response.success) {
                setStats(response);
            }
        } catch (err) {
            setError(err.message || t('errors.loadFailed'));
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
                <Spin size="large" />
            </div>
        );
    }

    if (error) {
        return <Alert message={error} type="error" showIcon />;
    }

    return (
        <div>
            <Title level={4} style={{ marginBottom: 24 }}>{t('dashboard.title')}</Title>

            <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic
                            title={t('dashboard.availableProviders')}
                            value={stats?.pool?.available || 0}
                            prefix={<CloudServerOutlined />}
                            valueStyle={{ color: '#1668dc' }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic
                            title={t('dashboard.healthy')}
                            value={stats?.pool?.healthy || 0}
                            prefix={<CheckCircleOutlined />}
                            valueStyle={{ color: '#52c41a' }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic
                            title={t('dashboard.unhealthy')}
                            value={stats?.pool?.unhealthy || 0}
                            prefix={<CloseCircleOutlined />}
                            valueStyle={{ color: '#ff4d4f' }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic
                            title={t('dashboard.activeApiKeys')}
                            value={stats?.apiKeys?.active || 0}
                            prefix={<KeyOutlined />}
                            valueStyle={{ color: '#722ed1' }}
                        />
                    </Card>
                </Col>
            </Row>

            <Card title={t('dashboard.systemStatus')} style={{ marginTop: 24 }}>
                <Row gutter={[48, 16]}>
                    <Col xs={24} sm={8}>
                        <Statistic
                            title={t('dashboard.totalProviders')}
                            value={stats?.providers?.total || 0}
                            prefix={<ApiOutlined />}
                        />
                    </Col>
                    <Col xs={24} sm={8}>
                        <Statistic
                            title={t('dashboard.totalUsers')}
                            value={stats?.users?.total || 0}
                            prefix={<UserOutlined />}
                        />
                    </Col>
                    <Col xs={24} sm={8}>
                        <Statistic
                            title={t('dashboard.totalApiKeys')}
                            value={stats?.apiKeys?.total || 0}
                            prefix={<KeyOutlined />}
                        />
                    </Col>
                </Row>
            </Card>
        </div>
    );
}
