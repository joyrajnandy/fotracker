import { useState, useEffect } from 'react'
import {
  Row, Col, Card, Statistic, Select, Table, Tag, Typography, Space, Spin, Segmented,
} from 'antd'
import {
  ArrowUpOutlined, ArrowDownOutlined, SwapOutlined,
} from '@ant-design/icons'
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine,
} from 'recharts'
import { pnlApi, homeApi } from '@/services/api'
import type { PnLSummary, PnLByExpiry } from '@/types'

const { Title, Text } = Typography
const { Option } = Select

const COLORS = ['#10b981', '#ef4444', '#f59e0b']

function fmt(v: number) {
  return `₹${Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function PnLPage() {
  const [financialYears, setFinancialYears] = useState<string[]>([])
  const [fy, setFy] = useState('')
  const [summary, setSummary] = useState<PnLSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [indexFilter, setIndexFilter] = useState<string>('ALL')
  const [graphScope, setGraphScope] = useState<string>('TOP20')

  useEffect(() => {
    homeApi.getFinancialYears().then(({ data }) => {
      setFinancialYears(data.years)
      setFy(data.years[0])
    })
  }, [])

  useEffect(() => {
    if (!fy) return
    setLoading(true)
    pnlApi.getSummary(fy)
      .then(({ data }) => setSummary(data))
      .finally(() => setLoading(false))
  }, [fy])

  const allExpiries = summary?.by_expiry ?? []

  // Filter for SENSEX / NIFTY weekly expiry detail
  const filteredExpiries = allExpiries.filter((e) => {
    if (indexFilter === 'ALL') return true
    return e.symbol_base.toUpperCase().includes(indexFilter)
  })

  const pieData = summary
    ? [
        { name: 'Profit', value: summary.total_profit },
        { name: 'Loss', value: summary.total_loss },
      ].filter((d) => d.value > 0)
    : []

  const graphSource = graphScope === 'TOP20' ? filteredExpiries.slice(0, 20) : filteredExpiries
  const barData = graphSource.map((e) => ({
    name: `${e.symbol_base} ${e.expiry_date ?? '—'}`,
    pnl: e.realized_pnl,
  }))

  const columns = [
    {
      title: 'Index / Symbol',
      dataIndex: 'symbol_base',
      key: 'sym',
      render: (v: string) => (
        <Tag color={v.toUpperCase().includes('SENSEX') ? 'purple' : v.toUpperCase().includes('NIFTY') ? 'blue' : 'default'} style={{ fontWeight: 600 }}>
          {v}
        </Tag>
      ),
    },
    {
      title: 'Expiry Date',
      dataIndex: 'expiry_date',
      key: 'expiry',
      render: (v: string | null) => v ?? '—',
    },
    {
      title: 'Buy Qty',
      dataIndex: 'total_buy_qty',
      key: 'bq',
      align: 'right' as const,
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: 'Sell Qty',
      dataIndex: 'total_sell_qty',
      key: 'sq',
      align: 'right' as const,
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: 'Buy Value (₹)',
      dataIndex: 'buy_value',
      key: 'bv',
      align: 'right' as const,
      render: (v: number) => fmt(v),
    },
    {
      title: 'Sell Value (₹)',
      dataIndex: 'sell_value',
      key: 'sv',
      align: 'right' as const,
      render: (v: number) => fmt(v),
    },
    {
      title: 'Realized P&L (₹)',
      dataIndex: 'realized_pnl',
      key: 'pnl',
      align: 'right' as const,
      render: (v: number) => (
        <Text strong style={{ color: v >= 0 ? '#10b981' : '#ef4444' }}>
          {v >= 0 ? '+' : '-'}{fmt(v)}
        </Text>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (v: string) => (
        <Tag color={v === 'profit' ? 'success' : v === 'loss' ? 'error' : 'default'}>
          {v.toUpperCase()}
        </Tag>
      ),
    },
  ]

  return (
    <Spin spinning={loading}>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 20 }} wrap>
        <div>
          <Title level={3} style={{ margin: 0 }}>Profit &amp; Loss Analytics</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Weekly Expiry Performance across SENSEX &amp; NIFTY
          </Text>
        </div>
        <Space wrap>
          <Segmented
            value={indexFilter}
            onChange={(v) => setIndexFilter(String(v))}
            options={[
              { label: 'All Indices', value: 'ALL' },
              { label: 'NIFTY', value: 'NIFTY' },
              { label: 'SENSEX', value: 'SENSEX' },
            ]}
          />
          <Text type="secondary">FY:</Text>
          <Select value={fy} onChange={setFy} style={{ width: 120 }}>
            {financialYears.map((y) => <Option key={y} value={y}>{y}</Option>)}
          </Select>
        </Space>
      </Space>

      {/* Summary cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card-green" style={{ borderRadius: 14, border: 'none' }}>
            <Statistic
              title={<Text style={{ color: 'rgba(255,255,255,.88)', fontSize: 13 }}>Total Profit</Text>}
              value={summary?.total_profit ?? 0}
              prefix="₹"
              valueStyle={{ color: '#fff', fontSize: 20, fontWeight: 700 }}
              formatter={(v) => Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              suffix={<ArrowUpOutlined style={{ color: '#fff' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card-red" style={{ borderRadius: 14, border: 'none' }}>
            <Statistic
              title={<Text style={{ color: 'rgba(255,255,255,.88)', fontSize: 13 }}>Total Loss</Text>}
              value={summary?.total_loss ?? 0}
              prefix="₹"
              valueStyle={{ color: '#fff', fontSize: 20, fontWeight: 700 }}
              formatter={(v) => Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              suffix={<ArrowDownOutlined style={{ color: '#fff' }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className={(summary?.net_pnl ?? 0) >= 0 ? 'stat-card-blue' : 'stat-card-red'} style={{ borderRadius: 14, border: 'none' }}>
            <Statistic
              title={<Text style={{ color: 'rgba(255,255,255,.88)', fontSize: 13 }}>Net P&amp;L</Text>}
              value={Math.abs(summary?.net_pnl ?? 0)}
              prefix={(summary?.net_pnl ?? 0) >= 0 ? '+₹' : '-₹'}
              valueStyle={{ color: '#fff', fontSize: 20, fontWeight: 700 }}
              formatter={(v) => Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stat-card-orange" style={{ borderRadius: 14, border: 'none' }}>
            <Statistic
              title={<Text style={{ color: 'rgba(255,255,255,.88)', fontSize: 13 }}>Total Trades</Text>}
              value={summary?.total_trades ?? 0}
              valueStyle={{ color: '#fff', fontSize: 20, fontWeight: 700 }}
              suffix={<SwapOutlined style={{ color: '#fff' }} />}
            />
          </Card>
        </Col>
      </Row>

      {/* Full-width Bar Chart (so entire Top 20 / All graph is clearly visible) */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col span={24}>
          <Card
            className="enterprise-card"
            title={`P&L by Expiry (${graphScope === 'TOP20' ? 'Top 20' : 'All Expiries'})`}
            extra={
              <Segmented
                size="small"
                value={graphScope}
                onChange={(v) => setGraphScope(String(v))}
                options={[
                  { label: 'Top 20', value: 'TOP20' },
                  { label: 'All Expiries', value: 'ALL' },
                ]}
              />
            }
          >
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height={380}>
                <BarChart data={barData} margin={{ top: 16, right: 24, left: 16, bottom: 95 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="name"
                    angle={-40}
                    textAnchor="end"
                    tick={{ fontSize: 11 }}
                    interval={0}
                    height={90}
                  />
                  <YAxis tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
                  <ReferenceLine y={0} stroke="#64748b" />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Bar dataKey="pnl" name="Realized P&L" radius={[4, 4, 0, 0]} maxBarSize={36}>
                    {barData.map((d, i) => (
                      <Cell key={i} fill={d.pnl >= 0 ? '#10b981' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>No expiry data</div>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card className="enterprise-card" title="Profit vs Loss Split" style={{ height: '100%' }}>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>No data</div>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={16}>
          <Card className="enterprise-card" title="P&amp;L by Expiry (Detail — SENSEX &amp; NIFTY Weekly)" style={{ height: '100%' }}>
            <Table
              dataSource={filteredExpiries}
              columns={columns}
              rowKey={(r: PnLByExpiry) => `${r.symbol_base}-${r.expiry_date}`}
              size="small"
              pagination={{ pageSize: 15, showSizeChanger: false, showTotal: (t) => `Total ${t} expiries (15/page)` }}
              scroll={{ x: 820 }}
            />
          </Card>
        </Col>
      </Row>
    </Spin>
  )
}
