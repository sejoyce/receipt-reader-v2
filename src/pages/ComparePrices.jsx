import { useEffect, useState } from 'react'
import { getAllProducts, getPriceHistoryForProduct } from '../lib/db'
import { format } from 'date-fns'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const STORE_COLORS = ['#2d6a4f','#e07b39','#9b59b6','#e74c3c','#3498db','#f39c12']

function toDate(val) {
  if (!val) return null
  if (val.toDate) return val.toDate()
  return new Date(val)
}

export default function ComparePrices() {
  const [products, setProducts] = useState([])
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [history, setHistory] = useState([])
  const [chartData, setChartData] = useState([])
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { getAllProducts().then(setProducts) }, [])

  useEffect(() => {
    if (!selectedProduct) return
    setLoading(true)
    getPriceHistoryForProduct(selectedProduct.id).then(entries => {
      setHistory(entries)
      const storeNames = [...new Set(entries.map(e => e.storeName))]
      setStores(storeNames)

      const byDate = {}
      for (const entry of entries) {
        const d = toDate(entry.date)
        if (!d) continue
        const key = format(d, 'yyyy-MM-dd')
        if (!byDate[key]) byDate[key] = { date: key, displayDate: format(d, 'MMM d, yy') }
        byDate[key][entry.storeName] = entry.price
      }
      setChartData(Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)))
      setLoading(false)
    })
  }, [selectedProduct])

  const storeStats = stores.map(store => {
    const entries = history.filter(e => e.storeName === store)
    const prices = entries.map(e => e.price)
    return { store, count: prices.length, avg: prices.reduce((a,b)=>a+b,0)/prices.length, min: Math.min(...prices), max: Math.max(...prices) }
  }).sort((a, b) => a.avg - b.avg)

  const bestStore = storeStats[0]

  return (
    <div className="animate-fade">
      <div className="page-header">
        <h2>Compare Prices</h2>
        <p>See how prices vary across stores over time.</p>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Select a product to compare</label>
          <select className="form-select" value={selectedProduct?.id || ''} onChange={e => setSelectedProduct(products.find(p => p.id === e.target.value) || null)}>
            <option value="">— Choose a product —</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}{p.category ? ` (${p.category})` : ''}</option>)}
          </select>
        </div>
      </div>

      {!selectedProduct && <div className="empty-state"><h3>Select a product above</h3><p>Choose a product to see its price history across stores.</p></div>}
      {selectedProduct && loading && <div style={{ textAlign: 'center', padding: 60 }}><div className="spinner" style={{ width: 36, height: 36, borderWidth: 3, margin: '0 auto 16px' }} /><p>Loading…</p></div>}
      {selectedProduct && !loading && history.length === 0 && <div className="empty-state"><h3>No price data yet</h3><p>Upload receipts containing this product to see comparisons.</p></div>}

      {selectedProduct && !loading && history.length > 0 && (
        <>
          {bestStore && (
            <div style={{ background: 'var(--green-pale)', border: '1px solid var(--green-light)', borderRadius: 'var(--radius)', padding: '16px 20px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span className="badge badge-green" style={{ marginBottom: 6 }}>Best Price</span>
                <div style={{ fontWeight: 600 }}>{bestStore.store}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--ink-light)' }}>avg ${bestStore.avg.toFixed(2)} · low ${bestStore.min.toFixed(2)}</div>
              </div>
              <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: '2.2rem', color: 'var(--green)' }}>${bestStore.min.toFixed(2)}</div>
            </div>
          )}

          <div className="card" style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: '1rem', marginBottom: 16 }}>Store Comparison</h3>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Store</th><th>Avg Price</th><th>Lowest</th><th>Highest</th><th>Records</th></tr></thead>
                <tbody>
                  {storeStats.map((s, i) => (
                    <tr key={s.store}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: STORE_COLORS[i % STORE_COLORS.length] }} />
                          <strong>{s.store}</strong>
                          {i === 0 && <span className="badge badge-green" style={{ fontSize: '0.65rem' }}>Cheapest</span>}
                        </div>
                      </td>
                      <td>${s.avg.toFixed(2)}</td>
                      <td style={{ color: 'var(--green)', fontWeight: 600 }}>${s.min.toFixed(2)}</td>
                      <td style={{ color: 'var(--amber)' }}>${s.max.toFixed(2)}</td>
                      <td style={{ color: 'var(--ink-faint)' }}>{s.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: '1rem', marginBottom: 20 }}>Price History Over Time</h3>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--cream-dark)" />
                <XAxis dataKey="displayDate" tick={{ fontSize: 11, fill: 'var(--ink-faint)' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--ink-faint)' }} tickLine={false} axisLine={false} tickFormatter={v => `$${v.toFixed(2)}`} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }} formatter={v => [`$${v.toFixed(2)}`]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {stores.map((store, i) => (
                  <Line key={store} type="monotone" dataKey={store} stroke={STORE_COLORS[i % STORE_COLORS.length]} strokeWidth={2} dot={{ r: 4 }} connectNulls activeDot={{ r: 6 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}
