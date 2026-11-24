import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Card, Form, Input, Button, Typography, Tabs, message, Space } from 'antd'
import { UserOutlined, LockOutlined, MailOutlined, StockOutlined } from '@ant-design/icons'
import { authApi } from '@/services/api'
import { useAuthStore } from '@/store/authStore'

const { Title, Text } = Typography

export default function LoginPage() {
  const navigate = useNavigate()
  const { setTokens, setUser } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('login')

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

  async function handleRegister(values: {
    username: string; email: string; password: string; full_name?: string
  }) {
    setLoading(true)
    try {
      await authApi.register(values)
      message.success('Account created! Please log in.')
      setActiveTab('login')
    } catch (err: any) {
      message.error(err?.response?.data?.detail || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <Card style={{ width: 420, borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Space direction="vertical" size={4}>
            <StockOutlined style={{ fontSize: 48, color: '#4361ee' }} />
            <Title level={2} style={{ margin: 0, color: '#1a1a2e' }}>FO Tracker</Title>
            <Text type="secondary">Business Portfolio Management</Text>
          </Space>
        </div>

        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          centered
          items={[
            {
              key: 'login',
              label: 'Sign In',
              children: (
                <Form layout="vertical" onFinish={handleLogin} size="large">
                  <Form.Item name="username" rules={[{ required: true, message: 'Enter username' }]}>
                    <Input prefix={<UserOutlined />} placeholder="Username" />
                  </Form.Item>
                  <Form.Item name="password" rules={[{ required: true, message: 'Enter password' }]}>
                    <Input.Password prefix={<LockOutlined />} placeholder="Password" />
                  </Form.Item>
                  <Form.Item>
                    <Button type="primary" htmlType="submit" block loading={loading}
                      style={{ height: 44, fontSize: 15 }}>
                      Sign In
                    </Button>
                  </Form.Item>
                </Form>
              ),
            },
            {
              key: 'register',
              label: 'Register',
              children: (
                <Form layout="vertical" onFinish={handleRegister} size="large">
                  <Form.Item name="full_name">
                    <Input prefix={<UserOutlined />} placeholder="Full Name (optional)" />
                  </Form.Item>
                  <Form.Item name="username" rules={[{ required: true, message: 'Choose a username' }]}>
                    <Input prefix={<UserOutlined />} placeholder="Username" />
                  </Form.Item>
                  <Form.Item name="email" rules={[{ required: true, type: 'email', message: 'Valid email required' }]}>
                    <Input prefix={<MailOutlined />} placeholder="Email" />
                  </Form.Item>
                  <Form.Item name="password" rules={[{ required: true, min: 8, message: 'Min 8 characters' }]}>
                    <Input.Password prefix={<LockOutlined />} placeholder="Password (min 8 chars)" />
                  </Form.Item>
                  <Form.Item>
                    <Button type="primary" htmlType="submit" block loading={loading}
                      style={{ height: 44, fontSize: 15 }}>
                      Create Account
                    </Button>
                  </Form.Item>
                </Form>
              ),
            },
          ]}
        />
      </Card>
    </div>
  )
}
