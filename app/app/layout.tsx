import type { Metadata } from 'next'
import { AntdRegistry } from '@ant-design/nextjs-registry'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import I18nProvider from '@/components/I18nProvider'
import './globals.css'

export const metadata: Metadata = {
  title: 'OctoProxy',
  description: '多账户 API 代理服务',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh">
      <body>
        <I18nProvider>
          <AntdRegistry>
            <ConfigProvider
              locale={zhCN}
              theme={{
                algorithm: require('antd').theme.darkAlgorithm,
                token: {
                  colorPrimary: '#1668dc',
                  borderRadius: 6,
                },
              }}
            >
              {children}
            </ConfigProvider>
          </AntdRegistry>
        </I18nProvider>
      </body>
    </html>
  )
}
