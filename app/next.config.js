const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../'),
  // 生产模式优化
  productionBrowserSourceMaps: false,
  // 禁用 x-powered-by header
  poweredByHeader: false,
  // 启用 instrumentation hook（服务器启动时初始化数据库）
  experimental: {
    instrumentationHook: true,
  },
}

module.exports = nextConfig
