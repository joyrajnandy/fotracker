import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Form, Input, Button, Typography, message, Space, Alert } from 'antd'
import { UserOutlined, LockOutlined, StockOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { authApi } from '@/services/api'
import { useAuthStore } from '@/store/authStore'

const { Title, Text } = Typography

export default function LoginPage() {
  const navigate = useNavigate()
  const { setTokens, setUser } = useAuthStore()
  const [loading, setLoading] = useState(false)

  async function handleLogin(values: { username: string; password: string }) {
    setLoading(true)
    try {
      const { data } = await authApi.login(values)
      setTokens(data.access_token, data.refresh_token)
      const { data: user } = await authApi.me()
      setUser(user)
      message.success('Welcome back!')
      navigate('/home')
    } catch (err: any) {
      message.error(err?.response?.data?.detail || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #050816 0%, #1e1b4b 55%, #0f172a 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <Card style={{
        width: 420, borderRadius: 18,
        boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
        border: '1px solid rgba(99,102,241,0.3)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <Space direction="vertical" size={6}>
            <div style={{
              width: 56, height: 56, borderRadius: 14, margin: '0 auto',
              background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(79,70,229,0.4)',
            }}>
              <StockOutlined style={{ fontSize: 28, color: '#fff' }} />
            </div>
            <Title level={2} style={{ margin: 0, color: '#0f172a' }}>FO Tracker</Title>
            <Text type="secondary">Enterprise Quant Portfolio Terminal</Text>
          </Space>
        </div>

        <Form layout="vertical" onFinish={handleLogin} size="large">
          <Form.Item name="username" rules={[{ required: true, message: 'Enter username' }]}>
            <Input prefix={<UserOutlined />} placeholder="Username" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: 'Enter password' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="Password" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}
              style={{ height: 44, fontSize: 15, fontWeight: 600 }}>
              Sign In
            </Button>
          </Form.Item>
        </Form>

        <Alert
          type="info"
          showIcon
          icon={<SafetyCertificateOutlined />}
          message="Invite-Only Access"
          description="Public registration is disabled. Contact an Admin for a 10-minute registration link."
          style={{ borderRadius: 10 }}
        />
      </Card>
    </div>
  )
}
