import { useState } from 'react'
import { Button, Drawer, Space, Typography, Tag, Spin, Alert, Card, Row, Col, Tooltip } from 'antd'
import { RobotOutlined, ReloadOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { aiApi } from '@/services/api'

const { Text, Title } = Typography

interface BotData {
  financial_year: string
  indices: Array<{
    symbol: string
    price: number | null
    change: number | null
    change_pct: number | null
    day_low?: number | null
    day_high?: number | null
    live: boolean
  }>
  latest_nifty_expiry: any
  latest_sensex_expiry: any
  account: {
    broker_cash: number
    undeployed_cash: number
    total_profit: number
    net_value: number
  }
  observations: string[]
  disclaimer: string
}

export default function MarketBot() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<BotData | null>(null)

  async function fetchBot() {
    setLoading(true)
    try {
      const { data: res } = await aiApi.getMarketBot()
      setData(res)
    } finally {
      setLoading(false)
    }
  }

  function handleOpen() {
    setOpen(true)
    fetchBot()
  }

  return (
    <>
      <Tooltip title="SENSEX & NIFTY Expiry & Account Pulse Bot" placement="left">
        <Button
          type="primary"
          shape="circle"
          size="large"
          onClick={handleOpen}
          style={{
            position: 'fixed',
            right: 24,
            bottom: 24,
            zIndex: 1000,
            width: 56,
            height: 56,
            background: 'linear-gradient(135deg, #4f46e5 0%, #06b6d4 100%)',
            border: '2px solid rgba(255,255,255,0.35)',
            boxShadow: '0 8px 28px rgba(79, 70, 229, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          icon={<RobotOutlined style={{ fontSize: 24 }} />}
        />
      </Tooltip>

      <Drawer
        title={
          <Space>
            <RobotOutlined style={{ color: '#4f46e5', fontSize: 18 }} />
            <span>SENSEX &amp; NIFTY Pulse Bot</span>
            <Tag color="cyan">Live</Tag>
          </Space>
        }
        extra={
          <Button size="small" icon={<ReloadOutlined spin={loading} />} onClick={fetchBot}>
            Refresh
          </Button>
        }
        placement="right"
        width={400}
        open={open}
        onClose={() => setOpen(false)}
      >
        <Spin spinning={loading}>
          {data && (
            <Space direction="vertical" style={{ width: '100%' }} size={16}>
              {/* Live Indices */}
              <Row gutter={[10, 10]}>
                {data.indices.map((idx) => {
                  const up = (idx.change ?? 0) >= 0
                  return (
                    <Col span={12} key={idx.symbol}>
                      <Card size="small" style={{ borderRadius: 10, background: '#0f172a', border: 'none' }}>
                        <Text style={{ color: '#94a3b8', fontSize: 11, display: 'block' }}>{idx.symbol}</Text>
                        <Text strong className="num-tabular" style={{ color: '#fff', fontSize: 16, display: 'block' }}>
                          {idx.live && idx.price != null ? idx.price.toLocaleString('en-IN') : 'Unavailable'}
                        </Text>
                        {idx.live && idx.change != null && (
                          <Tag color={up ? 'success' : 'error'} style={{ marginTop: 4 }}>
                            {up ? '▲' : '▼'} {(idx.change_pct ?? 0).toFixed(2)}%
                          </Tag>
                        )}
                      </Card>
                    </Col>
                  )
                })}
              </Row>

              {/* Account Snapshot */}
              <Card size="small" title="Account Snapshot" style={{ borderRadius: 10 }}>
                <Row gutter={[8, 8]}>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Broker Cash</Text>
                    <Text strong>₹{data.account.broker_cash.toLocaleString('en-IN')}</Text>
                  </Col>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Undeployed Cash</Text>
                    <Text strong>₹{data.account.undeployed_cash.toLocaleString('en-IN')}</Text>
                  </Col>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Total Profit</Text>
                    <Text strong style={{ color: data.account.total_profit >= 0 ? '#10b981' : '#ef4444' }}>
                      ₹{data.account.total_profit.toLocaleString('en-IN')}
                    </Text>
                  </Col>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Net Value</Text>
                    <Text strong>₹{data.account.net_value.toLocaleString('en-IN')}</Text>
                  </Col>
                </Row>
              </Card>

              {/* Generic Observations */}
              <div>
                <Title level={5} style={{ marginBottom: 8 }}>Current Observations</Title>
                <Space direction="vertical" style={{ width: '100%' }} size={8}>
                  {data.observations.map((obs, i) => (
                    <Card key={i} size="small" style={{ borderRadius: 8, background: '#f8fafc' }}>
                      <Space align="start">
                        <InfoCircleOutlined style={{ color: '#4f46e5', marginTop: 3 }} />
                        <Text style={{ fontSize: 13 }}>{obs}</Text>
                      </Space>
                    </Card>
                  ))}
                </Space>
              </div>

              <Alert type="info" showIcon message={data.disclaimer} style={{ borderRadius: 8 }} />
            </Space>
          )}
        </Spin>
      </Drawer>
    </>
  )
}
