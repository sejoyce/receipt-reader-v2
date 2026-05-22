import { useEffect, useState } from 'react'
import { getBestDeals, getAllPriceHistory } from '../lib/db'
import { format } from 'date-fns'
import { TrendingDown } from 'lucide-react'

function toDate(val) {
  if (!val) return null
  if (val.toDate) return val.toDate()
  return new Date(val)
}

export default function BestDeals() {
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [sortBy, setSortBy] = useState('name')

  useEffect(() => {
    async function load() {
      const [dealData, history] = await Promise.all([getBestDeals(), getAllPriceHistory()])
      const enriched = dealData.map(d => {
        const entries = history.filter(h => h.productId === d.productId)
        const prices = entries.map(e => e.price)
        const spread = prices.length > 1 ? Math.max(...prices) - Math.min(...prices) : 0
        const sortedEntries = [...entries].sort((a, b) => {
          const da = toDate(a.date) || 0
          const db2 = toDate(b.date) || 0
          return db2 - da
        })
        return { ...d, spread, lastSeen: sortedEntries[0]?.date, storeCount: new Set(entries.map(e => e.storeName)).size }
      })
      setDeals(enriched)
      setLoading(false)
    }
    load()
  }, [])

  const filtered = deals.filter(d => !filter || d.productName?.toLowerCase().includes(filter.toLowerCase()))
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'savings') return b.spread - a.spread
    if (sortBy === 'price') return a.lowestPrice - b.lowestPrice
    return a.productName.localeCompare(b.productName)
  })

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><div className="spinner" style={{ width: 36, height: 36, borderWidth: 3, margin: '0 auto 16px' }} /></div>

  return (
    <div className="animate-fade">
      <div className="page-header">
        <h2>Best Deals</h2>
        <p>The lowest price we've ever seen for each product, and where to find it.</p>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input className="form-input" placeholder="Search products…" value={filter} onChange={e => setFilter(e.target.value)} style={{ maxWidth: 260 }} />
        <select className="form-select" value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ width: 'auto' }}>
          <option value="name">Sort: A–Z</option>
          <option value="price">Sort: Lowest Price</option>
          <option value="savings">Sort: Biggest Spread</option>
        </select>
      </div>

      {sorted.length === 0 && (
        <div className="empty-state">
          <TrendingDown size={40} />
          <h3>No deals yet</h3>
          <p>Upload receipts to start seeing best prices.</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {sorted.map(deal => {
          const allPrices = (deal.entries || []).map(e => e.price)
          const minPrice = allPrices.length ? Math.min(...allPrices) : deal.lowestPrice
          const maxPrice = allPrices.length ? Math.max(...allPrices) : deal.lowestPrice
          return (
            <div key={deal.productId} className="card" style={{ position: 'relative', overflow: 'hidden' }}>
              {deal.spread > 0.5 && (
                <div style={{ position: 'absolute', top: 0, right: 0, background: 'var(--amber)', color: 'white', fontSize: '0.65rem', fontWeight: 700, padding: '3px 10px', borderBottomLeftRadius: 8, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  Save ${deal.spread.toFixed(2)}
                </div>
              )}
              <div style={{ marginBottom: 12 }}>
                <h3 style={{ fontSize: '1rem', marginBottom: 2 }}>{deal.productName}</h3>
                <div style={{ fontSize: '0.75rem', color: 'var(--ink-faint)' }}>
                  {deal.storeCount} store{deal.storeCount !== 1 ? 's' : ''} · {deal.entries?.length || 0} price records
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--ink-faint)', marginBottom: 2 }}>Best price at</div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{deal.lowestStore}</div>
                  {deal.lastSeen && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--ink-faint)' }}>
                      last seen {format(toDate(deal.lastSeen), 'MMM d, yy')}
                    </div>
                  )}
                </div>
                <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: '2rem', color: 'var(--green)', lineHeight: 1 }}>
                  ${deal.lowestPrice?.toFixed(2)}
                </div>
              </div>
              {deal.spread > 0 && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--cream-dark)', fontSize: '0.78rem', color: 'var(--ink-light)' }}>
                  Range: ${minPrice.toFixed(2)} – ${maxPrice.toFixed(2)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
