import { useState, useEffect } from 'react'
import {
  Card, Table, Button, Upload, Space, Select, Typography,
  Tag, Modal, Descriptions, Progress, message, Row, Col, Spin, Grid, Popconfirm,
} from 'antd'
import { UploadOutlined, FilterOutlined, ReloadOutlined, DeleteOutlined } from '@ant-design/icons'
import type { UploadProps } from 'antd'
import { tradebookApi, homeApi } from '@/services/api'
import type { Trade, TradeListResponse, TradeUploadResponse } from '@/types'

const { Title, Text } = Typography
const { Option } = Select

export default function TradeBookPage() {
  const screens = Grid.useBreakpoint()
  const [financialYears, setFinancialYears] = useState<string[]>([])
  const [fy, setFy] = useState('')
  const [data, setData] = useState<TradeListResponse | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [uploadResult, setUploadResult] = useState<TradeUploadResponse | null>(null)
  const [filterSymbol, setFilterSymbol] = useState('')
  const [filterType, setFilterType] = useState('')

  useEffect(() => {
    homeApi.getFinancialYears().then(({ data: d }) => {
      setFinancialYears(d.years)
      setFy(d.years[0])
    })
  }, [])

  useEffect(() => {
    if (fy) fetchTrades(1)
  }, [fy, filterSymbol, filterType])

  async function fetchTrades(p = page) {
    setLoading(true)
    try {
      const { data: res } = await tradebookApi.getTrades({
        financial_year: fy,
        page: p,
        page_size: 15,
        symbol: filterSymbol || undefined,
        trade_type: filterType || undefined,
      })
      setData(res)
      setPage(p)
    } finally {
      setLoading(false)
    }
  }

  async function clearFyTrades() {
    if (!fy) return
    setLoading(true)
    try {
      const { data: res } = await tradebookApi.deleteTrades(fy)
      message.success(`Deleted ${res.deleted} trades for FY ${fy}`)
      fetchTrades(1)
    } catch {
      message.error('Failed to delete trades')
    } finally {
      setLoading(false)
    }
  }

  const uploadProps: UploadProps = {
    accept: '.csv',
    showUploadList: false,
    beforeUpload: async (file) => {
      setLoading(true)
      try {
        const { data: res } = await tradebookApi.upload(file)
        setUploadResult(res)
        fetchTrades(1)
      } catch (err: any) {
        message.error(err?.response?.data?.detail || 'Upload failed')
      } finally {
        setLoading(false)
      }
      return false
    },
  }

  const columns = [
    { title: 'Symbol', dataIndex: 'symbol', key: 'symbol', fixed: (screens.md ? 'left' : undefined) as 'left' | undefined, width: 180,
      sorter: (a: Trade, b: Trade) => a.symbol.localeCompare(b.symbol),
      render: (v: string) => <Text strong style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Type', dataIndex: 'trade_type', key: 'type', width: 80,
      sorter: (a: Trade, b: Trade) => a.trade_type.localeCompare(b.trade_type),
      render: (v: string) => <Tag color={v === 'buy' ? 'green' : 'red'}>{v.toUpperCase()}</Tag> },
    { title: 'Trade Date', dataIndex: 'trade_date', key: 'trade_date', width: 110,
      sorter: (a: Trade, b: Trade) => a.trade_date.localeCompare(b.trade_date) },
    { title: 'Expiry', dataIndex: 'expiry_date', key: 'expiry', width: 110,
      sorter: (a: Trade, b: Trade) => (a.expiry_date || '').localeCompare(b.expiry_date || ''),
      render: (v: string) => v || '—' },
    { title: 'Qty', dataIndex: 'quantity', key: 'qty', align: 'right' as const, width: 90,
      sorter: (a: Trade, b: Trade) => Number(a.quantity) - Number(b.quantity),
      render: (v: number) => Number(v).toLocaleString() },
    { title: 'Price (₹)', dataIndex: 'price', key: 'price', align: 'right' as const, width: 100,
      sorter: (a: Trade, b: Trade) => Number(a.price) - Number(b.price),
      render: (v: number) => `₹${Number(v).toFixed(2)}` },
    { title: 'Value (₹)', key: 'value', align: 'right' as const, width: 120,
      sorter: (a: Trade, b: Trade) => (Number(a.quantity) * Number(a.price)) - (Number(b.quantity) * Number(b.price)),
      render: (_: any, row: Trade) =>
        `₹${(Number(row.quantity) * Number(row.price)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` },
    { title: 'Exchange', dataIndex: 'exchange', key: 'exchange', width: 90,
      sorter: (a: Trade, b: Trade) => a.exchange.localeCompare(b.exchange) },
    { title: 'Segment', dataIndex: 'segment', key: 'segment', width: 80,
      sorter: (a: Trade, b: Trade) => a.segment.localeCompare(b.segment) },
    { title: 'Order Exec Time', dataIndex: 'order_execution_time', key: 'oet', width: 170,
      sorter: (a: Trade, b: Trade) => a.order_execution_time.localeCompare(b.order_execution_time),
      render: (v: string) => new Date(v).toLocaleString('en-IN') },
    { title: 'Trade ID', dataIndex: 'trade_id', key: 'tid', width: 100,
      sorter: (a: Trade, b: Trade) => a.trade_id.localeCompare(b.trade_id),
      render: (v: string) => <Text type="secondary" style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'FY', dataIndex: 'financial_year', key: 'fy', width: 90,
      sorter: (a: Trade, b: Trade) => a.financial_year.localeCompare(b.financial_year) },
  ]

  return (
    <Spin spinning={loading}>
      {/* Header */}
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 20 }} wrap>
        <Title level={3} style={{ margin: 0 }}>Trade Book</Title>
        <Space wrap>
          <Select value={fy} onChange={(v) => setFy(v)} style={{ width: 120 }}>
            {financialYears.map((y) => <Option key={y} value={y}>{y}</Option>)}
          </Select>
          <Upload {...uploadProps}>
            <Button type="primary" icon={<UploadOutlined />}>Upload CSV</Button>
          </Upload>
          <Button icon={<ReloadOutlined />} onClick={() => fetchTrades(1)}>Refresh</Button>
          <Popconfirm
            title={`Delete all trades for FY ${fy}?`}
            description="You can re-upload the CSV right after deleting."
            onConfirm={clearFyTrades}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Button danger icon={<DeleteOutlined />}>Delete Trades</Button>
          </Popconfirm>
        </Space>
      </Space>

      {/* Upload result modal */}
      <Modal
        title="Upload Result"
        open={!!uploadResult}
        onOk={() => setUploadResult(null)}
        onCancel={() => setUploadResult(null)}
        footer={[<Button key="ok" type="primary" onClick={() => setUploadResult(null)}>OK</Button>]}
      >
        {uploadResult && (
          <>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="Total Rows">{uploadResult.total_rows}</Descriptions.Item>
              <Descriptions.Item label="Inserted">{uploadResult.inserted}</Descriptions.Item>
              <Descriptions.Item label="Skipped (Duplicates)">{uploadResult.skipped_duplicates}</Descriptions.Item>
              <Descriptions.Item label="Errors">{uploadResult.errors.length}</Descriptions.Item>
            </Descriptions>
            <Progress
              percent={Math.round((uploadResult.inserted / (uploadResult.total_rows || 1)) * 100)}
              status={uploadResult.errors.length > 0 ? 'exception' : 'success'}
              style={{ marginTop: 16 }}
            />
            {uploadResult.errors.length > 0 && (
              <ul style={{ marginTop: 12, color: '#ff4d4f', fontSize: 12 }}>
                {uploadResult.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </>
        )}
      </Modal>

      {/* Filters */}
      <Card style={{ marginBottom: 16, borderRadius: 12 }}>
        <Space wrap>
          <FilterOutlined />
          <Text>Filter:</Text>
          <Select
            placeholder="Trade Type"
            allowClear
            style={{ width: 130 }}
            onChange={(v) => setFilterType(v || '')}
          >
            <Option value="buy">Buy</Option>
            <Option value="sell">Sell</Option>
          </Select>
        </Space>
      </Card>

      {/* Stats */}
      {data && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col>
            <Text type="secondary">Total Records: </Text>
            <Text strong>{data.total}</Text>
          </Col>
          <Col>
            <Text type="secondary">Page {data.page} of {data.total_pages}</Text>
          </Col>
        </Row>
      )}

      {/* Table */}
      <Card style={{ borderRadius: 12 }}>
        <Table
          dataSource={data?.trades ?? []}
          columns={columns}
          rowKey="id"
          scroll={{ x: 1400 }}
          size="small"
          pagination={{
            current: page,
            pageSize: 15,
            total: data?.total ?? 0,
            showSizeChanger: false,
            showTotal: (total) => `Total ${total} trades`,
            onChange: (p) => fetchTrades(p),
          }}
          rowClassName={(row: Trade) => row.trade_type === 'buy' ? 'row-buy' : 'row-sell'}
        />
      </Card>
    </Spin>
  )
}
