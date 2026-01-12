import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ConfigProvider, Spin, theme } from "antd";
import zhCN from "antd/locale/zh_CN";
import enUS from "antd/locale/en_US";
import { useTranslation } from "react-i18next";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Providers from "./pages/Providers";
import ApiKeys from "./pages/ApiKeys";
import Users from "./pages/Users";
import Usage from "./pages/Usage";
import Settings from "./pages/Settings";
import Integration from "./pages/Integration";
import "./index.css";

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  return user ? children : <Navigate to="/login" />;
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (user.role !== "admin") {
    return <Navigate to="/" />;
  }

  return children;
}

function AppContent() {
  const { i18n } = useTranslation();
  const locale = i18n.language === "zh" ? zhCN : enUS;

  return (
    <ConfigProvider
      locale={locale}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: "#1668dc",
          borderRadius: 6,
        },
      }}
    >
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route
              path="providers"
              element={
                <AdminRoute>
                  <Providers />
                </AdminRoute>
              }
            />
            <Route path="api-keys" element={<ApiKeys />} />
            <Route
              path="users"
              element={
                <AdminRoute>
                  <Users />
                </AdminRoute>
              }
            />
            <Route
              path="usage"
              element={
                <AdminRoute>
                  <Usage />
                </AdminRoute>
              }
            />
            <Route
              path="settings"
              element={
                <AdminRoute>
                  <Settings />
                </AdminRoute>
              }
            />
            <Route path="integration" element={<Integration />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
