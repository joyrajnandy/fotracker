import { useState, useEffect } from 'react'
import {
  Row, Col, Card, Progress, Statistic, Select, Button, Switch, Grid,
  Typography, Space, Tag, Spin, Tooltip, message, Tabs, Table, Badge, Alert,
} from 'antd'
import {
  CheckCircleOutlined, CloseCircleOutlined, ReloadOutlined,
  CalendarOutlined, AimOutlined, ClockCircleOutlined, BankOutlined,
  BulbOutlined,
} from '@ant-design/icons'
import { targetApi, homeApi } from '@/services/api'
import type { TargetAchievement, PeriodRow } from '@/types'

const { Title, Text } = Typography
const { Option } = Select
const { useBreakpoint } = Grid

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

function MissAnalysisBox({ row }: { row: PeriodRow }) {
  const m = row.miss_analysis
  if (!m) return null
  return (
    <Alert
      type="warning"
      showIcon
      icon={<BulbOutlined />}
      message={
        <Space wrap size={[12, 4]}>
          <Text strong style={{ fontSize: 12 }}>Why target was not met</Text>
          <Tag color="red">Shortfall: {fmt(m.shortfall)}</Tag>
          <Tag color="blue">{m.trades_count} trades</Tag>
          <Tag color={m.gross_pnl >= 0 ? 'green' : 'volcano'}>
            Gross: {m.gross_pnl >= 0 ? '+' : '-'}{fmt(m.gross_pnl)}
          </Tag>
          <Tag color="purple">Charges: {fmt(m.brokerage)}</Tag>
        </Space>
      }
      description={
        <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12 }}>
          {m.reasons.map((r, idx) => (
            <li key={idx} style={{ marginBottom: 2 }}>{r}</li>
          ))}
        </ul>
      }
      style={{ padding: '8px 12px', borderRadius: 8 }}
    />
  )
}

