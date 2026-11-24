import { useState, useEffect } from 'react'
import {
  Row, Col, Card, Progress, Statistic, Select, Button,
  Typography, Space, Tag, Spin, Tooltip, message, Tabs, Table, Badge,
} from 'antd'
import {
  CheckCircleOutlined, CloseCircleOutlined, ReloadOutlined,
  CalendarOutlined, AimOutlined, ClockCircleOutlined, BankOutlined,
} from '@ant-design/icons'
import { targetApi, homeApi } from '@/services/api'
import type { TargetAchievement, PeriodRow } from '@/types'

const { Title, Text } = Typography
const { Option } = Select

function fmt(v: number) {
  return `₹${Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function TargetCard({
  title, subtitle, target, actual, capitalBase, achieved, pct, icon,
}: {
  title: string
  subtitle?: string
  target: number
  actual: number
  capitalBase?: number
  achieved: boolean
  pct: number
  icon: React.ReactNode
}) {
  const clampedPct = Math.min(Math.abs(pct), 100)
  const strokeColor = achieved ? '#10b981' : actual >= 0 ? '#4361ee' : '#ef4444'
  return (
    <Card
      className={`enterprise-card ${achieved ? 'target-card-achieved' : 'target-card-pending'}`}
      style={{ height: '100%' }}
      title={
        <Space wrap>
          {icon}
          <span style={{ fontWeight: 600, fontSize: 15 }}>{title}</span>
          {subtitle && <Tag color="blue">{subtitle}</Tag>}
          {achieved
            ? <Tag icon={<CheckCircleOutlined />} color="success">ACHIEVED</Tag>
            : <Tag icon={<CloseCircleOutlined />} color="error">PENDING</Tag>}
        </Space>
      }
      extra={capitalBase !== undefined && (
        <Tooltip title="Broker cash capital deployed up to this period">
          <Tag icon={<BankOutlined />} color="geekblue">Capital: {fmt(capitalBase)}</Tag>
        </Tooltip>
      )}
    >
      <Row gutter={[0, 14]}>
        <Col span={24}>
          <Tooltip title={`${pct.toFixed(1)}% of target achieved`}>
            <Progress
              percent={clampedPct} strokeColor={strokeColor} trailColor="#f1f5f9"
              format={() => `${pct.toFixed(1)}%`} strokeWidth={10}
            />
          </Tooltip>
        </Col>
        <Col span={12}>
          <Statistic
            title={<Text type="secondary" style={{ fontSize: 12 }}>Target (10% p.a.)</Text>}
            value={target} prefix="₹" valueStyle={{ fontSize: 18, fontWeight: 700 }}
            formatter={(v) => Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          />
        </Col>
        <Col span={12}>
          <Statistic
            title={<Text type="secondary" style={{ fontSize: 12 }}>Achieved P&amp;L</Text>}
            value={Math.abs(actual)} prefix={actual >= 0 ? '+₹' : '-₹'}
            valueStyle={{ fontSize: 18, fontWeight: 700, color: actual >= 0 ? '#10b981' : '#ef4444' }}
            formatter={(v) => Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          />
        </Col>
        <Col span={24}>
          <div style={{
            background: achieved ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${achieved ? '#bbf7d0' : '#fecaca'}`,
            borderRadius: 8, padding: '8px 12px', textAlign: 'center',
          }}>
            {achieved
              ? <Text style={{ color: '#059669', fontWeight: 600 }}>🎉 Target met! Surplus: {fmt(actual - target)}</Text>
              : <Text style={{ color: '#dc2626', fontWeight: 600 }}>Still need: {fmt(Math.max(0, target - actual))} more</Text>}
          </div>
        </Col>
      </Row>
    </Card>
  )
}

