import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card, Form, Input, Button, Typography, message, Space, Alert, Spin, Tag } from 'antd'
import { UserOutlined, LockOutlined, MailOutlined, StockOutlined, ClockCircleOutlined } from '@ant-design/icons'
import { authApi } from '@/services/api'

const { Title, Text } = Typography

export default function RegisterPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') || ''

  const [checking, setChecking] = useState(true)
  const [valid, setValid] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState<number>(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!token) {
      setChecking(false)
      setValid(false)
      return
    }
    authApi.validateInvite(token)
      .then(({ data }) => {
        setValid(true)
        const nowSec = Math.floor(Date.now() / 1000)
        setSecondsLeft(Math.max(0, (data.exp || nowSec) - nowSec))
      })
      .catch(() => setValid(false))
      .finally(() => setChecking(false))
  }, [token])

  useEffect(() => {
    if (!valid || secondsLeft <= 0) return
    const timer = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          setValid(false)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [valid, secondsLeft])

  async function handleRegister(values: {
    username: string; email: string; password: string; full_name?: string
  }) {
    setLoading(true)
    try {
      await authApi.register({ ...values, invite_token: token })
      message.success('Account created! Please sign in.')
      navigate('/login')
    } catch (err: any) {
      message.error(err?.response?.data?.detail || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const mins = Math.floor(secondsLeft / 60)
  const secs = secondsLeft % 60

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #050816 0%, #1e1b4b 55%, #0f172a 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <Card style={{ width: 430, borderRadius: 18, boxShadow: '0 24px 64px rgba(0,0,0,0.45)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Space direction="vertical" size={6}>
            <StockOutlined style={{ fontSize: 40, color: '#4f46e5' }} />
            <Title level={3} style={{ margin: 0 }}>Invited Registration</Title>
            {valid && (
              <Tag icon={<ClockCircleOutlined />} color="processing">
                Link expires in {mins}:{secs.toString().padStart(2, '0')}
              </Tag>
            )}
          </Space>
        </div>

        <Spin spinning={checking}>
          {!checking && !valid ? (
            <Space direction="vertical" style={{ width: '100%' }} size={16}>
              <Alert
                type="error"
                showIcon
                message="Invalid or Expired Invite Link"
                description="This registration link is missing, already used, or has passed its 10-minute validity window. Request a new link from an Admin."
              />
              <Button type="primary" block onClick={() => navigate('/login')}>
                Back to Sign In
              </Button>
            </Space>
          ) : (
            <Form layout="vertical" onFinish={handleRegister} size="large">
              <Form.Item name="full_name">
                <Input prefix={<UserOutlined />} placeholder="Full Name (optional)" />
              </Form.Item>
              <Form.Item name="username" rules={[{ required: true, min: 3, message: 'Min 3 characters' }]}>
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
                  style={{ height: 44, fontSize: 15, fontWeight: 600 }}>
                  Create Account
                </Button>
              </Form.Item>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', textAlign: 'center' }}>
                Single-use invite link • Valid for 10 minutes
              </Text>
            </Form>
          )}
        </Spin>
      </Card>
    </div>
  )
}
