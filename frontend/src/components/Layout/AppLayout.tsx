import { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Avatar, Dropdown, Typography, Space, Tag, Button, Modal, Input, message, Drawer, Grid } from 'antd'
import {
  HomeOutlined,
  UnorderedListOutlined,
  FundOutlined,
  AimOutlined,
  LogoutOutlined,
  UserOutlined,
  StockOutlined,
  SafetyCertificateOutlined,
  LinkOutlined,
  CopyOutlined,
  MenuOutlined,
  TeamOutlined,
  BankOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '@/store/authStore'
import { authApi } from '@/services/api'
import MarketBot from '@/components/MarketBot/MarketBot'
import type { MenuProps } from 'antd'

const { Header, Sider, Content } = Layout
const { Text } = Typography
const { useBreakpoint } = Grid

const BASE_NAV_ITEMS = [
  { key: '/home',      icon: <HomeOutlined />,          label: 'Portfolio Home' },
  { key: '/tradebook', icon: <UnorderedListOutlined />, label: 'Trade Book' },
  { key: '/pnl',       icon: <FundOutlined />,          label: 'P & L Analytics' },
  { key: '/target',    icon: <AimOutlined />,           label: 'Targets' },
  { key: '/gsec',      icon: <BankOutlined />,          label: 'GSec Bonds' },
]

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const screens = useBreakpoint()
  const isDesktop = !!screens.lg

  const { user, logout } = useAuthStore()
  const NAV_ITEMS = user?.is_admin
    ? [...BASE_NAV_ITEMS, { key: '/users', icon: <TeamOutlined />, label: 'Users (Admin)' }]
    : BASE_NAV_ITEMS
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteUrl, setInviteUrl] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)

  async function generateInvite() {
    setInviteLoading(true)
    try {
      const { data } = await authApi.createInviteLink()
      const url = `${window.location.origin}/register?token=${data.invite_token}`
      setInviteUrl(url)
      setInviteOpen(true)
      setDrawerOpen(false)
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

  const userMenu: MenuProps['items'] = [
    ...(user?.is_admin ? [{
      key: 'invite',
      icon: <LinkOutlined />,
      label: 'Create 10-Min Invite Link',
      onClick: generateInvite,
    }] : []),
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Sign Out',
      danger: true,
      onClick: () => { logout(); navigate('/login') },
    },
  ]

  const sidebarContent = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        height: 72, display: 'flex', alignItems: 'center',
        padding: '0 20px', borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <Space size={10}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(6, 182, 212, 0.4)',
          }}>
            <StockOutlined style={{ color: '#fff', fontSize: 18 }} />
          </div>
          <div>
            <Text strong style={{ color: '#fff', fontSize: 15, display: 'block', lineHeight: 1.2 }}>
              FO Tracker
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, letterSpacing: '0.06em' }}>
              QUANT TERMINAL
            </Text>
          </div>
        </Space>
      </div>

      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[location.pathname]}
        items={NAV_ITEMS.map((i) => ({
          ...i,
          onClick: () => {
            navigate(i.key)
            setDrawerOpen(false)
          },
        }))}
        style={{ marginTop: 14, border: 'none', flex: 1 }}
      />

      <div style={{
        margin: 16,
        padding: '10px 12px', borderRadius: 10,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.07)',
      }}>
        <Space size={8}>
          <SafetyCertificateOutlined style={{ color: '#10b981', fontSize: 14 }} />
          <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11 }}>
            {user?.is_admin ? 'Admin • Hardened Session' : 'Secured Session'}
          </Text>
        </Space>
      </div>
    </div>
  )

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {isDesktop ? (
        <Sider
          width={235}
          style={{ position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 100 }}
        >
          {sidebarContent}
        </Sider>
      ) : (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          width={245}
          styles={{
            body: { padding: 0, background: 'linear-gradient(180deg, #050816 0%, #0b1120 60%, #111827 100%)' },
            header: { display: 'none' },
          }}
        >
          {sidebarContent}
        </Drawer>
      )}

      <Layout style={{ marginLeft: isDesktop ? 235 : 0, transition: 'margin-left 0.2s ease' }}>
        <Header style={{
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(8px)',
          padding: isDesktop ? '0 28px' : '0 14px',
          height: 60,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #e2e8f0',
          position: 'sticky',
          top: 0,
          zIndex: 99,
        }}>
          <Space size={10}>
            {!isDesktop && (
              <Button
                type="text"
                icon={<MenuOutlined style={{ fontSize: 18 }} />}
                onClick={() => setDrawerOpen(true)}
                aria-label="Open navigation menu"
              />
            )}
            {screens.sm && (
              <Tag color="geekblue" style={{ borderRadius: 6, fontWeight: 600, margin: 0 }}>
                NSE / BSE F&amp;O • GSec &amp; MF
              </Tag>
            )}
            {user?.is_admin && screens.md && (
              <Button
                size="small"
                type="primary"
                ghost
                icon={<LinkOutlined />}
                loading={inviteLoading}
                onClick={generateInvite}
              >
                Create 10-Min Invite Link
              </Button>
            )}
          </Space>

          <Dropdown menu={{ items: userMenu }} placement="bottomRight">
            <Space style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: 8 }}>
              <Avatar size={screens.sm ? 'default' : 'small'} icon={<UserOutlined />} style={{ background: '#4f46e5' }} />
              {screens.sm && (
                <div style={{ lineHeight: 1.2 }}>
                  <Text strong style={{ fontSize: 13, display: 'block' }}>
                    {user?.full_name || user?.username}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {user?.is_admin ? 'Admin' : 'Portfolio Owner'}
                  </Text>
                </div>
              )}
            </Space>
          </Dropdown>
        </Header>

        <Content style={{ margin: isDesktop ? 24 : 12, minHeight: 'calc(100vh - 96px)' }}>
          <Outlet />
        </Content>
      </Layout>

      <MarketBot />

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
    </Layout>
  )
}
