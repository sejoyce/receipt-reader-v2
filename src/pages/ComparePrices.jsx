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

/**
 * Return the natural unit for an entry for per-unit comparison.
 * We do NOT convert across units — only compare same-unit entries.
 */
function getEntryUnit(entry, product) {
  // By-weight items: pricePerUnit already is $/unit (e.g. $/lb)
  if (entry.pricePerUnit && entry.unit) return entry.unit.toLowerCase()
  // Fixed package: use packageUnit
  if (entry.packageSize && entry.packageUnit) return entry.packageUnit.toLowerCase()
  // Fall back to product defaultUnit
  if (product?.defaultUnit) return product.defaultUnit.toLowerCase()
  return null
}

/**
 * Return price-per-unit in the item's natural unit.
 * $/lb for bananas, $/oz for 18oz blueberries, $/lb for 1lb strawberries, etc.
 */
function effectivePPU(entry, product) {
  // By-weight: pricePerUnit is already $/unit
  if (entry.pricePerUnit && entry.unit) return entry.pricePerUnit
  // Fixed package: price / packageSize
  if (entry.packageSize && entry.packageUnit) return entry.price / entry.packageSize
  // Fall back to product defaultSize
  if (product?.defaultSize && product?.defaultUnit) return entry.price / product.defaultSize
  return null
}

function sizeLabel(entry, product) {
  if (entry.weight && entry.unit) return `${entry.weight} ${entry.unit}`
  if (entry.packageSize && entry.packageUnit) return `${entry.packageSize} ${entry.packageUnit}`
  if (product?.defaultSize && product?.defaultUnit) return `${product.defaultSize} ${product.defaultUnit} (default)`
  return null
}

function ppuLabel(ppu, unit) {
  if (ppu == null || !unit) return '—'
  return `$${ppu.toFixed(2)}/${unit}`
}

