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
  register: (data: { username: string; email: string; password: string; full_name?: string }) =>
    api.post('/auth/register', data),
  login: (data: { username: string; password: string }) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
}

// ── Market ────────────────────────────────────────────────────────────────────
export const marketApi = {
  getIndices: () => api.get('/market/indices'),
}

// ── Home ──────────────────────────────────────────────────────────────────────
export const homeApi = {
  getFinancialYears: () => api.get('/home/financial-years'),
  getSummary: (fy?: string) => api.get('/home/summary', { params: { financial_year: fy } }),
  addInvestment: (data: object) => api.post('/home/investment', data),
  updateInvestment: (id: number, data: object) => api.put(`/home/investment/${id}`, data),
  getInvestments: (fy?: string) => api.get('/home/investments', { params: { financial_year: fy } }),
  deleteInvestment: (id: number) => api.delete(`/home/investment/${id}`),
  patchCurrentValue: (id: number, current_value: number | null) =>
    api.patch(`/home/investment/${id}/current-value`, { current_value }),
  addInterest: (data: object) => api.post('/home/interest', data),
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
}

// ── P&L ──────────────────────────────────────────────────────────────────────
export const pnlApi = {
  getSummary: (fy?: string) => api.get('/pnl/summary', { params: { financial_year: fy } }),
}

// ── Target ───────────────────────────────────────────────────────────────────
export const targetApi = {
  getAchievement: (fy?: string) => api.get('/target/achievement', { params: { financial_year: fy } }),
  recalculate: (fy?: string) =>
    api.post('/target/recalculate', null, { params: { financial_year: fy } }),
}
