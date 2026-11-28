// Shared TypeScript types mirroring the backend Pydantic schemas

export interface User {
  id: number
  username: string
  email: string
  full_name?: string
  is_active: boolean
  is_admin?: boolean
  created_at: string
}

export interface Token {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface Trade {
  id: number
  user_id: number
  symbol: string
  isin?: string
  trade_date: string
  exchange: string
  segment: string
  series?: string
  trade_type: 'buy' | 'sell'
  auction: boolean
  quantity: number
  price: number
  trade_id: string
  order_id: string
  order_execution_time: string
  expiry_date?: string
  financial_year: string
  created_at: string
}

export interface TradeListResponse {
  trades: Trade[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface TradeUploadResponse {
  total_rows: number
  inserted: number
  skipped_duplicates: number
  errors: string[]
}

export interface Investment {
  id: number
  user_id: number
  instrument_type: 'GSec' | 'Mutual Fund' | string
  instrument_code?: string | null
  name: string
  quantity?: number | null
  buy_price?: number | null
  ltp?: number | null
  invested_value: number
  current_value?: number | null
  investment_date?: string | null
  financial_year: string
  notes?: string
  created_at: string
}

export interface Interest {
  id: number
  user_id: number
  investment_id?: number
  amount: number
  interest_date: string
  description?: string
  financial_year: string
  created_at: string
}

export interface BrokerCash {
  id: number
  user_id: number
  amount: number
  cash_date: string
  financial_year: string
  description?: string
  created_at: string
}

export interface GrowthDataPoint {
  date: string
  invested: number
  returns: number
  net_value: number
}

export interface HomeSummary {
  total_invested: number
  total_interest: number
  total_pnl: number
  total_brokerage: number
  total_profit: number
  net_value: number
  financial_year: string
  growth_data: GrowthDataPoint[]
  total_broker_cash: number
  broker_vs_invested_diff: number
  xirr: number | null
  total_current_value: number
  total_holding_pnl: number
}

export interface MarketIndex {
  symbol: string
  price: number | null
  prev_close: number | null
  change: number | null
  change_pct: number | null
  market_state: string
  live: boolean
}

export interface PnLByExpiry {
  expiry_date: string | null
  symbol_base: string
  total_buy_qty: number
  total_sell_qty: number
  buy_value: number
  sell_value: number
  gross_pnl: number
  brokerage: number
  realized_pnl: number
  trades_count: number
  status: 'profit' | 'loss' | 'breakeven'
}

export interface OpenPosition {
  symbol: string
  symbol_base: string
  expiry_date: string | null
  net_qty: number
  avg_price: number
  open_value: number
  unrealised_pnl: number
}

export interface PnLSummary {
  total_profit: number
  total_loss: number
  gross_net_pnl: number
  net_pnl: number
  total_brokerage: number
  calculated_brokerage: number
  per_trade_fee: number
  is_custom_brokerage: boolean
  total_trades: number
  profitable_expiries: number
  losing_expiries: number
  financial_year: string
  by_expiry: PnLByExpiry[]
  open_positions?: OpenPosition[]
  total_unrealised_pnl?: number
}

export interface WeekMissAnalysis {
  shortfall: number
  trades_count: number
  gross_pnl: number
  brokerage: number
  reasons: string[]
}

export interface PeriodRow {
  label: string
  start: string
  end: string
  capital_base: number
  target: number
  pnl: number
  achieved: boolean
  pct: number
  is_future: boolean
  miss_analysis?: WeekMissAnalysis | null
}

export interface TargetAchievement {
  financial_year: string
  yearly_target: number
  quarterly_target: number
  monthly_target: number
  weekly_target: number
  yearly_pnl: number
  current_quarter_pnl: number
  current_month_pnl: number
  current_week_pnl: number
  yearly_achieved: boolean
  quarterly_achieved: boolean
  monthly_achieved: boolean
  weekly_achieved: boolean
  yearly_pct: number
  quarterly_pct: number
  monthly_pct: number
  weekly_pct: number
  all_quarters: PeriodRow[]
  all_months: PeriodRow[]
  all_weeks: PeriodRow[]
}

export interface AISuggestion {
  type: 'success' | 'warning' | 'info'
  title: string
  detail: string
}

export interface AIInsights {
  financial_year: string
  health_score: number
  headline: string
  metrics: {
    win_rate: number
    nifty_pnl: number
    sensex_pnl: number
    brokerage_drag_pct: number
  }
  suggestions: AISuggestion[]
}