export default function ComparePrices() {
  const [products, setProducts] = useState([])
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [history, setHistory] = useState([])
  const [chartData, setChartData] = useState([])
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(false)
  const [compareMode, setCompareMode] = useState('perUnit') // 'total' | 'perUnit'

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
        byDate[key][entry.storeName + '_total'] = entry.price
        const ppu = effectivePPU(entry, selectedProduct)
        if (ppu != null) byDate[key][entry.storeName + '_ppu'] = parseFloat(ppu.toFixed(4))
      }
      setChartData(Object.values(byDate).sort((a,b) => a.date.localeCompare(b.date)))
      setLoading(false)
    })
  }, [selectedProduct])

  // Determine the dominant unit across all entries for the toggle label
  const unitCounts = {}
  for (const e of history) {
    const u = getEntryUnit(e, selectedProduct)
    if (u) unitCounts[u] = (unitCounts[u] || 0) + 1
  }
  const dominantUnit = Object.entries(unitCounts).sort((a,b) => b[1]-a[1])[0]?.[0] || null
  const hasPPU = history.some(e => effectivePPU(e, selectedProduct) != null)
  // Total price comparison is only meaningful for items without a natural size unit
  // (e.g. a fixed-price item like a jar of miso that always comes in one size)
  // For by-weight or variable-size items, total price is misleading
  const totalMakesSense = !hasPPU || history.every(e =>
    !e.weight && !e.packageSize && !selectedProduct?.defaultSize
  )

  // Per-store summary
  const storeStats = stores.map((store, i) => {
    const entries = history.filter(e => e.storeName === store)
    const prices = entries.map(e => e.price)
    const ppuVals = entries.map(e => effectivePPU(e, selectedProduct)).filter(v => v != null)
    const latest = entries[entries.length - 1]
    const latestUnit = latest ? getEntryUnit(latest, selectedProduct) : null
    const latestPPU = latest ? effectivePPU(latest, selectedProduct) : null
    return {
      store, color: STORE_COLORS[i % STORE_COLORS.length],
      count: entries.length,
      avgTotal: prices.reduce((a,b)=>a+b,0) / prices.length,
      minTotal: Math.min(...prices),
      maxTotal: Math.max(...prices),
      avgPPU: ppuVals.length ? ppuVals.reduce((a,b)=>a+b,0)/ppuVals.length : null,
      minPPU: ppuVals.length ? Math.min(...ppuVals) : null,
      latestSize: latest ? sizeLabel(latest, selectedProduct) : null,
      latestPPULabel: ppuLabel(latestPPU, latestUnit),
      unit: latestUnit,
    }
  }).sort((a,b) => a.avgTotal - b.avgTotal)

  const bestStore = storeStats[0]

  // Bar chart data
  const barData = history
    .map(e => {
      const unit = getEntryUnit(e, selectedProduct)
      const ppu = effectivePPU(e, selectedProduct)
      return {
        label: `${e.storeName}${sizeLabel(e, selectedProduct) ? ' · ' + sizeLabel(e, selectedProduct) : ''}`,
        store: e.storeName,
        total: e.price,
        ppu,
        unit,
        size: sizeLabel(e, selectedProduct),
        date: toDate(e.date) ? format(toDate(e.date), 'MMM d, yy') : '',
      }
    })
    .sort((a,b) => compareMode === 'perUnit' ? (a.ppu||999)-(b.ppu||999) : a.total-b.total)

  return (
    <div className="animate-fade">
      <div className="page-header">
        <h2>Compare Prices</h2>
        <p>Price history across stores, with per-unit comparison for sized products.</p>
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
          {/* Compare mode toggle — label shows the actual unit */}
          {hasPPU && (
            <div style={{ display:'flex', gap:8, marginBottom:20, alignItems:'center', flexWrap:'wrap' }}>
              {totalMakesSense && (
                <button className={`btn btn-sm ${compareMode==='total'?'btn-primary':'btn-secondary'}`} onClick={()=>setCompareMode('total')}>Total Price</button>
              )}
              <button className={`btn btn-sm ${compareMode==='perUnit'?'btn-primary':'btn-secondary'}`} onClick={()=>setCompareMode('perUnit')}>
                Price per {dominantUnit || 'unit'}
              </button>
              {selectedProduct.defaultSize && (
                <span style={{ fontSize:'0.78rem', color:'var(--ink-faint)' }}>
                  Default size: {selectedProduct.defaultSize} {selectedProduct.defaultUnit}
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
                  {bestStore.minPPU != null && (
                    <> · <span style={{ color:'var(--green)', fontWeight:600 }}>{ppuLabel(bestStore.minPPU, bestStore.unit)}</span></>
                  )}
                </div>
              </div>
              <div style={{ fontFamily:'DM Serif Display, serif', fontSize:'2.2rem', color:'var(--green)' }}>
                {!totalMakesSense && bestStore.minPPU != null
                  ? ppuLabel(bestStore.minPPU, bestStore.unit)
                  : `$${bestStore.minTotal.toFixed(2)}`}
              </div>
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
                    {totalMakesSense && <th>Avg Price</th>}
                    {totalMakesSense && <th>Lowest</th>}
                    {totalMakesSense && <th>Highest</th>}
                    {hasPPU && <th>Best /{dominantUnit||'unit'}</th>}
                    {hasPPU && <th>Avg /{dominantUnit||'unit'}</th>}
                    <th>Size</th>
                    <th>#</th>
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
                      {totalMakesSense && <td>${s.avgTotal.toFixed(2)}</td>}
                      {totalMakesSense && <td style={{ color:'var(--green)', fontWeight:600 }}>${s.minTotal.toFixed(2)}</td>}
                      {totalMakesSense && <td style={{ color:'var(--amber)' }}>${s.maxTotal.toFixed(2)}</td>}
                      {hasPPU && (
                        <td style={{ color:'var(--green)', fontWeight:600, fontSize:'0.82rem' }}>
                          {s.minPPU != null ? ppuLabel(s.minPPU, s.unit) : '—'}
                        </td>
                      )}
                      {hasPPU && (
                        <td style={{ fontSize:'0.82rem', color:'var(--ink-light)' }}>
                          {s.avgPPU != null ? ppuLabel(s.avgPPU, s.unit) : '—'}
                        </td>
                      )}
                      <td style={{ fontSize:'0.8rem', color:'var(--ink-faint)' }}>{s.latestSize || '—'}</td>
                      <td style={{ color:'var(--ink-faint)' }}>{s.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bar chart — all individual entries */}
          <div className="card" style={{ marginBottom:24 }}>
            <h3 style={{ fontSize:'1rem', marginBottom:4 }}>
              {compareMode==='perUnit'
                ? `All Records — Sorted by $/${dominantUnit||'unit'}`
                : 'All Records — Sorted by Total Price'}
            </h3>
            <p style={{ fontSize:'0.78rem', color:'var(--ink-faint)', marginBottom:16 }}>Each bar is one purchase. Shorter = cheaper.</p>
            <ResponsiveContainer width="100%" height={Math.max(180, barData.length * 38)}>
              <BarChart data={barData} layout="vertical" margin={{ top:0, right:60, left:4, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--cream-dark)" />
                <XAxis type="number" tick={{ fontSize:11, fill:'var(--ink-faint)' }} tickLine={false} axisLine={false}
                  tickFormatter={v => `$${parseFloat(v).toFixed(2)}`} />
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
                        {d.ppu != null && d.unit && (
                          <div>Per {d.unit}: <strong style={{ color:'var(--green)' }}>{ppuLabel(d.ppu, d.unit)}</strong></div>
                        )}
                        <div style={{ color:'var(--ink-faint)', fontSize:11, marginTop:4 }}>{d.date}</div>
                      </div>
                    )
                  }}
                />
                <Bar dataKey={compareMode==='perUnit' ? 'ppu' : 'total'} radius={[0,4,4,0]}>
                  {barData.map((entry, index) => {
                    const storeIdx = stores.indexOf(entry.store)
                    return <Cell key={index} fill={STORE_COLORS[storeIdx % STORE_COLORS.length]} />
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display:'flex', flexWrap:'wrap', gap:12, marginTop:12, justifyContent:'center' }}>
              {stores.map((store, i) => (
                <div key={store} style={{ display:'flex', alignItems:'center', gap:6, fontSize:'0.78rem', color:'var(--ink-light)' }}>
                  <div style={{ width:10, height:10, borderRadius:'50%', background:STORE_COLORS[i%STORE_COLORS.length] }} />
                  {store}
                </div>
              ))}
            </div>
          </div>

          {/* Line chart — price over time */}
          <div className="card">
            <h3 style={{ fontSize:'1rem', marginBottom:20 }}>
              {compareMode==='perUnit'
                ? `Price per ${dominantUnit||'unit'} Over Time`
                : 'Total Price Over Time'}
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top:5, right:20, left:0, bottom:5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--cream-dark)" />
                <XAxis dataKey="displayDate" tick={{ fontSize:11, fill:'var(--ink-faint)' }} tickLine={false} />
                <YAxis tick={{ fontSize:11, fill:'var(--ink-faint)' }} tickLine={false} axisLine={false}
                  tickFormatter={v => `$${parseFloat(v).toFixed(2)}`} />
                <Tooltip
                  contentStyle={{ borderRadius:8, border:'1px solid var(--border)', fontSize:13 }}
                  formatter={(v, name) => [
                    `$${parseFloat(v).toFixed(2)}${compareMode==='perUnit' && dominantUnit ? '/'+dominantUnit : ''}`,
                    name.replace(/_total|_ppu/,'')
                  ]}
                />
                <Legend wrapperStyle={{ fontSize:12 }} formatter={name => name.replace(/_total|_ppu/,'')} />
                {stores.map((store, i) => {
                  const key = store + (compareMode==='perUnit' ? '_ppu' : '_total')
                  if (!chartData.some(d => d[key] != null)) return null
                  return (
                    <Line key={store} type="monotone" dataKey={key} name={key}
                      stroke={STORE_COLORS[i%STORE_COLORS.length]} strokeWidth={2}
                      dot={{ r:4 }} connectNulls activeDot={{ r:6 }} />
                  )
                })}
              </LineChart>
            </ResponsiveContainer>
            {compareMode==='perUnit' && dominantUnit && (
              <p style={{ fontSize:'0.75rem', color:'var(--ink-faint)', marginTop:12, textAlign:'center' }}>
                Comparing in natural unit: <strong>{dominantUnit}</strong>.
                By-weight items use their per-{dominantUnit} rate; fixed packages use price ÷ package size.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
