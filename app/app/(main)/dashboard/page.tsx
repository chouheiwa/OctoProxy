'use client'

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Row, Col, Card, Statistic, Spin, Alert, Typography } from "antd";
import {
  CloudServerOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  KeyOutlined,
  UserOutlined,
  ApiOutlined,
} from "@ant-design/icons";

const { Title } = Typography;

interface PoolStats {
  available: number;
  healthy: number;
  unhealthy: number;
}

interface ApiKeyStats {
  active: number;
  total: number;
}

interface ProviderStats {
  total: number;
}

interface UserStats {
  total: number;
}

interface Stats {
  success: boolean;
  pool: PoolStats;
  apiKeys: ApiKeyStats;
  providers: ProviderStats;
  users: UserStats;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { t } = useTranslation();

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const res = await fetch('/api/stats');
      const response: Stats = await res.json();
      if (!res.ok) {
        throw new Error((response as any).error || 'Failed to load stats');
      }
      if (response.success) {
        setStats(response);
      }
    } catch (err: any) {
      setError(err.message || t("errors.loadFailed"));
    } finally {
      setLoading(false);
    }
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

  if (error) {
    return <Alert title={error} type="error" showIcon />;
  }

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>
        {t("dashboard.title")}
      </Title>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title={t("dashboard.availableProviders")}
              value={stats?.pool?.available || 0}
              prefix={<CloudServerOutlined />}
              styles={{ content: { color: "#1668dc" } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title={t("dashboard.healthy")}
              value={stats?.pool?.healthy || 0}
              prefix={<CheckCircleOutlined />}
              styles={{ content: { color: "#52c41a" } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title={t("dashboard.unhealthy")}
              value={stats?.pool?.unhealthy || 0}
              prefix={<CloseCircleOutlined />}
              styles={{ content: { color: "#ff4d4f" } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title={t("dashboard.activeApiKeys")}
              value={stats?.apiKeys?.active || 0}
              prefix={<KeyOutlined />}
              styles={{ content: { color: "#722ed1" } }}
            />
          </Card>
        </Col>
      </Row>

      <Card title={t("dashboard.systemStatus")} style={{ marginTop: 24 }}>
        <Row gutter={[48, 16]}>
          <Col xs={24} sm={8}>
            <Statistic
              title={t("dashboard.totalProviders")}
              value={stats?.providers?.total || 0}
              prefix={<ApiOutlined />}
            />
          </Col>
          <Col xs={24} sm={8}>
            <Statistic
              title={t("dashboard.totalUsers")}
              value={stats?.users?.total || 0}
              prefix={<UserOutlined />}
            />
          </Col>
          <Col xs={24} sm={8}>
            <Statistic
              title={t("dashboard.totalApiKeys")}
              value={stats?.apiKeys?.total || 0}
              prefix={<KeyOutlined />}
            />
          </Col>
        </Row>
      </Card>
    </div>
  );
}
