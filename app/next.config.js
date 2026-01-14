const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../'),
  // 生产模式优化
  productionBrowserSourceMaps: false,
  // 禁用 x-powered-by header
  poweredByHeader: false,
}

module.exports = nextConfig
