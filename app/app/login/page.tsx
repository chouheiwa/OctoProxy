'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { Form, Input, Button, Card, Typography, Alert, Spin } from 'antd'
import { UserOutlined, LockOutlined, GlobalOutlined } from '@ant-design/icons'

const { Title, Text } = Typography

export default function LoginPage() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [mounted, setMounted] = useState(false)
  const router = useRouter()
  const { t, i18n } = useTranslation()

  // 等待客户端挂载，避免 hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  // 检测是否在 Electron 环境
  const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI

  const toggleLanguage = () => {
    const newLang = i18n.language === 'zh' ? 'en' : 'zh'
    i18n.changeLanguage(newLang)
  }

  const handleSubmit = async (values: { username: string; password: string }) => {
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || t('login.failed'))
      }

      // 登录成功，跳转到首页
      router.push('/dashboard')
      router.refresh()
    } catch (err: any) {
      setError(err.message || t('login.failed'))
    } finally {
      setLoading(false)
    }
  }

  // 在客户端挂载前显示加载状态，避免 hydration mismatch
  if (!mounted) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        }}
      >
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
      }}
    >
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
          <Alert message={error} type="error" showIcon style={{ marginBottom: 24 }} />
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
              placeholder={
                isElectron ? t('login.defaultUsername') : t('login.username')
              }
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: t('login.password') }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder={
                isElectron ? t('login.defaultPassword') : t('login.password')
              }
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 16 }}>
            <Button type="primary" htmlType="submit" loading={loading} block>
              {t('login.signIn')}
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center' }}>
          <Button type="text" icon={<GlobalOutlined />} onClick={toggleLanguage}>
            {i18n.language === 'zh' ? 'English' : '中文'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
