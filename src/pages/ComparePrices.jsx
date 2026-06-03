import { useEffect, useState } from 'react'
import { getAllProducts, getPriceHistoryForProduct } from '../lib/db'
import { CATEGORY_ICONS } from '../lib/categories'
import { format } from 'date-fns'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, BarChart, Bar, Cell
} from 'recharts'
import { Scale } from 'lucide-react'

const STORE_COLORS = ['#2d6a4f','#e07b39','#9b59b6','#e74c3c','#3498db','#f39c12']

function toDate(val) {
  if (!val) return null
  if (val.toDate) return val.toDate()
  return new Date(val)
}

const UNIT_TO_OZ = { oz:1, lb:16, lbs:16, g:0.03527, kg:35.274, 'fl oz':1, ml:0.03381, l:33.814, ct:1, pk:1 }

function toOz(size, unit) {
  if (!size || !unit) return null
  const factor = UNIT_TO_OZ[unit.toLowerCase().replace('lbs','lb')] || 1
  return size * factor
}

/**
 * Given a price history entry + product default size,
 * return the effective price-per-oz for comparison.
 */
function effectivePPO(entry, product) {
  // By-weight: $/lb → $/oz
  if (entry.pricePerUnit && entry.unit) {
    const oz = toOz(1, entry.unit)
    return oz ? entry.pricePerUnit / oz : null
  }
  // Fixed package size recorded on the entry
  if (entry.packageSize && entry.packageUnit) {
    const oz = toOz(entry.packageSize, entry.packageUnit)
    return oz ? entry.price / oz : null
  }
  // Fall back to product's defaultSize
  if (product?.defaultSize && product?.defaultUnit) {
    const oz = toOz(product.defaultSize, product.defaultUnit)
    return oz ? entry.price / oz : null
  }
  return null
}

function sizeLabel(entry, product) {
  if (entry.weight && entry.unit) return `${entry.weight} ${entry.unit} (by wt)`
  if (entry.packageSize && entry.packageUnit) return `${entry.packageSize} ${entry.packageUnit}`
  if (product?.defaultSize && product?.defaultUnit) return `${product.defaultSize} ${product.defaultUnit} (default)`
  return null
}

function ppoLabel(ppo, entry) {
  if (ppo == null) return '—'
  if (entry?.pricePerUnit && entry?.unit) return `$${entry.pricePerUnit.toFixed(2)}/${entry.unit}`
  return `$${ppo.toFixed(3)}/oz`
}

