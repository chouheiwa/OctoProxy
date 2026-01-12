import axios from "axios";

const API_BASE = "/api";

const client = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
  },
});

// 请求拦截器 - 添加 token
client.interceptors.request.use((config) => {
  const token = localStorage.getItem("session_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器 - 处理错误
client.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("session_token");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error.response?.data || error);
  },
);

// 认证 API
export const authApi = {
  login: (username, password) => client.post("/login", { username, password }),
  logout: () => client.post("/logout"),
  me: () => client.get("/me"),
};

// 用户 API
export const usersApi = {
  getAll: () => client.get("/users"),
  get: (id) => client.get(`/users/${id}`),
  create: (data) => client.post("/users", data),
  update: (id, data) => client.put(`/users/${id}`, data),
  delete: (id) => client.delete(`/users/${id}`),
};

// API Keys API
export const apiKeysApi = {
  getAll: () => client.get("/api-keys"),
  get: (id) => client.get(`/api-keys/${id}`),
  create: (data) => client.post("/api-keys", data),
  update: (id, data) => client.put(`/api-keys/${id}`, data),
  delete: (id) => client.delete(`/api-keys/${id}`),
};

// 提供商 API
export const providersApi = {
  getAll: () => client.get("/providers"),
  get: (id) => client.get(`/providers/${id}`),
  create: (data) => client.post("/providers", data),
  update: (id, data) => client.put(`/providers/${id}`, data),
  delete: (id) => client.delete(`/providers/${id}`),
  healthCheck: (id) => client.post(`/providers/${id}/health-check`),
  export: () => client.get("/providers/export"),
  import: (data) => client.post("/providers/import", data),
};

// OAuth API
export const oauthApi = {
  startSocial: (provider, region) =>
    client.post("/oauth/social", { provider, region }),
  startBuilderID: (region) => client.post("/oauth/builder-id", { region }),
  getStatus: (sessionId) => client.get(`/oauth/session/${sessionId}`),
  complete: (data) => client.post("/oauth/complete", data),
  cancel: (sessionId) => client.delete(`/oauth/session/${sessionId}`),
};

// 统计和配置 API
export const statsApi = {
  get: () => client.get("/stats"),
};

export const configApi = {
  get: () => client.get("/config"),
  update: (data) => client.put("/config", data),
};

// 设置 API
export const settingsApi = {
  getConfig: () => client.get("/config"),
  updateConfig: (data) => client.put("/config", data),
};

// 用量查询 API
export const usageApi = {
  getAll: () => client.get("/usage"),
  get: (providerId) => client.get(`/usage/${providerId}`),
  refresh: (providerId) => client.post(`/usage/${providerId}`),
};

// Electron Key API (仅 Electron 环境可用)
export const electronKeyApi = {
  get: () => client.get("/electron-key"),
  regenerate: () => client.post("/electron-key/regenerate"),
};

export default client;
