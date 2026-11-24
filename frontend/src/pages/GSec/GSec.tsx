import { useState, useEffect } from 'react'
import { Card, Table, Tag, Typography, Space, Select, Button, Spin, Input, Row, Col, Statistic } from 'antd'
import { BankOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { marketApi, homeApi } from '@/services/api'

const { Title, Text } = Typography
const { Option } = Select

function fmt(v: number) {
  return `₹${Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function GSecPage() {
  const [financialYears, setFinancialYears] = useState<string[]>([])
  const [fy, setFy] = useState('')
  const [loading, setLoading] = useState(true)
  const [bhavDate, setBhavDate] = useState<string | null>(null)
  const [myBonds, setMyBonds] = useState<any[]>([])
  const [allGsec, setAllGsec] = useState<any[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    homeApi.getFinancialYears().then(({ data }) => {
      setFinancialYears(data.years)
      setFy(data.years[0])
    })
  }, [])

  async function fetchGsec(selectedFy = fy) {
    if (!selectedFy) return
    setLoading(true)
    try {
      const { data } = await marketApi.getGsec(selectedFy)
      setBhavDate(data.bhavcopy_date)
      setMyBonds(data.my_bonds || [])
      setAllGsec(data.all_nse_gsec || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (fy) fetchGsec(fy)
  }, [fy])

  const filteredAll = allGsec.filter((g) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      g.symbol.toLowerCase().includes(q) ||
      g.name.toLowerCase().includes(q) ||
      (g.isin || '').toLowerCase().includes(q)
    )
  })

  const myColumns = [
    {
      title: 'Instrument', dataIndex: 'symbol', key: 'sym',
      sorter: (a: any, b: any) => a.symbol.localeCompare(b.symbol),
      render: (v: string, r: any) => (
        <div>
          <Tag color="geekblue" style={{ fontWeight: 600 }}>{v}</Tag>
          <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{r.isin}</Text>
        </div>
      ),
    },
    {
      title: 'Coupon %', dataIndex: 'coupon_rate', key: 'coupon', align: 'right' as const,
      sorter: (a: any, b: any) => (a.coupon_rate ?? 0) - (b.coupon_rate ?? 0),
      render: (v: number | null) => v != null ? `${v.toFixed(2)}%` : '—',
    },
    {
      title: 'Maturity', dataIndex: 'maturity_year', key: 'mat', align: 'center' as const,
      sorter: (a: any, b: any) => (a.maturity_year ?? 0) - (b.maturity_year ?? 0),
      render: (v: number | null) => v ?? '—',
    },
    {
      title: 'Live Price (₹)', dataIndex: 'live_price', key: 'lp', align: 'right' as const,
      sorter: (a: any, b: any) => (a.live_price ?? 0) - (b.live_price ?? 0),
      render: (v: number | null) => v != null ? <Text strong style={{ color: '#2563eb' }}>{fmt(v)}</Text> : '—',
    },
    {
      title: 'Yield %', dataIndex: 'current_yield', key: 'yld', align: 'right' as const,
      sorter: (a: any, b: any) => (a.current_yield ?? 0) - (b.current_yield ?? 0),
      render: (v: number | null) => v != null ? <Tag color="green">{v.toFixed(2)}%</Tag> : '—',
    },
    {
      title: 'Interest Pay Dates', dataIndex: 'interest_pay_dates', key: 'ipd',
      sorter: (a: any, b: any) => (a.interest_pay_dates || '').localeCompare(b.interest_pay_dates || ''),
    },
    {
      title: 'Qty', dataIndex: 'qty', key: 'qty', align: 'right' as const,
      sorter: (a: any, b: any) => a.qty - b.qty,
      render: (v: number) => v.toLocaleString('en-IN'),
    },
    {
      title: 'Invested', dataIndex: 'invested_value', key: 'inv', align: 'right' as const,
      sorter: (a: any, b: any) => a.invested_value - b.invested_value,
      render: (v: number) => fmt(v),
    },
    {
      title: 'Current Value', dataIndex: 'current_value', key: 'cv', align: 'right' as const,
      sorter: (a: any, b: any) => (a.current_value ?? 0) - (b.current_value ?? 0),
      render: (v: number | null) => v != null ? <Text strong>{fmt(v)}</Text> : '—',
    },
    {
      title: 'P&L', dataIndex: 'pnl', key: 'pnl', align: 'right' as const,
      sorter: (a: any, b: any) => (a.pnl ?? 0) - (b.pnl ?? 0),
      render: (v: number | null) => v == null ? '—' : (
        <Text strong style={{ color: v >= 0 ? '#10b981' : '#ef4444' }}>
          {v >= 0 ? '+' : '-'}{fmt(v)}
        </Text>
      ),
    },
  ]

  const marketColumns = [
    {
      title: 'Instrument', dataIndex: 'symbol', key: 'sym',
      sorter: (a: any, b: any) => a.symbol.localeCompare(b.symbol),
      render: (v: string) => <Tag color="blue" style={{ fontWeight: 600 }}>{v}</Tag>,
    },
    {
      title: 'Bond Name', dataIndex: 'name', key: 'name',
      sorter: (a: any, b: any) => a.name.localeCompare(b.name),
    },
    {
      title: 'ISIN', dataIndex: 'isin', key: 'isin',
      sorter: (a: any, b: any) => (a.isin || '').localeCompare(b.isin || ''),
    },
    {
      title: 'Coupon %', dataIndex: 'coupon_rate', key: 'coupon', align: 'right' as const,
      sorter: (a: any, b: any) => (a.coupon_rate ?? 0) - (b.coupon_rate ?? 0),
      render: (v: number | null) => v != null ? `${v.toFixed(2)}%` : '—',
    },
    {
      title: 'Maturity', dataIndex: 'maturity_year', key: 'mat', align: 'center' as const,
      sorter: (a: any, b: any) => (a.maturity_year ?? 0) - (b.maturity_year ?? 0),
    },
    {
      title: 'Live Price (₹)', dataIndex: 'price', key: 'price', align: 'right' as const,
      sorter: (a: any, b: any) => a.price - b.price,
      render: (v: number) => <Text strong style={{ color: '#2563eb' }}>{fmt(v)}</Text>,
    },
    {
      title: 'Current Yield %', dataIndex: 'current_yield', key: 'yld', align: 'right' as const,
      sorter: (a: any, b: any) => (a.current_yield ?? 0) - (b.current_yield ?? 0),
      render: (v: number | null) => v != null ? <Tag color="green">{v.toFixed(2)}%</Tag> : '—',
    },
    {
      title: 'Interest Pay Dates', dataIndex: 'interest_pay_dates', key: 'ipd',
      sorter: (a: any, b: any) => (a.interest_pay_dates || '').localeCompare(b.interest_pay_dates || ''),
    },
  ]

  const totalInv = myBonds.reduce((s, r) => s + (r.invested_value || 0), 0)
  const totalCv = myBonds.reduce((s, r) => s + (r.current_value ?? r.invested_value ?? 0), 0)
  const totalPnl = totalCv - totalInv

  return (
    <Spin spinning={loading}>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 20 }} wrap>
        <Space>
          <BankOutlined style={{ fontSize: 24, color: '#4f46e5' }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Government Securities (GSec)</Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Official NSE BhavCopy Prices, Current Yield &amp; Semi-Annual Interest Pay Dates
              {bhavDate ? ` • Data Date: ${bhavDate}` : ''}
            </Text>
          </div>
        </Space>
        <Space wrap>
          <Select value={fy} onChange={setFy} style={{ width: 120 }}>
            {financialYears.map((y) => <Option key={y} value={y}>{y}</Option>)}
          </Select>
          <Button icon={<ReloadOutlined />} onClick={() => fetchGsec(fy)}>Refresh</Button>
        </Space>
      </Space>

      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} sm={8}>
          <Card className="stat-card-blue" style={{ borderRadius: 14, border: 'none' }}>
            <Statistic
              title={<Text style={{ color: 'rgba(255,255,255,0.88)' }}>GSec Invested</Text>}
              value={totalInv} prefix="₹"
              valueStyle={{ color: '#fff', fontWeight: 700 }}
              formatter={(v) => Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className="stat-card-purple" style={{ borderRadius: 14, border: 'none' }}>
            <Statistic
              title={<Text style={{ color: 'rgba(255,255,255,0.88)' }}>GSec Current Value</Text>}
              value={totalCv} prefix="₹"
              valueStyle={{ color: '#fff', fontWeight: 700 }}
              formatter={(v) => Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card className={totalPnl >= 0 ? 'stat-card-green' : 'stat-card-red'} style={{ borderRadius: 14, border: 'none' }}>
            <Statistic
              title={<Text style={{ color: 'rgba(255,255,255,0.88)' }}>GSec Unrealised P&amp;L</Text>}
              value={Math.abs(totalPnl)} prefix={totalPnl >= 0 ? '+₹' : '-₹'}
              valueStyle={{ color: '#fff', fontWeight: 700 }}
              formatter={(v) => Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            />
          </Card>
        </Col>
      </Row>

      <Card className="enterprise-card" title="My GSec Holdings" style={{ marginBottom: 20 }}>
        <Table
          dataSource={myBonds}
          columns={myColumns}
          rowKey="id"
          size="small"
          pagination={false}
          scroll={{ x: 960 }}
        />
      </Card>

      <Card
        className="enterprise-card"
        title={`All Active NSE Government Securities (${filteredAll.length})`}
        extra={
          <Input
            prefix={<SearchOutlined />}
            placeholder="Search symbol / ISIN"
            allowClear
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 220 }}
          />
        }
      >
        <Table
          dataSource={filteredAll}
          columns={marketColumns}
          rowKey="symbol"
          size="small"
          pagination={{ pageSize: 15, showTotal: (t) => `Total ${t} GSec bonds` }}
          scroll={{ x: 880 }}
        />
      </Card>
    </Spin>
  )
}
