import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ConfigProvider, theme } from 'antd'
import { useAuthStore } from '@/store/authStore'
import AppLayout from '@/components/Layout/AppLayout'
import LoginPage from '@/pages/Login/Login'
import RegisterPage from '@/pages/Login/Register'
import HomePage from '@/pages/Home/Home'
import TradeBookPage from '@/pages/TradeBook/TradeBook'
import PnLPage from '@/pages/PnL/PnL'
import TargetPage from '@/pages/Target/Target'
import GSecPage from '@/pages/GSec/GSec'
import UsersPage from '@/pages/Admin/Users'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated())
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  return user?.is_admin ? <>{children}</> : <Navigate to="/home" replace />
}

export default function App() {
  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#4f46e5',
          colorSuccess: '#10b981',
          colorError: '#ef4444',
          colorWarning: '#f59e0b',
          borderRadius: 10,
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        },
        components: {
          Layout: { siderBg: '#0b1120' },
          Menu: { darkItemBg: 'transparent', darkSubMenuItemBg: '#050816' },
        },
      }}
    >
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <AppLayout />
              </PrivateRoute>
            }
          >
            <Route index element={<Navigate to="/home" replace />} />
            <Route path="home" element={<HomePage />} />
            <Route path="tradebook" element={<TradeBookPage />} />
            <Route path="pnl" element={<PnLPage />} />
            <Route path="target" element={<TargetPage />} />
            <Route path="gsec" element={<GSecPage />} />
            <Route path="users" element={<AdminRoute><UsersPage /></AdminRoute>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  )
}
