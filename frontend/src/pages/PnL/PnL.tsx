import { useState, useEffect } from 'react'
import {
  Row, Col, Card, Statistic, Select, Table, Tag, Typography, Space, Spin, Segmented,
  InputNumber, Button, message, Tooltip,
} from 'antd'
import {
  ArrowUpOutlined, ArrowDownOutlined, SwapOutlined, EditOutlined, UndoOutlined, CheckOutlined,
} from '@ant-design/icons'
import {
  PieChart, Pie, Cell, Tooltip as ReTooltip, Legend, ResponsiveContainer,
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
  const [editingBrokerage, setEditingBrokerage] = useState(false)
  const [customBrokerage, setCustomBrokerage] = useState<number>(0)
  const [perTradeFee, setPerTradeFee] = useState<number>(25.7)

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
      .then(({ data }) => {
        setSummary(data)
        setCustomBrokerage(data.total_brokerage)
        setPerTradeFee(data.per_trade_fee ?? 25.7)
      })
      .finally(() => setLoading(false))
  }, [fy])

  async function saveBrokerage() {
    if (!fy) return
    setLoading(true)
    try {
      const autoChanged = summary && Math.abs(customBrokerage - summary.total_brokerage) > 0.01
      const { data } = await pnlApi.updateBrokerage(
        fy,
        autoChanged ? customBrokerage : null,
        perTradeFee,
      )
      setSummary(data)
      setCustomBrokerage(data.total_brokerage)
      setPerTradeFee(data.per_trade_fee)
      setEditingBrokerage(false)
      message.success('Brokerage updated')
    } catch {
      message.error('Failed to update brokerage')
    } finally {
      setLoading(false)
    }
  }

  async function resetBrokerage() {
    if (!fy) return
    setLoading(true)
    try {
      const { data } = await pnlApi.updateBrokerage(fy, null, 25.7)
      setSummary(data)
      setCustomBrokerage(data.total_brokerage)
      setPerTradeFee(25.7)
      setEditingBrokerage(false)
      message.success('Brokerage reset to ₹25.70 per trade')
    } catch {
      message.error('Failed to reset brokerage')
    } finally {
      setLoading(false)
    }
  }

  const allExpiries = summary?.by_expiry ?? []

  const filteredExpiries = allExpiries.filter((e) => {
    if (indexFilter === 'ALL') return true
    return e.symbol_base.toUpperCase().includes(indexFilter)
  })

  const pieData = summary
    ? [
        { name: 'Net Profit', value: summary.total_profit },
        { name: 'Net Loss', value: summary.total_loss },
      ].filter((d) => d.value > 0)
    : []

  const graphSource = graphScope === 'TOP20' ? filteredExpiries.slice(0, 20) : filteredExpiries
  const barData = graphSource.map((e) => ({
    name: `${e.symbol_base} ${e.expiry_date ?? '—'}`,
    pnl: e.realized_pnl,
  }))

  const columns = [
    {
      title: 'Index',
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
      title: 'Trades',
      dataIndex: 'trades_count',
      key: 'tc',
      align: 'right' as const,
    },
    {
      title: 'Gross P&L',
      dataIndex: 'gross_pnl',
      key: 'gpnl',
      align: 'right' as const,
      render: (v: number) => (
        <Text style={{ color: v >= 0 ? '#10b981' : '#ef4444' }}>
          {v >= 0 ? '+' : '-'}{fmt(v)}
        </Text>
      ),
    },
    {
      title: 'Brokerage',
      dataIndex: 'brokerage',
      key: 'brk',
      align: 'right' as const,
      render: (v: number) => <Text type="secondary">-{fmt(v)}</Text>,
    },
    {
      title: 'Net P&L (After Brokerage)',
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
            Weekly Expiry Performance across SENSEX &amp; NIFTY (Net of ₹{summary?.per_trade_fee ?? 25.7}/trade Brokerage)
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
              title={<Text style={{ color: 'rgba(255,255,255,.88)', fontSize: 13 }}>Total Net Profit</Text>}
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
              title={<Text style={{ color: 'rgba(255,255,255,.88)', fontSize: 13 }}>Total Net Loss</Text>}
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
              title={<Text style={{ color: 'rgba(255,255,255,.88)', fontSize: 13 }}>Net P&amp;L (After Brokerage)</Text>}
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

      {/* Brokerage Calculation & Editable Override Card */}
      <Card
        className="enterprise-card"
        style={{ marginBottom: 20 }}
        title={
          <Space>
            <span>Brokerage &amp; Charges (₹{summary?.per_trade_fee ?? 25.7} / Trade)</span>
            {summary?.is_custom_brokerage
              ? <Tag color="orange">Custom Total Active</Tag>
              : <Tag color="blue">Auto Calculated</Tag>}
          </Space>
        }
        extra={
          editingBrokerage ? (
            <Space>
              <Button type="primary" size="small" icon={<CheckOutlined />} onClick={saveBrokerage}>Save</Button>
              <Button size="small" icon={<UndoOutlined />} onClick={resetBrokerage}>Reset ₹25.7</Button>
            </Space>
          ) : (
            <Button size="small" icon={<EditOutlined />} onClick={() => setEditingBrokerage(true)}>
              Edit Brokerage
            </Button>
          )
        }
      >
        <Row gutter={[24, 12]} align="middle">
          <Col xs={12} sm={6}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Gross F&amp;O P&amp;L</Text>
            <Text strong className="num-tabular" style={{
              fontSize: 17, color: (summary?.gross_net_pnl ?? 0) >= 0 ? '#10b981' : '#ef4444',
            }}>
              {(summary?.gross_net_pnl ?? 0) >= 0 ? '+' : '-'}{fmt(summary?.gross_net_pnl ?? 0)}
            </Text>
          </Col>
          <Col xs={12} sm={6}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
              Per-Trade Rate ({summary?.total_trades ?? 0} trades)
            </Text>
            {editingBrokerage ? (
              <InputNumber
                min={0}
                step={0.1}
                prefix="₹"
                value={perTradeFee}
                onChange={(v) => {
                  const rate = Number(v ?? 0)
                  setPerTradeFee(rate)
                  setCustomBrokerage(Number(((summary?.total_trades ?? 0) * rate).toFixed(2)))
                }}
                style={{ width: 130 }}
              />
            ) : (
              <Text strong className="num-tabular" style={{ fontSize: 17 }}>
                ₹{summary?.per_trade_fee ?? 25.7} ({fmt(summary?.calculated_brokerage ?? 0)})
              </Text>
            )}
          </Col>
          <Col xs={12} sm={6}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Applied Total Brokerage</Text>
            {editingBrokerage ? (
              <InputNumber
                min={0}
                prefix="₹"
                value={customBrokerage}
                onChange={(v) => setCustomBrokerage(Number(v ?? 0))}
                style={{ width: 160 }}
              />
            ) : (
              <Text strong className="num-tabular" style={{ fontSize: 17, color: '#ef4444' }}>
                -{fmt(summary?.total_brokerage ?? 0)}
              </Text>
            )}
          </Col>
          <Col xs={12} sm={6}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>Net P&amp;L (After Brokerage)</Text>
            <Text strong className="num-tabular" style={{
              fontSize: 17, color: (summary?.net_pnl ?? 0) >= 0 ? '#10b981' : '#ef4444',
            }}>
              {(summary?.net_pnl ?? 0) >= 0 ? '+' : '-'}{fmt(summary?.net_pnl ?? 0)}
            </Text>
          </Col>
        </Row>
      </Card>

      {/* Full-width Bar Chart */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col span={24}>
          <Card
            className="enterprise-card"
            title={`P&L by Expiry (${graphScope === 'TOP20' ? 'Top 20' : 'All Expiries'}) — Net of Brokerage`}
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
                  <ReTooltip formatter={(v: number) => fmt(v)} />
                  <Bar dataKey="pnl" name="Net P&L" radius={[4, 4, 0, 0]} maxBarSize={36}>
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
          <Card className="enterprise-card" title="Net Profit vs Loss Split" style={{ height: '100%' }}>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                  </Pie>
                  <ReTooltip formatter={(v: number) => fmt(v)} />
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
