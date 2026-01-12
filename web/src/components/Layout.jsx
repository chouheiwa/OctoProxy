import { useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Layout as AntLayout,
  Menu,
  Avatar,
  Dropdown,
  Space,
  Button,
  Typography,
} from "antd";
import {
  DashboardOutlined,
  CloudServerOutlined,
  KeyOutlined,
  UserOutlined,
  BarChartOutlined,
  LogoutOutlined,
  GlobalOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  BookOutlined,
} from "@ant-design/icons";
import { useAuth } from "../context/AuthContext";

const { Header, Sider, Content } = AntLayout;
const { Text } = Typography;

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const toggleLanguage = () => {
    const newLang = i18n.language === "zh" ? "en" : "zh";
    i18n.changeLanguage(newLang);
  };

  const menuItems = [
    {
      key: "/",
      icon: <DashboardOutlined />,
      label: t("nav.dashboard"),
    },
    {
      key: "/providers",
      icon: <CloudServerOutlined />,
      label: t("nav.providers"),
      visible: user?.role === "admin",
    },
    {
      key: "/api-keys",
      icon: <KeyOutlined />,
      label: t("nav.apiKeys"),
    },
    {
      key: "/users",
      icon: <UserOutlined />,
      label: t("nav.users"),
      visible: user?.role === "admin",
    },
    {
      key: "/usage",
      icon: <BarChartOutlined />,
      label: t("nav.usage"),
      visible: user?.role === "admin",
    },
    {
      key: "/settings",
      icon: <SettingOutlined />,
      label: t("nav.settings"),
      visible: user?.role === "admin",
    },
    {
      key: "/integration",
      icon: <BookOutlined />,
      label: t("nav.integration"),
    },
  ].filter((item) => item.visible !== false);

  const userMenuItems = [
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: t("common.logout"),
      onClick: handleLogout,
    },
  ];

  return (
    <AntLayout style={{ minHeight: "100vh" }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        theme="dark"
        style={{
          overflow: "auto",
          height: "100vh",
          position: "fixed",
          left: 0,
          top: 0,
          bottom: 0,
        }}
      >
        <div
          style={{
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderBottom: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <Text strong style={{ color: "#fff", fontSize: collapsed ? 14 : 18 }}>
            {collapsed ? "OP" : "OctoProxy"}
          </Text>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0 }}
        />
      </Sider>
      <AntLayout
        style={{
          marginLeft: collapsed ? 80 : 200,
          transition: "margin-left 0.2s",
        }}
      >
        <Header
          style={{
            padding: "0 24px",
            background: "#141414",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid #303030",
            position: "sticky",
            top: 0,
            zIndex: 1,
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{ fontSize: 16, color: "#fff" }}
          />
          <Space size="middle">
            <Button
              type="text"
              icon={<GlobalOutlined />}
              onClick={toggleLanguage}
              style={{ color: "#fff" }}
            >
              {i18n.language === "zh" ? "EN" : "中文"}
            </Button>
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <Space style={{ cursor: "pointer", color: "#fff" }}>
                <Avatar size="small" icon={<UserOutlined />} />
                <span>{user?.username}</span>
              </Space>
            </Dropdown>
          </Space>
        </Header>
        <Content
          style={{
            margin: 24,
            minHeight: 280,
          }}
        >
          <Outlet />
        </Content>
      </AntLayout>
    </AntLayout>
  );
}
