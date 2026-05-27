import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { ToastProvider } from './hooks/useToast'
import Sidebar from './components/Sidebar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import UploadReceipt from './pages/UploadReceipt'
import ReceiptLog from './pages/ReceiptLog'
import ComparePrices from './pages/ComparePrices'
import Products from './pages/Products'
import BestDeals from './pages/BestDeals'

const basename = import.meta.env.VITE_BASE_PATH || '/'

function AppShell() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ink)' }}>
        <div className="spinner" style={{ width: 36, height: 36, borderWidth: 3, borderTopColor: 'var(--green-light)', borderColor: 'rgba(255,255,255,0.15)' }} />
      </div>
    )
  }

  if (!user) return <Login />

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/upload" element={<UploadReceipt />} />
          <Route path="/receipts" element={<ReceiptLog />} />
          <Route path="/compare" element={<ComparePrices />} />
          <Route path="/products" element={<Products />} />
          <Route path="/deals" element={<BestDeals />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter basename={basename}>
      <AuthProvider>
        <ToastProvider>
          <AppShell />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