function PeriodTable({
  rows,
  label,
  isWeekly = false,
}: {
  rows: PeriodRow[]
  label: string
  isWeekly?: boolean
}) {
  const screens = useBreakpoint()
  const isMobile = !screens.md
  const [showAnalysis, setShowAnalysis] = useState(false)

  const isRowGreen = (row: PeriodRow) => !row.is_future && (row.achieved || row.target === 0)

  const columns = [
    {
      title: label, dataIndex: 'label', key: 'label', width: 230,
      sorter: (a: PeriodRow, b: PeriodRow) => a.start.localeCompare(b.start),
      render: (v: string, row: PeriodRow) => (
        row.is_future
          ? <Tag color="default"><ClockCircleOutlined /> {v}</Tag>
          : <Text strong>{v}</Text>
      ),
    },
    {
      title: 'Capital Base (Cash)', dataIndex: 'capital_base', key: 'cap', align: 'right' as const,
      sorter: (a: PeriodRow, b: PeriodRow) => a.capital_base - b.capital_base,
      render: (v: number) => <Text type="secondary">{fmt(v)}</Text>,
    },
    {
      title: 'Target', dataIndex: 'target', key: 'target', align: 'right' as const,
      sorter: (a: PeriodRow, b: PeriodRow) => a.target - b.target,
      render: (v: number) => fmt(v),
    },
    {
      title: 'P&L', dataIndex: 'pnl', key: 'pnl', align: 'right' as const,
      sorter: (a: PeriodRow, b: PeriodRow) => a.pnl - b.pnl,
      render: (v: number, row: PeriodRow) => row.is_future
        ? <Text type="secondary">—</Text>
        : <Text strong style={{ color: v >= 0 ? '#10b981' : '#ef4444' }}>
            {v >= 0 ? '+' : '-'}{fmt(v)}
          </Text>,
    },
    {
      title: 'Progress', dataIndex: 'pct', key: 'pct', width: 180,
      sorter: (a: PeriodRow, b: PeriodRow) => a.pct - b.pct,
      render: (v: number, row: PeriodRow) => {
        if (row.is_future) return <Text type="secondary">—</Text>
        const green = isRowGreen(row)
        const displayPct = row.target === 0 ? 100 : v
        return (
          <Progress
            percent={Math.min(Math.abs(displayPct), 100)}
            strokeColor={green ? '#10b981' : v < 0 ? '#ef4444' : '#4361ee'}
            trailColor="#f1f5f9"
            format={() => `${displayPct.toFixed(1)}%`}
            size="small"
            style={{ width: 130 }}
          />
        )
      },
    },
    {
      title: 'Status', key: 'status', width: 120, align: 'center' as const,
      sorter: (a: PeriodRow, b: PeriodRow) => Number(isRowGreen(a)) - Number(isRowGreen(b)),
      render: (_: any, row: PeriodRow) => {
        if (row.is_future) return <Tag color="default">Future</Tag>
        if (row.target === 0) return <Tag icon={<CheckCircleOutlined />} color="success">Zero Target</Tag>
        return row.achieved
          ? <Tag icon={<CheckCircleOutlined />} color="success">Done</Tag>
          : <Tag icon={<CloseCircleOutlined />} color="error">Pending</Tag>
      },
    },
  ]

  const achieved = rows.filter((r) => isRowGreen(r)).length
  const past = rows.filter((r) => !r.is_future).length
  const missedWeekKeys = isWeekly && showAnalysis
    ? rows.filter((r) => !r.is_future && !isRowGreen(r) && r.miss_analysis).map((r) => r.label)
    : []

  return (
    <>
      <style>{`
        .row-achieved td { background-color: #f0fdf4 !important; }
        .row-achieved:hover td { background-color: #dcfce7 !important; }
        .row-future td { opacity: 0.65; }
      `}</style>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        marginBottom: 12,
      }}>
        <Space wrap>
          <Badge count={achieved} overflowCount={999} style={{ backgroundColor: '#10b981' }} />
          <Text type="secondary">
            of {past} {isWeekly ? 'shown' : 'elapsed'} periods achieved
          </Text>
          {past > 0 && (
            <Tag color={achieved === past ? 'green' : achieved > past / 2 ? 'orange' : 'red'}>
              {((achieved / past) * 100).toFixed(0)}% hit rate
            </Tag>
          )}
        </Space>
        {isWeekly && (
          <Space size={8}>
            <BulbOutlined style={{ color: showAnalysis ? '#f59e0b' : '#94a3b8' }} />
            <Text style={{ fontSize: 13 }}>Why Target Missed Analysis</Text>
            <Switch
              size="small"
              checked={showAnalysis}
              onChange={setShowAnalysis}
              checkedChildren="Show"
              unCheckedChildren="Hide"
            />
          </Space>
        )}
      </div>

      {isMobile ? (
        <Space direction="vertical" style={{ width: '100%' }} size={10}>
          {rows.map((row) => {
            const green = isRowGreen(row)
            const displayPct = row.target === 0 && !row.is_future ? 100 : row.pct
            return (
              <Card
                key={row.label}
                size="small"
                style={{
                  borderRadius: 10,
                  borderColor: green ? '#bbf7d0' : row.is_future ? '#e2e8f0' : '#fecaca',
                  background: green ? '#f0fdf4' : '#ffffff',
                  opacity: row.is_future ? 0.7 : 1,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                  <Text strong style={{ fontSize: 13 }}>{row.label}</Text>
                  {row.is_future ? (
                    <Tag color="default">Future</Tag>
                  ) : row.target === 0 ? (
                    <Tag icon={<CheckCircleOutlined />} color="success">Zero Target</Tag>
                  ) : row.achieved ? (
                    <Tag icon={<CheckCircleOutlined />} color="success">Done</Tag>
                  ) : (
                    <Tag icon={<CloseCircleOutlined />} color="error">Pending</Tag>
                  )}
                </div>
                <Row gutter={[8, 6]} style={{ fontSize: 12, marginBottom: 8 }}>
                  <Col span={8}>
                    <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>Capital</Text>
                    <Text>{fmt(row.capital_base)}</Text>
                  </Col>
                  <Col span={8}>
                    <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>Target</Text>
                    <Text>{fmt(row.target)}</Text>
                  </Col>
                  <Col span={8}>
                    <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>P&amp;L</Text>
                    {row.is_future ? (
                      <Text type="secondary">—</Text>
                    ) : (
                      <Text strong style={{ color: row.pnl >= 0 ? '#10b981' : '#ef4444' }}>
                        {row.pnl >= 0 ? '+' : '-'}{fmt(row.pnl)}
                      </Text>
                    )}
                  </Col>
                </Row>
                {!row.is_future && (
                  <Progress
                    percent={Math.min(Math.abs(displayPct), 100)}
                    strokeColor={green ? '#10b981' : row.pnl < 0 ? '#ef4444' : '#4361ee'}
                    trailColor="#e2e8f0"
                    format={() => `${displayPct.toFixed(1)}%`}
                    size="small"
                  />
                )}
                {isWeekly && showAnalysis && !row.is_future && !green && row.miss_analysis && (
                  <div style={{ marginTop: 10 }}>
                    <MissAnalysisBox row={row} />
                  </div>
                )}
              </Card>
            )
          })}
        </Space>
      ) : (
        <Table
          dataSource={rows}
          columns={columns}
          rowKey="label"
          size="small"
          pagination={false}
          rowClassName={(row) => row.is_future ? 'row-future' : isRowGreen(row) ? 'row-achieved' : ''}
          expandable={isWeekly ? {
            expandedRowKeys: missedWeekKeys,
            showExpandColumn: false,
            expandedRowRender: (row) => <MissAnalysisBox row={row} />,
          } : undefined}
          scroll={{ y: 420, x: 750 }}
        />
      )}
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

  // Show only the 5 most recent elapsed/current weeks in All Periods Breakdown
  const visibleWeeks = a
    ? (() => {
        const elapsed = a.all_weeks.filter((w) => !w.is_future)
        return elapsed.length >= 5 ? elapsed.slice(-5) : a.all_weeks.slice(0, 5)
      })()
    : []

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
                  <CalendarOutlined />Weeks (Last 5)
                  {a && <Tag color="blue">{visibleWeeks.filter((w) => !w.is_future && (w.achieved || w.target === 0)).length}/{visibleWeeks.filter((w) => !w.is_future).length}</Tag>}
                </Space>
              ),
              children: a ? <PeriodTable rows={visibleWeeks} label="Week" isWeekly /> : null,
            },
          ]}
        />
      </Card>
    </Spin>
  )
}