function PeriodTable({ rows, label }: { rows: PeriodRow[]; label: string }) {
  const columns = [
    {
      title: label, dataIndex: 'label', key: 'label', width: 230,
      render: (v: string, row: PeriodRow) => (
        row.is_future
          ? <Tag color="default"><ClockCircleOutlined /> {v}</Tag>
          : <Text strong>{v}</Text>
      ),
    },
    {
      title: 'Capital Base (Cash)', dataIndex: 'capital_base', key: 'cap', align: 'right' as const,
      render: (v: number) => <Text type="secondary">{fmt(v)}</Text>,
    },
    {
      title: 'Target', dataIndex: 'target', key: 'target', align: 'right' as const,
      render: (v: number) => fmt(v),
    },
    {
      title: 'P&L', dataIndex: 'pnl', key: 'pnl', align: 'right' as const,
      render: (v: number, row: PeriodRow) => row.is_future
        ? <Text type="secondary">—</Text>
        : <Text strong style={{ color: v >= 0 ? '#10b981' : '#ef4444' }}>
            {v >= 0 ? '+' : '-'}{fmt(v)}
          </Text>,
    },
    {
      title: 'Progress', dataIndex: 'pct', key: 'pct', width: 180,
      render: (v: number, row: PeriodRow) => row.is_future
        ? <Text type="secondary">—</Text>
        : (
          <Progress
            percent={Math.min(Math.abs(v), 100)}
            strokeColor={row.achieved ? '#10b981' : v < 0 ? '#ef4444' : '#4361ee'}
            trailColor="#f1f5f9"
            format={() => `${v.toFixed(1)}%`}
            size="small"
            style={{ width: 130 }}
          />
        ),
    },
    {
      title: 'Status', key: 'status', width: 110, align: 'center' as const,
      render: (_: any, row: PeriodRow) => row.is_future
        ? <Tag color="default">Future</Tag>
        : row.achieved
          ? <Tag icon={<CheckCircleOutlined />} color="success">Done</Tag>
          : <Tag icon={<CloseCircleOutlined />} color="error">Pending</Tag>,
    },
  ]

  const achieved = rows.filter((r) => !r.is_future && r.achieved).length
  const past = rows.filter((r) => !r.is_future).length

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <Badge count={achieved} overflowCount={999} style={{ backgroundColor: '#10b981' }} />
        <Text type="secondary">of {past} elapsed periods achieved</Text>
        {past > 0 && (
          <Tag color={achieved === past ? 'green' : achieved > past / 2 ? 'orange' : 'red'}>
            {((achieved / past) * 100).toFixed(0)}% hit rate
          </Tag>
        )}
      </Space>
      <Table
        dataSource={rows}
        columns={columns}
        rowKey="label"
        size="small"
        pagination={false}
        rowClassName={(row) => row.is_future ? 'row-future' : row.achieved ? 'row-achieved' : ''}
        scroll={{ y: 420, x: 750 }}
      />
    </>
  )
}

