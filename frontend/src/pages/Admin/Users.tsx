import { useState, useEffect } from 'react'
import { Card, Table, Tag, Switch, Typography, Space, Button, Modal, Input, message, Spin } from 'antd'
import { TeamOutlined, LinkOutlined, CopyOutlined, ReloadOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { authApi } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import type { User } from '@/types'

const { Title, Text } = Typography

export default function UsersPage() {
  const currentUser = useAuthStore((s) => s.user)
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteUrl, setInviteUrl] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)

  async function fetchUsers() {
    setLoading(true)
    try {
      const { data } = await authApi.listUsers()
      setUsers(data)
    } catch (err: any) {
      message.error(err?.response?.data?.detail || 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  async function toggleStatus(user: User, checked: boolean) {
    try {
      await authApi.toggleUserStatus(user.id, checked)
      message.success(`${user.username} is now ${checked ? 'Active' : 'Inactive'}`)
      fetchUsers()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || 'Failed to update status')
    }
  }

  async function generateInvite() {
    setInviteLoading(true)
    try {
      const { data } = await authApi.createInviteLink()
      setInviteUrl(`${window.location.origin}/register?token=${data.invite_token}`)
      setInviteOpen(true)
    } catch (err: any) {
      message.error(err?.response?.data?.detail || 'Failed to generate invite link')
    } finally {
      setInviteLoading(false)
    }
  }

  function copyInvite() {
    navigator.clipboard.writeText(inviteUrl)
    message.success('10-minute invite link copied to clipboard!')
  }

  const columns = [
    {
      title: 'ID', dataIndex: 'id', key: 'id', width: 70,
      sorter: (a: User, b: User) => a.id - b.id,
    },
    {
      title: 'Username', dataIndex: 'username', key: 'username',
      sorter: (a: User, b: User) => a.username.localeCompare(b.username),
      render: (v: string) => <Text strong>{v}</Text>,
    },
    {
      title: 'Full Name', dataIndex: 'full_name', key: 'full_name',
      sorter: (a: User, b: User) => (a.full_name || '').localeCompare(b.full_name || ''),
      render: (v: string) => v || '—',
    },
    {
      title: 'Email', dataIndex: 'email', key: 'email',
      sorter: (a: User, b: User) => a.email.localeCompare(b.email),
    },
    {
      title: 'Role', dataIndex: 'is_admin', key: 'role',
      sorter: (a: User, b: User) => Number(!!a.is_admin) - Number(!!b.is_admin),
      render: (v: boolean) => (
        <Tag color={v ? 'purple' : 'blue'} icon={v ? <SafetyCertificateOutlined /> : undefined}>
          {v ? 'ADMIN' : 'USER'}
        </Tag>
      ),
    },
    {
      title: 'Status', dataIndex: 'is_active', key: 'status',
      sorter: (a: User, b: User) => Number(a.is_active) - Number(b.is_active),
      render: (v: boolean, row: User) => (
        <Space>
          <Switch
            checked={v}
            disabled={row.id === currentUser?.id}
            onChange={(checked) => toggleStatus(row, checked)}
            size="small"
          />
          <Tag color={v ? 'success' : 'error'}>{v ? 'ACTIVE' : 'INACTIVE'}</Tag>
        </Space>
      ),
    },
    {
      title: 'Created', dataIndex: 'created_at', key: 'created_at',
      sorter: (a: User, b: User) => a.created_at.localeCompare(b.created_at),
      render: (v: string) => new Date(v).toLocaleString('en-IN'),
    },
  ]

  return (
    <Spin spinning={loading}>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 20 }} wrap>
        <Space>
          <TeamOutlined style={{ fontSize: 24, color: '#4f46e5' }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>User Management</Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Admin-only view of all registered accounts &amp; 10-minute invite link generator
            </Text>
          </div>
        </Space>
        <Space wrap>
          <Button icon={<ReloadOutlined />} onClick={fetchUsers}>Refresh</Button>
          <Button type="primary" icon={<LinkOutlined />} loading={inviteLoading} onClick={generateInvite}>
            Create 10-Min Invite Link
          </Button>
        </Space>
      </Space>

      <Card className="enterprise-card">
        <Table
          dataSource={users}
          columns={columns}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 15 }}
          scroll={{ x: 760 }}
        />
      </Card>

      <Modal
        title="🔐 Admin Registration Invite (Valid 10 Minutes)"
        open={inviteOpen}
        onCancel={() => setInviteOpen(false)}
        footer={[
          <Button key="copy" type="primary" icon={<CopyOutlined />} onClick={copyInvite}>
            Copy Invite Link
          </Button>,
        ]}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Text type="secondary">
            Share this single-use link with the new user. It expires automatically in 10 minutes.
          </Text>
          <Input.TextArea value={inviteUrl} rows={3} readOnly />
        </Space>
      </Modal>
    </Spin>
  )
}
