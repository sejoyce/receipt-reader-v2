// src/App.jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import UploadReceipt from './pages/UploadReceipt'
import ReceiptLog from './pages/ReceiptLog'
import ComparePrices from './pages/ComparePrices'
import Products from './pages/Products'
import BestDeals from './pages/BestDeals'
import { ToastProvider } from './hooks/useToast'

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
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
            </Routes>
          </main>
        </div>
      </ToastProvider>
    </BrowserRouter>
  )
}
