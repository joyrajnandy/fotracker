import { useState, useEffect, useCallback } from 'react'
import {
  Row, Col, Card, Statistic, Select, Button, Form, Input,
  InputNumber, DatePicker, Table, Typography, Space,
  message, Collapse, Tag, Spin, Tooltip, Modal, Progress, Slider, Upload, Alert,
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, RiseOutlined, FallOutlined,
  DollarOutlined, BankOutlined, PercentageOutlined, SwapOutlined,
  InfoCircleOutlined, EditOutlined, ForwardOutlined, ReloadOutlined,
  ThunderboltOutlined, PieChartOutlined, RobotOutlined, UploadOutlined,
  SyncOutlined, CheckCircleOutlined, WarningOutlined, DownloadOutlined,
} from '@ant-design/icons'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, Legend, ResponsiveContainer,
} from 'recharts'
import dayjs from 'dayjs'
import { homeApi, brokerCashApi, marketApi, aiApi } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import type { HomeSummary, Investment, Interest, BrokerCash, MarketIndex, AIInsights } from '@/types'

const { Title, Text } = Typography
const { Option } = Select
const { Panel } = Collapse

const HOLDING_TYPES = ['GSec', 'Mutual Fund'] as const

function fmt(val: number) {
  return `₹${Math.abs(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function fmtSigned(val: number) {
  return `${val >= 0 ? '+' : '-'}₹${Math.abs(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function HomePage() {
  const [financialYears, setFinancialYears] = useState<string[]>([])
  const [fy, setFy] = useState<string>('')
  const [summary, setSummary] = useState<HomeSummary | null>(null)
  const [investments, setInvestments] = useState<Investment[]>([])
  const [interests, setInterests] = useState<Interest[]>([])
  const [brokerCash, setBrokerCash] = useState<BrokerCash[]>([])
  const [indices, setIndices] = useState<MarketIndex[]>([])
  const [gsecBonds, setGsecBonds] = useState<any[]>([])
  const [aiInsights, setAiInsights] = useState<AIInsights | null>(null)
  const [marketLoading, setMarketLoading] = useState(false)
  const [ltpRefreshing, setLtpRefreshing] = useState(false)
  const [fetchingSingleLtp, setFetchingSingleLtp] = useState(false)
  const [loading, setLoading] = useState(true)
  const [simRate, setSimRate] = useState<number>(10)

  const [invForm] = Form.useForm()
  const [intForm] = Form.useForm()
  const [cashForm] = Form.useForm()
  const [editHoldingForm] = Form.useForm()
  const [editCashForm] = Form.useForm()
  const [editIntForm] = Form.useForm()

  const [editHoldingOpen, setEditHoldingOpen] = useState(false)
  const [editingHolding, setEditingHolding] = useState<Investment | null>(null)
  const [editCashOpen, setEditCashOpen] = useState(false)
  const [editingCash, setEditingCash] = useState<BrokerCash | null>(null)
  const [editIntOpen, setEditIntOpen] = useState(false)
  const [editingInt, setEditingInt] = useState<Interest | null>(null)
  const [carryModalOpen, setCarryModalOpen] = useState(false)
  const [carryLoading, setCarryLoading] = useState(false)

  // Live preview of Qty * Buy & Qty * LTP in Add Holding form
  const addQty = Form.useWatch('quantity', invForm) ?? 1
  const addBuy = Form.useWatch('buy_price', invForm) ?? 0
  const addLtp = Form.useWatch('ltp', invForm)

  const fetchMarket = useCallback(async () => {
    setMarketLoading(true)
    try {
      const { data } = await marketApi.getIndices()
      setIndices(data.indices || [])
    } catch {
      // silent fallback
    } finally {
      setMarketLoading(false)
    }
  }, [])

  useEffect(() => {
    const token = useAuthStore.getState().accessToken
    if (token && typeof EventSource !== 'undefined') {
      const es = new EventSource(`/api/v1/market/stream?token=${encodeURIComponent(token)}`)
      es.onmessage = (ev) => {
        try {
          const parsed = JSON.parse(ev.data)
          if (parsed?.indices) setIndices(parsed.indices)
        } catch { /* ignore */ }
      }
      es.onerror = () => {
        es.close()
        fetchMarket()
      }
      return () => es.close()
    }
    fetchMarket()
    const timer = setInterval(fetchMarket, 30000)
    return () => clearInterval(timer)
  }, [fetchMarket])

  useEffect(() => {
    homeApi.getFinancialYears().then(({ data }) => {
      setFinancialYears(data.years)
      setFy(data.current_fy || data.years[0])
    })
  }, [])

  const refreshData = useCallback(() => {
    if (!fy) return
    Promise.all([
      homeApi.getSummary(fy),
      homeApi.getInvestments(fy),
      homeApi.getInterests(fy),
      brokerCashApi.list(fy),
      aiApi.getInsights(fy).catch(() => ({ data: null })),
      marketApi.getGsec(fy).catch(() => ({ data: { my_bonds: [] } })),
    ]).then(([s, inv, int, bc, ai, gs]) => {
      setSummary(s.data)
      setInvestments(inv.data)
      setInterests(int.data)
      setBrokerCash(bc.data)
      setAiInsights(ai.data)
      setGsecBonds(gs.data?.my_bonds || [])
    }).finally(() => setLoading(false))
  }, [fy])

  useEffect(() => {
    if (!fy) return
    setLoading(true)
    refreshData()
  }, [fy, refreshData])

  // ── Live LTP helpers ──────────────────────────────────────────────────────
  async function fetchLtpForForm(formInstance: any) {
    const code = formInstance.getFieldValue('instrument_code')
    const name = formInstance.getFieldValue('name')
    const type = formInstance.getFieldValue('instrument_type')
    const queryCode = code || name
    if (!queryCode) {
      message.warning('Enter an Instrument Code or Name first (e.g. AMFI code 119551 or GOLDBEES.NS)')
      return
    }
    setFetchingSingleLtp(true)
    try {
      const { data } = await marketApi.getLtp(queryCode, type, name)
      formInstance.setFieldValue('ltp', data.ltp)
      if (!code && data.matched_code) {
        formInstance.setFieldValue('instrument_code', data.matched_code)
      }
      if (!name && data.name) {
        formInstance.setFieldValue('name', data.name)
      }
      message.success(`Live LTP fetched from ${data.source}: ₹${data.ltp}`)
    } catch (err: any) {
      message.error(err?.response?.data?.detail || 'Failed to fetch live LTP')
    } finally {
      setFetchingSingleLtp(false)
    }
  }

  async function refreshAllHoldingsLtp() {
    setLtpRefreshing(true)
    try {
      const { data } = await homeApi.refreshAllLtp(fy)
      message.success(`Updated live LTP for ${data.updated} of ${data.total} holding(s)`)
      if (data.failed?.length) {
        message.warning(`Could not match LTP for: ${data.failed.join(', ')}. Add AMFI code or NSE/BSE ticker.`)
      }
      refreshData()
    } catch {
      message.error('Failed to refresh LTPs')
    } finally {
      setLtpRefreshing(false)
    }
  }

  // ── CRUD Handlers ─────────────────────────────────────────────────────────
  async function addHolding(values: any) {
    try {
      await homeApi.addInvestment({
        instrument_type: values.instrument_type,
        instrument_code: values.instrument_code || null,
        name: values.name,
        quantity: values.quantity ?? 1,
        buy_price: values.buy_price,
        ltp: values.ltp ?? null,
        financial_year: fy,
      })
      message.success('Holding added')
      invForm.resetFields()
      refreshData()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || 'Failed to add holding')
    }
  }

  function openEditHolding(row: Investment) {
    setEditingHolding(row)
    editHoldingForm.setFieldsValue({
      instrument_type: row.instrument_type,
      instrument_code: row.instrument_code || '',
      name: row.name,
      quantity: Number(row.quantity ?? 1),
      buy_price: Number(row.buy_price ?? row.invested_value),
      ltp: row.ltp != null ? Number(row.ltp) : (row.current_value != null ? Number(row.current_value) / Number(row.quantity || 1) : null),
    })
    setEditHoldingOpen(true)
  }

  async function saveEditHolding(values: any) {
    if (!editingHolding) return
    try {
      await homeApi.updateInvestment(editingHolding.id, {
        instrument_type: values.instrument_type,
        instrument_code: values.instrument_code || null,
        name: values.name,
        quantity: values.quantity,
        buy_price: values.buy_price,
        ltp: values.ltp ?? null,
      })
      message.success('Holding updated')
      setEditHoldingOpen(false)
      refreshData()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || 'Failed to update holding')
    }
  }

  async function deleteHolding(id: number) {
    try {
      await homeApi.deleteInvestment(id)
      message.success('Holding removed')
      refreshData()
    } catch { message.error('Failed to delete holding') }
  }

  async function addCash(values: any) {
    try {
      await brokerCashApi.add({
        amount: values.amount,
        cash_date: values.cash_date.format('YYYY-MM-DD'),
        description: values.description || null,
        financial_year: fy,
      })
      message.success('Broker cash entry added')
      cashForm.resetFields()
      refreshData()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || 'Failed to add cash entry')
    }
  }

  async function handleCashCsvUpload(file: File) {
    try {
      const { data } = await brokerCashApi.uploadCsv(file)
      message.success(`CSV imported: ${data.inserted} added, ${data.skipped} skipped`)
      if (data.errors?.length) {
        message.warning(`Some rows had errors: ${data.errors[0]}`)
      }
      refreshData()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || 'CSV upload failed')
    }
    return false
  }

  function openEditCash(row: BrokerCash) {
    setEditingCash(row)
    editCashForm.setFieldsValue({
      amount: Number(row.amount),
      cash_date: dayjs(row.cash_date),
      description: row.description || '',
    })
    setEditCashOpen(true)
  }

  async function saveEditCash(values: any) {
    if (!editingCash) return
    try {
      await brokerCashApi.update(editingCash.id, {
        amount: values.amount,
        cash_date: values.cash_date.format('YYYY-MM-DD'),
        description: values.description || null,
      })
      message.success('Broker cash entry updated')
      setEditCashOpen(false)
      refreshData()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || 'Failed to update cash entry')
    }
  }

  async function deleteCash(id: number) {
    try {
      await brokerCashApi.delete(id, fy)
      message.success('Cash entry removed')
      refreshData()
    } catch { message.error('Failed to delete cash entry') }
  }

  async function addInterest(values: any) {
    try {
      await homeApi.addInterest({
        ...values,
        interest_date: values.interest_date.format('YYYY-MM-DD'),
        financial_year: fy,
      })
      message.success('Interest entry added')
      intForm.resetFields()
      refreshData()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || 'Failed to add interest')
    }
  }

  function openEditInterest(row: Interest) {
    setEditingInt(row)
    editIntForm.setFieldsValue({
      amount: Number(row.amount),
      interest_date: dayjs(row.interest_date),
      description: row.description || '',
    })
    setEditIntOpen(true)
  }

  async function saveEditInterest(values: any) {
    if (!editingInt) return
    try {
      await homeApi.updateInterest(editingInt.id, {
        amount: values.amount,
        interest_date: values.interest_date.format('YYYY-MM-DD'),
        description: values.description || null,
      })
      message.success('Interest entry updated')
      setEditIntOpen(false)
      refreshData()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || 'Failed to update interest')
    }
  }

  async function deleteInterest(id: number) {
    try {
      await homeApi.deleteInterest(id)
      message.success('Interest entry deleted')
      refreshData()
    } catch { message.error('Failed to delete interest') }
  }

  async function doCarryForward(values: any) {
    setCarryLoading(true)
    try {
      const { data } = await homeApi.carryForward(values.from_fy, values.to_fy)
      message.success(
        `Carried forward: ${data.investments_copied} holdings & ${data.cash_copied} cash entries to ${data.to_fy}`
      )
      setCarryModalOpen(false)
      if (values.to_fy === fy) refreshData()
    } catch (err: any) {
      message.error(err?.response?.data?.detail || 'Carry-forward failed')
    } finally {
      setCarryLoading(false)
    }
  }

  // ── Derived Metrics ───────────────────────────────────────────────────────
  const totalInvested = summary?.total_invested ?? 0
  const totalBrokerCash = summary?.total_broker_cash ?? 0
  const diff = summary?.broker_vs_invested_diff ?? 0
  const holdingPnl = summary?.total_holding_pnl ?? 0
  const fnoPnl = summary?.total_pnl ?? 0
  const totalInterest = summary?.total_interest ?? 0
  const totalProfit = summary?.total_profit ?? 0
  const netValue = summary?.net_value ?? 0
  const xirrPct = summary?.xirr != null ? (summary.xirr * 100).toFixed(2) : null

  const gsecTotal = investments
    .filter((i) => i.instrument_type === 'GSec')
    .reduce((s, r) => s + Number(r.invested_value), 0)
  const mfTotal = investments
    .filter((i) => i.instrument_type === 'Mutual Fund')
    .reduce((s, r) => s + Number(r.invested_value), 0)
  const cashBase = totalBrokerCash > 0 ? totalBrokerCash : Math.max(totalInvested, 1)

  // ── Table Columns (all sortable) ──────────────────────────────────────────
  const holdingColumns = [
    {
      title: 'Instrument', dataIndex: 'instrument_type', key: 'type', width: 120,
      sorter: (a: Investment, b: Investment) => a.instrument_type.localeCompare(b.instrument_type),
      render: (v: string) => <Tag color={v === 'GSec' ? 'geekblue' : 'purple'} style={{ fontWeight: 600 }}>{v}</Tag>,
    },
    {
      title: 'Code', dataIndex: 'instrument_code', key: 'code', width: 110,
      sorter: (a: Investment, b: Investment) => (a.instrument_code || '').localeCompare(b.instrument_code || ''),
      render: (v: string | null) => v ? <Tag>{v}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Name', dataIndex: 'name', key: 'name',
      sorter: (a: Investment, b: Investment) => a.name.localeCompare(b.name),
      render: (v: string) => <Text strong>{v}</Text>,
    },
    {
      title: 'Qty', dataIndex: 'quantity', key: 'qty', align: 'right' as const, width: 90,
      sorter: (a: Investment, b: Investment) => Number(a.quantity ?? 1) - Number(b.quantity ?? 1),
      render: (v: number | null) => (v != null ? Number(v).toLocaleString('en-IN', { maximumFractionDigits: 4 }) : '1'),
    },
    {
      title: 'Buy Value', dataIndex: 'buy_price', key: 'buy', align: 'right' as const, width: 110,
      sorter: (a: Investment, b: Investment) => Number(a.buy_price ?? a.invested_value) - Number(b.buy_price ?? b.invested_value),
      render: (v: number | null, row: Investment) => fmt(Number(v ?? row.invested_value)),
    },
    {
      title: 'LTP', dataIndex: 'ltp', key: 'ltp', align: 'right' as const, width: 110,
      sorter: (a: Investment, b: Investment) => Number(a.ltp ?? 0) - Number(b.ltp ?? 0),
      render: (v: number | null) => (
        <Text style={{ color: v != null ? '#2563eb' : '#94a3b8' }}>{v != null ? fmt(Number(v)) : '—'}</Text>
      ),
    },
    {
      title: 'Invested (Qty×Buy)', dataIndex: 'invested_value', key: 'invested',
      align: 'right' as const,
      sorter: (a: Investment, b: Investment) => Number(a.invested_value) - Number(b.invested_value),
      render: (v: number) => <Text strong>{fmt(v)}</Text>,
    },
    {
      title: 'Current Value (Qty×LTP)', dataIndex: 'current_value', key: 'cv',
      align: 'right' as const,
      sorter: (a: Investment, b: Investment) => Number(a.current_value ?? 0) - Number(b.current_value ?? 0),
      render: (v: number | null) => (
        <Text strong style={{ color: v != null ? '#2563eb' : '#94a3b8' }}>{v != null ? fmt(v) : '—'}</Text>
      ),
    },
    {
      title: 'Holding P&L', key: 'holding_pnl', align: 'right' as const,
      sorter: (a: Investment, b: Investment) => {
        const pa = a.current_value != null ? Number(a.current_value) - Number(a.invested_value) : 0
        const pb = b.current_value != null ? Number(b.current_value) - Number(b.invested_value) : 0
        return pa - pb
      },
      render: (_: any, row: Investment) => {
        if (row.current_value == null) return <Text type="secondary">—</Text>
        const pnl = Number(row.current_value) - Number(row.invested_value)
        return (
          <Text strong style={{ color: pnl >= 0 ? '#10b981' : '#ef4444' }}>{fmtSigned(pnl)}</Text>
        )
      },
    },
    {
      title: 'Actions', key: 'action', width: 90, align: 'center' as const,
      render: (_: any, row: Investment) => (
        <Space size={4}>
          <Button icon={<EditOutlined />} size="small" onClick={() => openEditHolding(row)} />
          <Button danger icon={<DeleteOutlined />} size="small" onClick={() => deleteHolding(row.id)} />
        </Space>
      ),
    },
  ]

  const cashColumns = [
    {
      title: 'Cash Added (₹)', dataIndex: 'amount', key: 'amount',
      align: 'right' as const,
      sorter: (a: BrokerCash, b: BrokerCash) => Number(a.amount) - Number(b.amount),
      render: (v: number) => <Text strong>{fmt(v)}</Text>,
    },
    {
      title: 'Date Added', dataIndex: 'cash_date', key: 'date', width: 140,
      sorter: (a: BrokerCash, b: BrokerCash) => a.cash_date.localeCompare(b.cash_date),
    },
    {
      title: 'Description', dataIndex: 'description', key: 'desc',
      sorter: (a: BrokerCash, b: BrokerCash) => (a.description || '').localeCompare(b.description || ''),
      render: (v: string) => v || '—',
    },
    {
      title: 'Actions', key: 'action', width: 100, align: 'center' as const,
      render: (_: any, row: BrokerCash) => (
        <Space size={4}>
          <Button icon={<EditOutlined />} size="small" onClick={() => openEditCash(row)} />
          <Button danger icon={<DeleteOutlined />} size="small" onClick={() => deleteCash(row.id)} />
        </Space>
      ),
    },
  ]

  const intColumns = [
    {
      title: 'Amount (₹)', dataIndex: 'amount', key: 'amount',
      align: 'right' as const,
      sorter: (a: Interest, b: Interest) => Number(a.amount) - Number(b.amount),
      render: (v: number) => fmt(v),
    },
    {
      title: 'Date', dataIndex: 'interest_date', key: 'date', width: 140,
      sorter: (a: Interest, b: Interest) => a.interest_date.localeCompare(b.interest_date),
    },
    {
      title: 'Description', dataIndex: 'description', key: 'desc',
      sorter: (a: Interest, b: Interest) => (a.description || '').localeCompare(b.description || ''),
      render: (v: string) => v || '—',
    },
    {
      title: 'Actions', key: 'action', width: 100, align: 'center' as const,
      render: (_: any, row: Interest) => (
        <Space size={4}>
          <Button icon={<EditOutlined />} size="small" onClick={() => openEditInterest(row)} />
          <Button danger icon={<DeleteOutlined />} size="small" onClick={() => deleteInterest(row.id)} />
        </Space>
      ),
    },
  ]

  return (
    <Spin spinning={loading}>
      {/* ── Live SENSEX & NIFTY 50 Market Pulse Bar ───────────────────────── */}
      <Card
        className="futuristic-hero"
        bodyStyle={{ padding: '12px 20px' }}
        style={{ marginBottom: 20 }}
      >
        <Row align="middle" justify="space-between" gutter={[16, 12]}>
          <Col>
            <Space size={10}>
              <span className="live-dot" />
              <Text strong style={{ color: '#f8fafc', fontSize: 13, letterSpacing: '0.05em' }}>
                LIVE MARKET PULSE
              </Text>
              <Tag color="cyan" style={{ margin: 0, fontSize: 11 }}>NSE / BSE</Tag>
            </Space>
          </Col>
          <Col flex="auto">
            <Row gutter={[24, 8]} justify="center">
              {(indices.length > 0 ? indices : [
                { symbol: 'NIFTY 50', price: null, change: null, change_pct: null, market_state: 'LOADING', live: false },
                { symbol: 'SENSEX', price: null, change: null, change_pct: null, market_state: 'LOADING', live: false },
              ]).map((idx) => {
                const isUp = (idx.change ?? 0) >= 0
                return (
                  <Col xs={24} sm={12} md="auto" key={idx.symbol}>
                    <Space wrap size={8} style={{
                      width: '100%',
                      justifyContent: 'space-between',
                      background: 'rgba(255,255,255,0.06)',
                      padding: '6px 12px',
                      borderRadius: 10,
                      border: '1px solid rgba(56, 189, 248, 0.25)',
                    }}>
                      <Text strong style={{ color: '#cbd5e1', fontSize: 12 }}>{idx.symbol}</Text>
                      {idx.live && idx.price != null ? (
                        <>
                          <Text strong className="num-tabular" style={{ color: '#ffffff', fontSize: 15 }}>
                            {idx.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </Text>
                          <Tag color={isUp ? 'success' : 'error'} style={{ margin: 0, fontWeight: 600 }}>
                            {isUp ? '▲' : '▼'} {Math.abs(idx.change ?? 0).toFixed(2)} ({isUp ? '+' : ''}{(idx.change_pct ?? 0).toFixed(2)}%)
                          </Tag>
                        </>
                      ) : (
                        <Text style={{ color: '#94a3b8', fontSize: 12 }}>Feed unavailable</Text>
                      )}
                    </Space>
                  </Col>
                )
              })}
            </Row>
          </Col>
          <Col>
            <Button
              size="small" ghost icon={<ReloadOutlined spin={marketLoading} />}
              onClick={fetchMarket} style={{ color: '#38bdf8', borderColor: 'rgba(56,189,248,0.4)' }}
            >
              Refresh
            </Button>
          </Col>
        </Row>
      </Card>

      {/* ── Page Header ───────────────────────────────────────────────────── */}
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 20 }} wrap>
        <div>
          <Title level={3} style={{ margin: 0, color: '#0f172a' }}>Portfolio Command Center</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Broker Cash Investment • GSec &amp; MF Holdings • AI Performance Strategist
          </Text>
        </div>
        <Space wrap>
          <Text type="secondary">Financial Year:</Text>
          <Select value={fy} onChange={setFy} style={{ width: 120 }}>
            {financialYears.map((y) => <Option key={y} value={y}>{y}</Option>)}
          </Select>
          <Button icon={<ForwardOutlined />} onClick={() => setCarryModalOpen(true)}>
            Carry Forward
          </Button>
          <Button
            icon={<DownloadOutlined />}
            onClick={async () => {
              const { data } = await homeApi.exportBackup()
              const url = window.URL.createObjectURL(new Blob([data]))
              const a = document.createElement('a')
              a.href = url
              a.download = 'fotracker-backup.json'
              a.click()
              window.URL.revokeObjectURL(url)
            }}
          >
            Backup
          </Button>
          <Upload
            accept=".json"
            showUploadList={false}
            beforeUpload={async (file) => {
              try {
                const { data } = await homeApi.restoreBackup(file)
                const r = data.restored
                message.success(`Restored: ${r.broker_cash} cash, ${r.investments} holdings, ${r.interests} interests, ${r.trades} trades`)
                refreshData()
              } catch {
                message.error('Restore failed')
              }
              return false
            }}
          >
            <Button icon={<UploadOutlined />}>Restore</Button>
          </Upload>
        </Space>
      </Space>

      {/* ── GSec Next Coupon Payoff Information Banner ────────────────────── */}
      {gsecBonds.length > 0 && (() => {
        const sorted = [...gsecBonds]
          .filter((b) => b.next_payoff_date && b.next_payoff_amount > 0)
          .sort((a, b) => a.next_payoff_date.localeCompare(b.next_payoff_date))
        if (!sorted.length) return null
        const soonest = sorted[0]
        const totalSemiAnnual = sorted.reduce((s, b) => s + Number(b.next_payoff_amount || 0), 0)
        return (
          <Alert
            type="info"
            showIcon
            icon={<BankOutlined style={{ color: '#4f46e5' }} />}
            style={{
              marginBottom: 20,
              borderRadius: 12,
              background: 'linear-gradient(90deg, #eef2ff 0%, #f0f9ff 100%)',
              border: '1px solid #c7d2fe',
            }}
            message={
              <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
                <Text strong style={{ color: '#1e1b4b' }}>
                  Upcoming GSec Coupon Payoff: Next on{' '}
                  <Tag color="geekblue" style={{ margin: '0 4px', fontWeight: 700 }}>
                    {dayjs(soonest.next_payoff_date).format('DD MMM YYYY')}
                  </Tag>
                  ({soonest.symbol}: <span style={{ color: '#059669' }}>{fmt(soonest.next_payoff_amount)}</span>)
                </Text>
                <Tag color="purple" style={{ fontWeight: 600 }}>
                  Total Semi-Annual GSec Interest: {fmt(totalSemiAnnual)}
                </Tag>
              </Space>
            }
            description={
              <Space wrap size={[12, 6]} style={{ marginTop: 6 }}>
                {sorted.map((b) => (
                  <Tag key={b.id} color="blue" style={{ padding: '2px 8px', borderRadius: 6 }}>
                    <strong>{b.symbol}</strong> ({b.coupon_rate}%): {fmt(b.next_payoff_amount)} on{' '}
                    {dayjs(b.next_payoff_date).format('DD MMM YYYY')}
                  </Tag>
                ))}
              </Space>
            }
          />
        )
      })()}

      {/* ── XIRR & Total Profit Hero Card ─────────────────────────────────── */}
      <Card className="futuristic-hero" style={{ marginBottom: 20 }}>
        <Row gutter={[24, 16]} align="middle">
          <Col xs={24} md={7}>
            <Space direction="vertical" size={2}>
              <Space>
                <PercentageOutlined style={{ color: '#38bdf8', fontSize: 18 }} />
                <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>PORTFOLIO XIRR</Text>
                <Tooltip title="Annualised XIRR calculated from your broker cash deposit dates as outflows and today's Net Portfolio Value as terminal inflow.">
                  <InfoCircleOutlined style={{ color: 'rgba(255,255,255,0.45)' }} />
                </Tooltip>
              </Space>
              <Text className="num-tabular" style={{ fontSize: 34, fontWeight: 800 }}>
                {xirrPct != null
                  ? <span style={{ color: parseFloat(xirrPct) >= 0 ? '#34d399' : '#fb7185' }}>{xirrPct}%</span>
                  : <span style={{ color: '#94a3b8', fontSize: 18 }}>Add cash to compute</span>}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>
                Annualised return on broker cash added
                {totalBrokerCash > 0 && (
                  <> • Abs Return: <strong style={{ color: totalProfit >= 0 ? '#34d399' : '#fb7185' }}>
                    {((totalProfit / totalBrokerCash) * 100).toFixed(2)}%
                  </strong></>
                )}
              </Text>
            </Space>
          </Col>

          <Col xs={24} md={17}>
            <Row gutter={[16, 12]}>
              {[
                { label: 'Broker Cash (Investment)', val: totalBrokerCash, color: '#f8fafc' },
                {
                  label: 'Total Profit (Holdings + F&O + Int)',
                  val: totalProfit,
                  color: totalProfit >= 0 ? '#34d399' : '#fb7185',
                  signed: true,
                },
                { label: 'Net Portfolio Value', val: netValue, color: '#fbbf24' },
                {
                  label: 'Undeployed Cash (Broker - Holdings)',
                  val: diff,
                  color: diff >= 0 ? '#38bdf8' : '#fb7185',
                  signed: true,
                },
              ].map((s) => (
                <Col xs={12} sm={6} key={s.label}>
                  <div style={{
                    background: 'rgba(255,255,255,0.05)',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(255,255,255,0.09)',
                  }}>
                    <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, display: 'block' }}>
                      {s.label}
                    </Text>
                    <Text className="num-tabular" style={{ color: s.color, fontSize: 17, fontWeight: 700 }}>
                      {s.signed ? fmtSigned(s.val) : fmt(s.val)}
                    </Text>
                  </div>
                </Col>
              ))}
            </Row>
          </Col>
        </Row>
      </Card>

      {/* ── 7 Enterprise Stat Cards (F&O P&L and Interest are SEPARATE) ───── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        {[
          { label: 'Broker Cash (Investment)', val: totalBrokerCash, cls: 'stat-card-blue', tip: 'Total cash added to your broking agency' },
          { label: 'Holdings Invested (GSec/MF)', val: totalInvested, cls: 'stat-card-purple', tip: 'Qty × Buy Value across GSec & Mutual Funds' },
          { label: 'Undeployed Cash', val: diff, cls: diff >= 0 ? 'stat-card-cyan' : 'stat-card-red', tip: 'Broker Cash minus Holdings Invested', signed: true },
          { label: 'Total Profit', val: totalProfit, cls: totalProfit >= 0 ? 'stat-card-green' : 'stat-card-red', tip: 'Holdings P&L + F&O P&L + Interest', signed: true },
          { label: 'Holdings P&L (GSec/MF)', val: holdingPnl, cls: holdingPnl >= 0 ? 'stat-card-green' : 'stat-card-red', tip: 'Current Value minus Invested Value', signed: true },
          { label: 'F&O P&L (Net of Brokerage)', val: fnoPnl, cls: fnoPnl >= 0 ? 'stat-card-orange' : 'stat-card-red', tip: `After ₹${(summary?.total_brokerage ?? 0).toLocaleString('en-IN')} brokerage`, signed: true },
          { label: 'Interest Accumulated', val: totalInterest, cls: 'stat-card-green', tip: 'Total interest / dividend credited' },
        ].map((s) => (
          <Col xs={24} sm={12} lg={6} key={s.label}>
            <Tooltip title={s.tip}>
              <Card className={s.cls} style={{ borderRadius: 14, border: 'none' }}>
                <Statistic
                  title={<Text style={{ color: 'rgba(255,255,255,0.88)', fontSize: 12 }}>{s.label}</Text>}
                  value={Math.abs(s.val)}
                  prefix={s.signed && s.val < 0 ? '- ₹' : '₹'}
                  valueStyle={{ color: '#fff', fontSize: 19, fontWeight: 700 }}
                  formatter={(v) => Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                />
              </Card>
            </Tooltip>
          </Col>
        ))}
      </Row>

      {/* ── AI Portfolio Strategist ───────────────────────────────────────── */}
      {aiInsights && (
        <Card className="ai-card" style={{ marginBottom: 20 }}>
          <Row gutter={[20, 16]} align="middle">
            <Col xs={24} md={6} style={{ textAlign: 'center' }}>
              <Space direction="vertical" size={4}>
                <Space>
                  <RobotOutlined style={{ fontSize: 20, color: '#a78bfa' }} />
                  <Text strong style={{ color: '#e2e8f0', fontSize: 13 }}>AI STRATEGIST</Text>
                </Space>
                <Progress
                  type="dashboard"
                  percent={aiInsights.health_score}
                  size={100}
                  strokeColor={{ '0%': '#06b6d4', '100%': '#8b5cf6' }}
                  trailColor="rgba(255,255,255,0.12)"
                  format={(p) => <span style={{ color: '#fff', fontWeight: 700 }}>{p}</span>}
                />
                <Tag color="purple" style={{ margin: 0 }}>{aiInsights.headline}</Tag>
              </Space>
            </Col>
            <Col xs={24} md={18}>
              <Row gutter={[12, 12]}>
                {aiInsights.suggestions.map((s, idx) => (
                  <Col xs={24} sm={12} key={idx}>
                    <div style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(167,139,250,0.25)',
                      borderRadius: 10,
                      padding: '10px 12px',
                      height: '100%',
                    }}>
                      <Space size={6} style={{ marginBottom: 4 }}>
                        {s.type === 'success' ? <CheckCircleOutlined style={{ color: '#34d399' }} />
                          : s.type === 'warning' ? <WarningOutlined style={{ color: '#fbbf24' }} />
                          : <InfoCircleOutlined style={{ color: '#38bdf8' }} />}
                        <Text strong style={{ color: '#f8fafc', fontSize: 12 }}>{s.title}</Text>
                      </Space>
                      <Text style={{ color: 'rgba(226,232,240,0.78)', fontSize: 12, display: 'block' }}>
                        {s.detail}
                      </Text>
                    </div>
                  </Col>
                ))}
              </Row>
            </Col>
          </Row>
        </Card>
      )}

      {/* ── Capital Allocation & Interactive Target Simulator ─────────────── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={24} lg={12}>
          <Card
            className="enterprise-card"
            title={<Space><PieChartOutlined style={{ color: '#4f46e5' }} /><span>Capital Allocation &amp; Profit Attribution</span></Space>}
            style={{ height: '100%' }}
          >
            <Space direction="vertical" style={{ width: '100%' }} size={14}>
              <div>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Text strong style={{ fontSize: 12 }}>GSec Holdings</Text>
                  <Text className="num-tabular" style={{ fontSize: 12 }}>{fmt(gsecTotal)} ({((gsecTotal / cashBase) * 100).toFixed(1)}%)</Text>
                </Space>
                <Progress percent={Math.min(100, Number(((gsecTotal / cashBase) * 100).toFixed(1)))} strokeColor="#2563eb" showInfo={false} />
              </div>
              <div>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Text strong style={{ fontSize: 12 }}>Mutual Fund Holdings</Text>
                  <Text className="num-tabular" style={{ fontSize: 12 }}>{fmt(mfTotal)} ({((mfTotal / cashBase) * 100).toFixed(1)}%)</Text>
                </Space>
                <Progress percent={Math.min(100, Number(((mfTotal / cashBase) * 100).toFixed(1)))} strokeColor="#7c3aed" showInfo={false} />
              </div>
              <div>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Text strong style={{ fontSize: 12 }}>Undeployed Cash / F&amp;O Margin</Text>
                  <Text className="num-tabular" style={{ fontSize: 12 }}>{fmt(Math.max(0, diff))} ({((Math.max(0, diff) / cashBase) * 100).toFixed(1)}%)</Text>
                </Space>
                <Progress percent={Math.min(100, Number(((Math.max(0, diff) / cashBase) * 100).toFixed(1)))} strokeColor="#06b6d4" showInfo={false} />
              </div>
              <Row gutter={8} style={{ paddingTop: 6 }}>
                <Col span={8}>
                  <Tag color={holdingPnl >= 0 ? 'green' : 'red'} style={{ width: '100%', textAlign: 'center', padding: '4px 0' }}>
                    Holdings: {fmtSigned(holdingPnl)}
                  </Tag>
                </Col>
                <Col span={8}>
                  <Tag color={fnoPnl >= 0 ? 'blue' : 'red'} style={{ width: '100%', textAlign: 'center', padding: '4px 0' }}>
                    F&amp;O: {fmtSigned(fnoPnl)}
                  </Tag>
                </Col>
                <Col span={8}>
                  <Tag color="gold" style={{ width: '100%', textAlign: 'center', padding: '4px 0' }}>
                    Interest: +{fmt(totalInterest)}
                  </Tag>
                </Col>
              </Row>
            </Space>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            className="enterprise-card"
            title={<Space><ThunderboltOutlined style={{ color: '#f59e0b' }} /><span>Interactive Target Return Simulator</span></Space>}
            extra={<Tag color="geekblue">{simRate}% p.a.</Tag>}
            style={{ height: '100%' }}
          >
            <Text type="secondary" style={{ fontSize: 12 }}>
              Slide annual return target on your <Text strong>{fmt(totalBrokerCash)}</Text> broker capital:
            </Text>
            <Slider
              min={5} max={36} step={1} value={simRate} onChange={setSimRate}
              marks={{ 5: '5%', 10: '10%', 18: '18%', 24: '24%', 36: '36%' }}
              style={{ marginTop: 12, marginBottom: 24 }}
            />
            <Row gutter={[12, 12]}>
              {[
                { label: 'Yearly Goal', val: totalBrokerCash * (simRate / 100) },
                { label: 'Quarterly Goal', val: (totalBrokerCash * (simRate / 100)) / 4 },
                { label: 'Monthly Goal', val: (totalBrokerCash * (simRate / 100)) / 12 },
                { label: 'Weekly Goal', val: (totalBrokerCash * (simRate / 100)) / 52 },
              ].map((g) => (
                <Col span={12} key={g.label}>
                  <div style={{ background: '#f8fafc', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{g.label}</Text>
                    <Text strong className="num-tabular" style={{ fontSize: 15, color: '#0f172a' }}>{fmt(g.val)}</Text>
                  </div>
                </Col>
              ))}
            </Row>
          </Card>
        </Col>
      </Row>

      {/* ── Growth Chart ──────────────────────────────────────────────────── */}
      <Card className="enterprise-card" title="Portfolio Growth Trajectory" style={{ marginBottom: 20 }}>
        {summary?.growth_data?.length ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={summary.growth_data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 12 }} />
              <ReTooltip formatter={(v: number) => fmt(v)} />
              <Legend />
              <Line type="monotone" dataKey="invested" stroke="#3b82f6" strokeWidth={2} dot={false} name="Broker Capital" />
              <Line type="monotone" dataKey="returns" stroke="#10b981" strokeWidth={2} dot={false} name="Cumulative Returns" />
              <Line type="monotone" dataKey="net_value" stroke="#f59e0b" strokeWidth={2} dot={false} name="Net Value" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>No trade / interest data yet.</div>
        )}
      </Card>

      {/* ── Add Forms ─────────────────────────────────────────────────────────── */}
      <Collapse defaultActiveKey={[]} style={{ marginBottom: 20 }}>
        <Panel header="💰 Add Cash to Broking Agency (Manual or CSV Upload)" key="broker_cash">
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Form form={cashForm} layout="inline" onFinish={addCash}>
              <Form.Item name="amount" rules={[{ required: true, message: 'Enter amount' }]}>
                <InputNumber placeholder="Amount (₹)" prefix="₹" style={{ width: 170 }} min={1} step={1000} />
              </Form.Item>
              <Form.Item name="cash_date" rules={[{ required: true, message: 'Select date' }]}>
                <DatePicker placeholder="Date added" />
              </Form.Item>
              <Form.Item name="description">
                <Input placeholder="Description (optional)" style={{ width: 200 }} />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>Add Cash</Button>
              </Form.Item>
              <Form.Item>
                <Upload accept=".csv" showUploadList={false} beforeUpload={handleCashCsvUpload}>
                  <Button icon={<UploadOutlined />}>Upload Cash CSV</Button>
                </Upload>
              </Form.Item>
            </Form>
            <Text type="secondary" style={{ fontSize: 12 }}>
              CSV format: <code>Date,Amount</code> (e.g. <code>2026-08-18,80000</code>). Financial year is auto-detected from Date.
            </Text>
          </Space>
        </Panel>

        <Panel header="🏛️ Add Holding (GSec / Mutual Fund Only)" key="investment">
          <Form form={invForm} layout="vertical" onFinish={addHolding}>
            <Row gutter={[12, 8]} align="bottom">
              <Col xs={24} sm={8} md={4}>
                <Form.Item name="instrument_type" label="Instrument" rules={[{ required: true }]}>
                  <Select placeholder="Type">
                    {HOLDING_TYPES.map((t) => <Option key={t} value={t}>{t}</Option>)}
                  </Select>
                </Form.Item>
              </Col>
              <Col xs={24} sm={16} md={5}>
                <Form.Item name="instrument_code" label="Instrument Code">
                  <Input
                    placeholder="e.g. 119551 / 734GS2064-GS"
                    addonAfter={
                      <Tooltip title="Fetch Live LTP / NAV">
                        <SyncOutlined
                          spin={fetchingSingleLtp}
                          onClick={() => fetchLtpForForm(invForm)}
                          style={{ cursor: 'pointer', color: '#4f46e5' }}
                        />
                      </Tooltip>
                    }
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={5}>
                <Form.Item name="name" label="Name" rules={[{ required: true }]}>
                  <Input placeholder="Scheme / Bond Name" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={2}>
                <Form.Item name="quantity" label="Qty" initialValue={1} rules={[{ required: true }]}>
                  <InputNumber min={0.0001} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8} md={3}>
                <Form.Item name="buy_price" label="Buy Value" rules={[{ required: true }]}>
                  <InputNumber min={0.01} prefix="₹" style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8} md={3}>
                <Form.Item name="ltp" label="LTP">
                  <InputNumber min={0} prefix="₹" style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8} md={2}>
                <Form.Item>
                  <Button type="primary" htmlType="submit" icon={<PlusOutlined />} block>Add</Button>
                </Form.Item>
              </Col>
            </Row>
            <Space size={16}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Auto Invested: <Text strong>{fmt(Number(addQty || 0) * Number(addBuy || 0))}</Text>
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Auto Current Value: <Text strong style={{ color: '#2563eb' }}>
                  {addLtp != null ? fmt(Number(addQty || 0) * Number(addLtp)) : '—'}
                </Text>
              </Text>
            </Space>
          </Form>
        </Panel>

        <Panel header="➕ Add Interest Accumulated" key="interest">
          <Form form={intForm} layout="inline" onFinish={addInterest}>
            <Form.Item name="amount" rules={[{ required: true }]}>
              <InputNumber placeholder="Amount (₹)" prefix="₹" style={{ width: 160 }} min={1} />
            </Form.Item>
            <Form.Item name="interest_date" rules={[{ required: true }]}>
              <DatePicker placeholder="Date" />
            </Form.Item>
            <Form.Item name="description">
              <Input placeholder="Description (optional)" style={{ width: 220 }} />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>Add Interest</Button>
            </Form.Item>
          </Form>
        </Panel>
      </Collapse>

      {/* ── Expandable / Collapsible Portfolio Tables ─────────────────────── */}
      <Collapse defaultActiveKey={[]} style={{ marginBottom: 20 }}>
        <Panel
          key="cash"
          header={
            <Space wrap>
              <BankOutlined style={{ color: '#2563eb' }} />
              <Text strong>All Broker Cash Entries</Text>
              <Tag color="blue">{brokerCash.length} entries • {fmt(totalBrokerCash)}</Tag>
            </Space>
          }
        >
          <Table dataSource={brokerCash} columns={cashColumns} rowKey="id" size="small" pagination={false} scroll={{ x: 640 }}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} align="right"><Text strong>{fmt(totalBrokerCash)}</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={1}><Text strong>Total Cash Added</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={2} colSpan={2} />
              </Table.Summary.Row>
            )}
          />
        </Panel>

        <Panel
          key="holdings"
          header={
            <Space wrap>
              <Text strong>Holdings (GSec &amp; Mutual Funds)</Text>
              <Tag color="purple">Invested: {fmt(totalInvested)}</Tag>
              <Tag color={holdingPnl >= 0 ? 'green' : 'red'}>Holding P&amp;L: {fmtSigned(holdingPnl)}</Tag>
              <Tag color={diff >= 0 ? 'cyan' : 'red'}>Undeployed Cash: {fmtSigned(diff)}</Tag>
            </Space>
          }
          extra={
            <Button
              size="small" icon={<SyncOutlined spin={ltpRefreshing} />}
              loading={ltpRefreshing}
              onClick={(e) => { e.stopPropagation(); refreshAllHoldingsLtp() }}
            >
              Refresh Live LTPs
            </Button>
          }
        >
          <Table dataSource={investments} columns={holdingColumns} rowKey="id" size="small" pagination={false} scroll={{ x: 960 }}
            summary={() => {
              const totalCv = investments.reduce((s, r) => r.current_value != null ? s + Number(r.current_value) : s, 0)
              return (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={6}><Text strong>Total Holdings</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={6} align="right"><Text strong>{fmt(totalInvested)}</Text></Table.Summary.Cell>
                  <Table.Summary.Cell index={7} align="right">
                    <Text strong style={{ color: '#2563eb' }}>{totalCv > 0 ? fmt(totalCv) : '—'}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={8} align="right">
                    <Text strong style={{ color: holdingPnl >= 0 ? '#10b981' : '#ef4444' }}>{fmtSigned(holdingPnl)}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={9} />
                </Table.Summary.Row>
              )
            }}
          />
        </Panel>

        <Panel
          key="interest"
          header={
            <Space wrap>
              <Text strong>Interest Accumulated</Text>
              <Tag color="green">{interests.length} entries • {fmt(totalInterest)}</Tag>
            </Space>
          }
        >
          <Table dataSource={interests} columns={intColumns} rowKey="id" size="small" pagination={{ pageSize: 10 }} scroll={{ x: 600 }} />
        </Panel>
      </Collapse>

      {/* ── Edit Holding Modal ────────────────────────────────────────────── */}
      <Modal
        title={`Edit Holding — ${editingHolding?.name ?? ''}`}
        open={editHoldingOpen}
        onCancel={() => setEditHoldingOpen(false)}
        onOk={() => editHoldingForm.submit()}
        okText="Save Changes"
      >
        <Form form={editHoldingForm} layout="vertical" onFinish={saveEditHolding}>
          <Form.Item name="instrument_type" label="Instrument" rules={[{ required: true }]}>
            <Select>{HOLDING_TYPES.map((t) => <Option key={t} value={t}>{t}</Option>)}</Select>
          </Form.Item>
          <Form.Item name="instrument_code" label="Instrument Code">
            <Input
              placeholder="e.g. 119551 or GOLDBEES.NS"
              addonAfter={
                <SyncOutlined
                  spin={fetchingSingleLtp}
                  onClick={() => fetchLtpForForm(editHoldingForm)}
                  style={{ cursor: 'pointer', color: '#4f46e5' }}
                />
              }
            />
          </Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="quantity" label="Qty" rules={[{ required: true }]}>
                <InputNumber min={0.0001} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="buy_price" label="Buy Value (₹)" rules={[{ required: true }]}>
                <InputNumber min={0.01} prefix="₹" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="ltp" label="LTP (₹)">
                <InputNumber min={0} prefix="₹" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* ── Edit Broker Cash Modal ────────────────────────────────────────── */}
      <Modal
        title="Edit Broker Cash Entry"
        open={editCashOpen}
        onCancel={() => setEditCashOpen(false)}
        onOk={() => editCashForm.submit()}
        okText="Save Changes"
      >
        <Form form={editCashForm} layout="vertical" onFinish={saveEditCash}>
          <Form.Item name="amount" label="Amount (₹)" rules={[{ required: true }]}>
            <InputNumber min={1} prefix="₹" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="cash_date" label="Date Added" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Edit Interest Modal ───────────────────────────────────────────── */}
      <Modal
        title="Edit Interest Entry"
        open={editIntOpen}
        onCancel={() => setEditIntOpen(false)}
        onOk={() => editIntForm.submit()}
        okText="Save Changes"
      >
        <Form form={editIntForm} layout="vertical" onFinish={saveEditInterest}>
          <Form.Item name="amount" label="Amount (₹)" rules={[{ required: true }]}>
            <InputNumber min={1} prefix="₹" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="interest_date" label="Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Carry Forward Modal ───────────────────────────────────────────── */}
      <Modal
        title="📦 Carry Forward Holdings & Cash to Next FY"
        open={carryModalOpen}
        onCancel={() => setCarryModalOpen(false)}
        footer={null}
      >
        <Form layout="vertical" onFinish={doCarryForward} initialValues={{ from_fy: financialYears[1] ?? '', to_fy: financialYears[0] ?? '' }}>
          <Form.Item name="from_fy" label="Copy FROM Financial Year" rules={[{ required: true }]}>
            <Select>{financialYears.map((y) => <Option key={y} value={y}>{y}</Option>)}</Select>
          </Form.Item>
          <Form.Item name="to_fy" label="Copy INTO Financial Year" rules={[{ required: true }]}>
            <Select>{financialYears.map((y) => <Option key={y} value={y}>{y}</Option>)}</Select>
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={carryLoading} block icon={<ForwardOutlined />}>
              Carry Forward Holdings &amp; Cash
            </Button>
          </Form.Item>
          <Alert type="info" showIcon message="Only GSec & Mutual Fund holdings and Broker Cash are carried forward." />
        </Form>
      </Modal>
    </Spin>
  )
}