export default function ComparePrices() {
  const [products, setProducts] = useState([])
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [history, setHistory] = useState([])
  const [chartData, setChartData] = useState([])
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(false)
  const [compareMode, setCompareMode] = useState('total') // 'total' | 'perOz'

  useEffect(() => { getAllProducts().then(setProducts) }, [])

  useEffect(() => {
    if (!selectedProduct) return
    setLoading(true)
    getPriceHistoryForProduct(selectedProduct.id).then(entries => {
      setHistory(entries)
      const storeNames = [...new Set(entries.map(e => e.storeName))]
      setStores(storeNames)

      // Build time-series chart data keyed by date
      const byDate = {}
      for (const entry of entries) {
        const d = toDate(entry.date)
        if (!d) continue
        const key = format(d, 'yyyy-MM-dd')
        if (!byDate[key]) byDate[key] = { date: key, displayDate: format(d, 'MMM d, yy') }
        byDate[key][entry.storeName + '_total'] = entry.price
        const ppo = effectivePPO(entry, selectedProduct)
        if (ppo != null) byDate[key][entry.storeName + '_ppo'] = parseFloat(ppo.toFixed(5))
      }
      setChartData(Object.values(byDate).sort((a,b) => a.date.localeCompare(b.date)))
      setLoading(false)
    })
  }, [selectedProduct])

  const hasPPO = history.some(e => effectivePPO(e, selectedProduct) != null)

  // Per-store summary
  const storeStats = stores.map((store, i) => {
    const entries = history.filter(e => e.storeName === store)
    const prices = entries.map(e => e.price)
    const ppoVals = entries.map(e => effectivePPO(e, selectedProduct)).filter(v => v != null)
    const latest = entries[entries.length - 1]
    return {
      store, color: STORE_COLORS[i % STORE_COLORS.length],
      count: entries.length,
      avgTotal: prices.reduce((a,b)=>a+b,0) / prices.length,
      minTotal: Math.min(...prices),
      maxTotal: Math.max(...prices),
      avgPPO: ppoVals.length ? ppoVals.reduce((a,b)=>a+b,0)/ppoVals.length : null,
      minPPO: ppoVals.length ? Math.min(...ppoVals) : null,
      latestSize: latest ? sizeLabel(latest, selectedProduct) : null,
      latestPPOLabel: latest ? ppoLabel(effectivePPO(latest, selectedProduct), latest) : '—',
    }
  }).sort((a,b) => a.avgTotal - b.avgTotal)

  // Bar chart data: all individual entries sorted by price, grouped by store+size
  const barData = history
    .map(e => ({
      label: `${e.storeName}${sizeLabel(e, selectedProduct) ? ' · ' + sizeLabel(e, selectedProduct) : ''}`,
      store: e.storeName,
      total: e.price,
      ppo: effectivePPO(e, selectedProduct),
      size: sizeLabel(e, selectedProduct),
      date: toDate(e.date) ? format(toDate(e.date), 'MMM d, yy') : '',
    }))
    .sort((a,b) => (compareMode === 'perOz' ? (a.ppo||999)-(b.ppo||999) : a.total-b.total))

  const bestStore = storeStats[0]

  return (
    <div className="animate-fade">
      <div className="page-header">
        <h2>Compare Prices</h2>
        <p>Price history across stores, with per-oz comparison for sized products.</p>
      </div>

      <div className="card" style={{ marginBottom: 24 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Select a product to compare</label>
          <select className="form-select" value={selectedProduct?.id || ''} onChange={e => {
            const p = products.find(x => x.id === e.target.value) || null
            setSelectedProduct(p); setHistory([]); setChartData([]); setStores([])
          }}>
            <option value="">— Choose a product —</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>
                {p.category ? `${CATEGORY_ICONS[p.category]} ` : ''}{p.name}
                {p.defaultSize ? ` (${p.defaultSize} ${p.defaultUnit})` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!selectedProduct && (
        <div className="empty-state"><h3>Select a product above</h3><p>Choose a product to see its price history across stores.</p></div>
      )}
      {selectedProduct && loading && (
        <div style={{ textAlign:'center', padding:60 }}>
          <div className="spinner" style={{ width:36, height:36, borderWidth:3, margin:'0 auto 16px' }} />
        </div>
      )}
      {selectedProduct && !loading && history.length === 0 && (
        <div className="empty-state"><h3>No price data yet</h3><p>Upload receipts containing this product to see comparisons.</p></div>
      )}

      {selectedProduct && !loading && history.length > 0 && (
        <>
          {/* Compare mode toggle */}
          {hasPPO && (
            <div style={{ display:'flex', gap:8, marginBottom:20, alignItems:'center' }}>
              <button className={`btn btn-sm ${compareMode==='total'?'btn-primary':'btn-secondary'}`} onClick={()=>setCompareMode('total')}>Total Price</button>
              <button className={`btn btn-sm ${compareMode==='perOz'?'btn-primary':'btn-secondary'}`} onClick={()=>setCompareMode('perOz')}>Price per oz</button>
              {selectedProduct.defaultSize && (
                <span style={{ fontSize:'0.78rem', color:'var(--ink-faint)', marginLeft:4 }}>
                  Using default size: {selectedProduct.defaultSize} {selectedProduct.defaultUnit}
                </span>
              )}
            </div>
          )}

          {/* Best deal banner */}
          {bestStore && (
            <div style={{ background:'var(--green-pale)', border:'1px solid var(--green-light)', borderRadius:'var(--radius)', padding:'16px 20px', marginBottom:20, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <span className="badge badge-green" style={{ marginBottom:6 }}>Best Price</span>
                <div style={{ fontWeight:600 }}>{bestStore.store}</div>
                <div style={{ fontSize:'0.8rem', color:'var(--ink-light)' }}>
                  avg ${bestStore.avgTotal.toFixed(2)} · low ${bestStore.minTotal.toFixed(2)}
                  {bestStore.minPPO != null && <> · <span style={{ color:'var(--green)', fontWeight:600 }}>{ppoLabel(bestStore.minPPO, history.find(e=>e.storeName===bestStore.store))}</span></>}
                </div>
              </div>
              <div style={{ fontFamily:'DM Serif Display, serif', fontSize:'2.2rem', color:'var(--green)' }}>${bestStore.minTotal.toFixed(2)}</div>
            </div>
          )}

          {/* Store comparison table */}
          <div className="card" style={{ marginBottom:24 }}>
            <h3 style={{ fontSize:'1rem', marginBottom:16 }}>Store Comparison</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Store</th>
                    <th>Avg Price</th>
                    <th>Lowest</th>
                    <th>Highest</th>
                    {hasPPO && <th>Best $/oz</th>}
                    {hasPPO && <th>Avg $/oz</th>}
                    <th>Size</th>
                    <th>Records</th>
                  </tr>
                </thead>
                <tbody>
                  {storeStats.map((s, i) => (
                    <tr key={s.store}>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ width:10, height:10, borderRadius:'50%', background:s.color }} />
                          <strong>{s.store}</strong>
                          {i===0 && <span className="badge badge-green" style={{ fontSize:'0.65rem' }}>Cheapest</span>}
                        </div>
                      </td>
                      <td>${s.avgTotal.toFixed(2)}</td>
                      <td style={{ color:'var(--green)', fontWeight:600 }}>${s.minTotal.toFixed(2)}</td>
                      <td style={{ color:'var(--amber)' }}>${s.maxTotal.toFixed(2)}</td>
                      {hasPPO && <td style={{ color:'var(--green)', fontWeight:600, fontSize:'0.82rem' }}>{s.minPPO != null ? `$${s.minPPO.toFixed(3)}/oz` : '—'}</td>}
                      {hasPPO && <td style={{ fontSize:'0.82rem', color:'var(--ink-light)' }}>{s.avgPPO != null ? `$${s.avgPPO.toFixed(3)}/oz` : '—'}</td>}
                      <td style={{ fontSize:'0.8rem', color:'var(--ink-faint)' }}>{s.latestSize || '—'}</td>
                      <td style={{ color:'var(--ink-faint)' }}>{s.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* All entries bar chart — sorted by price */}
          <div className="card" style={{ marginBottom:24 }}>
            <h3 style={{ fontSize:'1rem', marginBottom:4 }}>
              {compareMode === 'perOz' ? 'All Records — Sorted by $/oz' : 'All Records — Sorted by Total Price'}
            </h3>
            <p style={{ fontSize:'0.78rem', color:'var(--ink-faint)', marginBottom:16 }}>Each bar is one purchase. Shorter = cheaper.</p>
            <ResponsiveContainer width="100%" height={Math.max(180, barData.length * 36)}>
              <BarChart data={barData} layout="vertical" margin={{ top:0, right:60, left:4, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--cream-dark)" />
                <XAxis type="number" tick={{ fontSize:11, fill:'var(--ink-faint)' }} tickLine={false} axisLine={false}
                  tickFormatter={v => compareMode==='perOz' ? `$${v.toFixed(3)}` : `$${v.toFixed(2)}`} />
                <YAxis type="category" dataKey="label" width={0} tick={false} axisLine={false} tickLine={false} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0].payload
                    return (
                      <div style={{ background:'white', border:'1px solid var(--border)', borderRadius:8, padding:'10px 14px', fontSize:13 }}>
                        <div style={{ fontWeight:600, marginBottom:4 }}>{d.store}</div>
                        <div>Total: <strong>${d.total.toFixed(2)}</strong></div>
                        {d.size && <div>Size: {d.size}</div>}
                        {d.ppo != null && <div>Per oz: <strong style={{ color:'var(--green)' }}>${d.ppo.toFixed(3)}</strong></div>}
                        <div style={{ color:'var(--ink-faint)', fontSize:11, marginTop:4 }}>{d.date}</div>
                      </div>
                    )
                  }}
                />
                <Bar dataKey={compareMode==='perOz' ? 'ppo' : 'total'} radius={[0,4,4,0]}>
                  {barData.map((entry, index) => {
                    const storeIdx = stores.indexOf(entry.store)
                    return <Cell key={index} fill={STORE_COLORS[storeIdx % STORE_COLORS.length]} />
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {/* Legend */}
            <div style={{ display:'flex', flexWrap:'wrap', gap:12, marginTop:12, justifyContent:'center' }}>
              {stores.map((store, i) => (
                <div key={store} style={{ display:'flex', alignItems:'center', gap:6, fontSize:'0.78rem', color:'var(--ink-light)' }}>
                  <div style={{ width:10, height:10, borderRadius:'50%', background:STORE_COLORS[i%STORE_COLORS.length] }} />
                  {store}
                </div>
              ))}
            </div>
          </div>

          {/* Price over time line chart */}
          <div className="card">
            <h3 style={{ fontSize:'1rem', marginBottom:20 }}>
              {compareMode==='perOz' ? 'Price per oz Over Time' : 'Total Price Over Time'}
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top:5, right:20, left:0, bottom:5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--cream-dark)" />
                <XAxis dataKey="displayDate" tick={{ fontSize:11, fill:'var(--ink-faint)' }} tickLine={false} />
                <YAxis tick={{ fontSize:11, fill:'var(--ink-faint)' }} tickLine={false} axisLine={false}
                  tickFormatter={v => compareMode==='perOz' ? `$${parseFloat(v).toFixed(3)}` : `$${parseFloat(v).toFixed(2)}`} />
                <Tooltip
                  contentStyle={{ borderRadius:8, border:'1px solid var(--border)', fontSize:13 }}
                  formatter={(v, name) => [
                    compareMode==='perOz' ? `$${parseFloat(v).toFixed(3)}/oz` : `$${parseFloat(v).toFixed(2)}`,
                    name.replace(/_total|_ppo/,'')
                  ]}
                />
                <Legend wrapperStyle={{ fontSize:12 }} formatter={name => name.replace(/_total|_ppo/,'')} />
                {stores.map((store, i) => {
                  const key = store + (compareMode==='perOz' ? '_ppo' : '_total')
                  if (!chartData.some(d => d[key] != null)) return null
                  return <Line key={store} type="monotone" dataKey={key} name={key} stroke={STORE_COLORS[i%STORE_COLORS.length]} strokeWidth={2} dot={{ r:4 }} connectNulls activeDot={{ r:6 }} />
                })}
              </LineChart>
            </ResponsiveContainer>
            {compareMode==='perOz' && (
              <p style={{ fontSize:'0.75rem', color:'var(--ink-faint)', marginTop:12, textAlign:'center' }}>
                By-weight items use $/lb rate ÷ 16. Fixed packages use total ÷ package size. Product default size used as fallback.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
