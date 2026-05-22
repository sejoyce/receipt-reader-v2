import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAllReceipts, getAllProducts, getBestDeals, getAllPriceHistory } from '../lib/db'
import { UploadCloud, TrendingDown } from 'lucide-react'
import { format } from 'date-fns'

function toDate(val) {
  if (!val) return null
  if (val.toDate) return val.toDate()
  return new Date(val)
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [recentReceipts, setRecentReceipts] = useState([])
  const [topDeals, setTopDeals] = useState([])

  useEffect(() => {
    async function load() {
      const [receipts, products, deals, history] = await Promise.all([
        getAllReceipts(), getAllProducts(), getBestDeals(), getAllPriceHistory(),
      ])
      const stores = new Set(receipts.map(r => r.storeName)).size
      setStats({ receipts: receipts.length, products: products.length, stores, items: history.length })
      setRecentReceipts(receipts.slice(0, 5))
      setTopDeals(deals.slice(0, 6))
    }
    load()
  }, [])

  return (
    <div className="animate-fade">
      <div className="page-header">
        <h2>Good morning 🛒</h2>
        <p>Track prices across your favorite stores and never overpay again.</p>
      </div>

      {stats && (
        <div className="grid-4" style={{ marginBottom: 28 }}>
          {[
            { label: 'Receipts Scanned', value: stats.receipts, sub: 'total uploads' },
            { label: 'Products Tracked', value: stats.products, sub: 'unique items' },
            { label: 'Stores', value: stats.stores, sub: 'in your area' },
            { label: 'Price Records', value: stats.items, sub: 'data points' },
          ].map(s => (
            <div key={s.label} className="stat-card">
              <div className="stat-label">{s.label}</div>
              <div className="stat-value">{s.value}</div>
              <div className="stat-sub">{s.sub}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid-2" style={{ gap: 24 }}>
        <div className="card">
          <div className="card-header">
            <h3 style={{ fontSize: '1.1rem' }}>Recent Receipts</h3>
            <Link to="/receipts" style={{ fontSize: '0.8rem', color: 'var(--green)' }}>View all →</Link>
          </div>
          {recentReceipts.length === 0 ? (
            <div className="empty-state" style={{ padding: '30px 0' }}>
              <UploadCloud size={32} />
              <p style={{ fontSize: '0.85rem' }}>No receipts yet</p>
              <Link to="/upload" className="btn btn-primary btn-sm">Upload first receipt</Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recentReceipts.map(r => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--cream-dark)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{r.storeName}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--ink-faint)' }}>{r.items?.length || 0} items · {r.uploadedBy}</div>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--ink-light)' }}>
                    {r.date ? format(toDate(r.date), 'MMM d') : '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h3 style={{ fontSize: '1.1rem' }}>Best Prices Found</h3>
            <Link to="/deals" style={{ fontSize: '0.8rem', color: 'var(--green)' }}>View all →</Link>
          </div>
          {topDeals.length === 0 ? (
            <div className="empty-state" style={{ padding: '30px 0' }}>
              <TrendingDown size={32} />
              <p style={{ fontSize: '0.85rem' }}>Upload receipts to see deals</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {topDeals.map(d => (
                <div key={d.productId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--cream-dark)' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{d.productName}</div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: 'var(--green)' }}>${d.lowestPrice?.toFixed(2)}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--ink-faint)' }}>{d.lowestStore}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {(!stats || stats.receipts === 0) && (
        <div style={{
          marginTop: 28,
          background: 'linear-gradient(135deg, var(--green) 0%, #52b788 100%)',
          borderRadius: 'var(--radius-lg)', padding: '32px 36px', color: 'white',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <h3 style={{ color: 'white', fontSize: '1.4rem', marginBottom: 6 }}>Ready to start saving?</h3>
            <p style={{ opacity: 0.85, fontSize: '0.9rem' }}>Upload your first grocery receipt to begin tracking prices.</p>
          </div>
          <Link to="/upload" className="btn" style={{ background: 'white', color: 'var(--green)', fontWeight: 600 }}>
            <UploadCloud size={16} /> Upload Receipt
          </Link>
        </div>
      )}
    </div>
  )
}
