import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Avatar, Dropdown, Typography, Space, Tag } from 'antd'
import {
  HomeOutlined,
  UnorderedListOutlined,
  FundOutlined,
  AimOutlined,
  LogoutOutlined,
  UserOutlined,
  StockOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '@/store/authStore'
import type { MenuProps } from 'antd'

const { Header, Sider, Content } = Layout
const { Text } = Typography

const NAV_ITEMS = [
  { key: '/home',      icon: <HomeOutlined />,          label: 'Portfolio Home' },
  { key: '/tradebook', icon: <UnorderedListOutlined />, label: 'Trade Book' },
  { key: '/pnl',       icon: <FundOutlined />,          label: 'P & L Analytics' },
  { key: '/target',    icon: <AimOutlined />,           label: 'Targets' },
]

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuthStore()

  const userMenu: MenuProps['items'] = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Sign Out',
      danger: true,
      onClick: () => { logout(); navigate('/login') },
    },
  ]

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        width={235}
        style={{ position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 100 }}
      >
        {/* Brand Header */}
        <div style={{
          height: 72, display: 'flex', alignItems: 'center',
          padding: '0 20px', borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          <Space size={10}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #4361ee 0%, #06b6d4 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(67, 97, 238, 0.4)',
            }}>
              <StockOutlined style={{ color: '#fff', fontSize: 18 }} />
            </div>
            <div>
              <Text strong style={{ color: '#fff', fontSize: 15, display: 'block', lineHeight: 1.2 }}>
                FO Tracker
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, letterSpacing: '0.06em' }}>
                ENTERPRISE TERMINAL
              </Text>
            </div>
          </Space>
        </div>

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={NAV_ITEMS.map((i) => ({ ...i, onClick: () => navigate(i.key) }))}
          style={{ marginTop: 14, border: 'none' }}
        />

        {/* Security Badge at bottom */}
        <div style={{
          position: 'absolute', bottom: 16, left: 16, right: 16,
          padding: '10px 12px', borderRadius: 10,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.07)',
        }}>
          <Space size={8}>
            <SafetyCertificateOutlined style={{ color: '#10b981', fontSize: 14 }} />
            <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11 }}>
              Secured Session
            </Text>
          </Space>
        </div>
      </Sider>

      <Layout style={{ marginLeft: 235 }}>
        <Header style={{
          background: '#ffffff',
          padding: '0 28px',
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #e2e8f0',
          position: 'sticky',
          top: 0,
          zIndex: 99,
        }}>
          <Space>
            <Tag color="geekblue" style={{ borderRadius: 6, fontWeight: 500 }}>
              NSE / BSE F&amp;O + GSec &amp; MF
            </Tag>
          </Space>

          <Dropdown menu={{ items: userMenu }} placement="bottomRight">
            <Space style={{ cursor: 'pointer', padding: '4px 10px', borderRadius: 8 }}>
              <Avatar icon={<UserOutlined />} style={{ background: '#4361ee' }} />
              <div style={{ lineHeight: 1.2 }}>
                <Text strong style={{ fontSize: 13, display: 'block' }}>
                  {user?.full_name || user?.username}
                </Text>
                <Text type="secondary" style={{ fontSize: 11 }}>Portfolio Owner</Text>
              </div>
            </Space>
          </Dropdown>
        </Header>

        <Content style={{ margin: 24, minHeight: 'calc(100vh - 112px)' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
