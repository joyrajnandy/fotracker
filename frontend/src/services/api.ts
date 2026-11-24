import axios from 'axios'
import { useAuthStore } from '@/store/authStore'

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) useAuthStore.getState().logout()
    return Promise.reject(err)
  },
)

export default api

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  register: (data: {
    username: string; email: string; password: string; full_name?: string; invite_token: string
  }) => api.post('/auth/register', data),
  login: (data: { username: string; password: string }) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  createInviteLink: () => api.post('/auth/invite-link'),
  validateInvite: (token: string) => api.get('/auth/invite-validate', { params: { token } }),
}

// ── Market ────────────────────────────────────────────────────────────────────
export const marketApi = {
  getIndices: () => api.get('/market/indices'),
  getLtp: (instrument_code: string, instrument_type?: string, name?: string) =>
    api.get('/market/ltp', { params: { instrument_code, instrument_type, name } }),
}

// ── Home ──────────────────────────────────────────────────────────────────────
export const homeApi = {
  getFinancialYears: () => api.get('/home/financial-years'),
  getSummary: (fy?: string) => api.get('/home/summary', { params: { financial_year: fy } }),
  addInvestment: (data: object) => api.post('/home/investment', data),
  updateInvestment: (id: number, data: object) => api.put(`/home/investment/${id}`, data),
  getInvestments: (fy?: string) => api.get('/home/investments', { params: { financial_year: fy } }),
  deleteInvestment: (id: number) => api.delete(`/home/investment/${id}`),
  refreshAllLtp: (fy?: string) =>
    api.post('/home/investments/refresh-ltp', null, { params: { financial_year: fy } }),
  addInterest: (data: object) => api.post('/home/interest', data),
  updateInterest: (id: number, data: object) => api.put(`/home/interest/${id}`, data),
  deleteInterest: (id: number) => api.delete(`/home/interest/${id}`),
  getInterests: (fy?: string) => api.get('/home/interests', { params: { financial_year: fy } }),
  carryForward: (from_fy: string, to_fy: string) =>
    api.post('/home/carry-forward', null, { params: { from_fy, to_fy } }),
}

// ── Broker Cash ───────────────────────────────────────────────────────────────
export const brokerCashApi = {
  add: (data: object) => api.post('/broker-cash', data),
  list: (fy?: string) => api.get('/broker-cash', { params: { financial_year: fy } }),
  update: (id: number, data: object) => api.put(`/broker-cash/${id}`, data),
  delete: (id: number, fy?: string) =>
    api.delete(`/broker-cash/${id}`, { params: { financial_year: fy } }),
  uploadCsv: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/broker-cash/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
}

// ── TradeBook ─────────────────────────────────────────────────────────────────
export const tradebookApi = {
  upload: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/tradebook/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  getTrades: (params: {
    financial_year?: string; page?: number; page_size?: number; symbol?: string; trade_type?: string
  }) => api.get('/tradebook/trades', { params }),
  deleteTrades: (fy?: string) =>
    api.delete('/tradebook/trades', { params: { financial_year: fy } }),
}

// ── P&L ──────────────────────────────────────────────────────────────────────
export const pnlApi = {
  getSummary: (fy?: string) => api.get('/pnl/summary', { params: { financial_year: fy } }),
  updateBrokerage: (fy: string, custom_total_brokerage: number | null, per_trade_fee = 25.7) =>
    api.put('/pnl/brokerage', { custom_total_brokerage, per_trade_fee }, { params: { financial_year: fy } }),
}

// ── Target ───────────────────────────────────────────────────────────────────
export const targetApi = {
  getAchievement: (fy?: string) => api.get('/target/achievement', { params: { financial_year: fy } }),
  recalculate: (fy?: string) =>
    api.post('/target/recalculate', null, { params: { financial_year: fy } }),
}

// ── AI Strategist ─────────────────────────────────────────────────────────────
export const aiApi = {
  getInsights: (fy?: string) => api.get('/ai/insights', { params: { financial_year: fy } }),
  getMarketBot: (fy?: string) => api.get('/ai/market-bot', { params: { financial_year: fy } }),
}