export default function TargetPage() {
  const [financialYears, setFinancialYears] = useState<string[]>([])
  const [fy, setFy] = useState('')
  const [achievement, setAchievement] = useState<TargetAchievement | null>(null)
  const [loading, setLoading] = useState(false)

  const [selectedQuarter, setSelectedQuarter] = useState<string>('')
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [selectedWeek, setSelectedWeek] = useState<string>('')

  useEffect(() => {
    homeApi.getFinancialYears().then(({ data }) => {
      setFinancialYears(data.years)
      setFy(data.years[0])
    })
  }, [])

  useEffect(() => { if (fy) fetchAchievement() }, [fy])

  async function fetchAchievement() {
    setLoading(true)
    try {
      const { data } = await targetApi.getAchievement(fy) as { data: TargetAchievement }
      setAchievement(data)
      const todayIso = new Date().toISOString().slice(0, 10)
      const curQ = data.all_quarters.find((q) => !q.is_future && q.end >= todayIso) || data.all_quarters[data.all_quarters.length - 1]
      const curM = data.all_months.find((m) => !m.is_future && m.end >= todayIso) || data.all_months[data.all_months.length - 1]
      const curW = data.all_weeks.find((w) => !w.is_future && w.end >= todayIso) || data.all_weeks[data.all_weeks.length - 1]
      if (curQ) setSelectedQuarter(curQ.label)
      if (curM) setSelectedMonth(curM.label)
      if (curW) setSelectedWeek(curW.label)
    } finally { setLoading(false) }
  }

  async function recalculate() {
    setLoading(true)
    try {
      await targetApi.recalculate(fy)
      message.success('Targets recalculated from broker cash')
      fetchAchievement()
    } catch { message.error('Recalculation failed') } finally { setLoading(false) }
  }

  const a = achievement
  const activeQ = a?.all_quarters.find((q) => q.label === selectedQuarter)
  const activeM = a?.all_months.find((m) => m.label === selectedMonth)
  const activeW = a?.all_weeks.find((w) => w.label === selectedWeek)

  return (
    <Spin spinning={loading}>
      {/* Header */}
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 20 }} wrap>
        <Space>
          <AimOutlined style={{ fontSize: 24, color: '#4361ee' }} />
          <div>
            <Title level={3} style={{ margin: 0 }}>Targets &amp; Period Explorer</Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Date-aware targets (10% p.a.) calculated from broker cash added as of each period
            </Text>
          </div>
        </Space>
        <Space>
          <Text type="secondary">Financial Year:</Text>
          <Select value={fy} onChange={setFy} style={{ width: 120 }}>
            {financialYears.map((y) => <Option key={y} value={y}>{y}</Option>)}
          </Select>
          <Button icon={<ReloadOutlined />} onClick={recalculate}>Recalculate</Button>
        </Space>
      </Space>

      {/* Period Selector Bar */}
      {a && (
        <Card className="enterprise-card" style={{ marginBottom: 20 }} bodyStyle={{ padding: '14px 20px' }}>
          <Row gutter={[16, 12]} align="middle">
            <Col xs={24} md={8}>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Inspect Quarter:</Text>
              <Select value={selectedQuarter} onChange={setSelectedQuarter} style={{ width: '100%' }}>
                {a.all_quarters.map((q) => (
                  <Option key={q.label} value={q.label}>{q.label} {q.is_future ? '(Future)' : ''}</Option>
                ))}
              </Select>
            </Col>
            <Col xs={24} md={8}>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Inspect Month:</Text>
              <Select value={selectedMonth} onChange={setSelectedMonth} style={{ width: '100%' }}>
                {a.all_months.map((m) => (
                  <Option key={m.label} value={m.label}>{m.label} {m.is_future ? '(Future)' : ''}</Option>
                ))}
              </Select>
            </Col>
            <Col xs={24} md={8}>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>Inspect Week:</Text>
              <Select value={selectedWeek} onChange={setSelectedWeek} style={{ width: '100%' }} showSearch>
                {a.all_weeks.map((w) => (
                  <Option key={w.label} value={w.label}>{w.label} {w.is_future ? '(Future)' : ''}</Option>
                ))}
              </Select>
            </Col>
          </Row>
        </Card>
      )}

      {/* 4 Interactive Target Cards */}
      <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12}>
          <TargetCard
            title="Yearly Target"
            subtitle={fy}
            target={a?.yearly_target ?? 0}
            actual={a?.yearly_pnl ?? 0}
            achieved={a?.yearly_achieved ?? false}
            pct={a?.yearly_pct ?? 0}
            icon={<CalendarOutlined style={{ color: '#4361ee' }} />}
          />
        </Col>
        <Col xs={24} lg={12}>
          <TargetCard
            title="Selected Quarter"
            subtitle={activeQ?.label}
            capitalBase={activeQ?.capital_base}
            target={activeQ?.target ?? 0}
            actual={activeQ?.pnl ?? 0}
            achieved={activeQ?.achieved ?? false}
            pct={activeQ?.pct ?? 0}
            icon={<CalendarOutlined style={{ color: '#10b981' }} />}
          />
        </Col>
        <Col xs={24} lg={12}>
          <TargetCard
            title="Selected Month"
            subtitle={activeM?.label}
            capitalBase={activeM?.capital_base}
            target={activeM?.target ?? 0}
            actual={activeM?.pnl ?? 0}
            achieved={activeM?.achieved ?? false}
            pct={activeM?.pct ?? 0}
            icon={<CalendarOutlined style={{ color: '#f59e0b' }} />}
          />
        </Col>
        <Col xs={24} lg={12}>
          <TargetCard
            title="Selected Week"
            subtitle={activeW?.label}
            capitalBase={activeW?.capital_base}
            target={activeW?.target ?? 0}
            actual={activeW?.pnl ?? 0}
            achieved={activeW?.achieved ?? false}
            pct={activeW?.pct ?? 0}
            icon={<CalendarOutlined style={{ color: '#ef4444' }} />}
          />
        </Col>
      </Row>

      {/* Full Period Breakdowns */}
      <Card className="enterprise-card" title="All Periods Breakdown (Date-Based Cash Capital)">
        <Tabs
          defaultActiveKey="months"
          items={[
            {
              key: 'quarters',
              label: (
                <Space>
                  <CalendarOutlined />Quarters
                  {a && <Tag color="blue">{a.all_quarters.filter((q) => !q.is_future && q.achieved).length}/{a.all_quarters.filter((q) => !q.is_future).length}</Tag>}
                </Space>
              ),
              children: a ? <PeriodTable rows={a.all_quarters} label="Quarter" /> : null,
            },
            {
              key: 'months',
              label: (
                <Space>
                  <CalendarOutlined />Months
                  {a && <Tag color="blue">{a.all_months.filter((m) => !m.is_future && m.achieved).length}/{a.all_months.filter((m) => !m.is_future).length}</Tag>}
                </Space>
              ),
              children: a ? <PeriodTable rows={a.all_months} label="Month" /> : null,
            },
            {
              key: 'weeks',
              label: (
                <Space>
                  <CalendarOutlined />Weeks
                  {a && <Tag color="blue">{a.all_weeks.filter((w) => !w.is_future && w.achieved).length}/{a.all_weeks.filter((w) => !w.is_future).length}</Tag>}
                </Space>
              ),
              children: a ? <PeriodTable rows={a.all_weeks} label="Week" /> : null,
            },
          ]}
        />
      </Card>
    </Spin>
  )
}
