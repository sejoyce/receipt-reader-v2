import { useEffect, useState } from 'react'
import { getAllReceipts } from '../lib/db'
import { format } from 'date-fns'
import { ReceiptText, ChevronDown, ChevronUp } from 'lucide-react'

function toDate(val) {
  if (!val) return null
  if (val.toDate) return val.toDate()
  return new Date(val)
}

export default function ReceiptLog() {
  const [receipts, setReceipts] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  useEffect(() => { getAllReceipts().then(r => { setReceipts(r); setLoading(false) }) }, [])

  const filtered = receipts.filter(r =>
    !filter || r.storeName?.toLowerCase().includes(filter.toLowerCase()) ||
    r.uploadedBy?.toLowerCase().includes(filter.toLowerCase())
  )

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 80 }}>
      <div className="spinner" style={{ width: 36, height: 36, borderWidth: 3, margin: '0 auto 16px' }} />
    </div>
  )

  return (
    <div className="animate-fade">
      <div className="page-header">
        <h2>Receipt Log</h2>
        <p>All your scanned receipts in one place.</p>
      </div>

      <div style={{ marginBottom: 20 }}>
        <input className="form-input" placeholder="Filter by store or uploader…" value={filter} onChange={e => setFilter(e.target.value)} style={{ maxWidth: 320 }} />
      </div>

      {filtered.length === 0 && (
        <div className="empty-state">
          <ReceiptText size={40} />
          <h3>No receipts found</h3>
          <p>Upload your first receipt to get started.</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.map(receipt => {
          const date = toDate(receipt.date)
          const isOpen = expanded === receipt.id
          const resolvedCount = (receipt.items || []).filter(i => i.productId).length
          const total = (receipt.items || []).reduce((sum, i) => sum + (i.price || 0), 0)

          return (
            <div key={receipt.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <button onClick={() => setExpanded(isOpen ? null : receipt.id)} style={{
                width: '100%', padding: '18px 24px', background: 'none', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', textAlign: 'left',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--green-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ReceiptText size={18} color="var(--green)" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{receipt.storeName}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--ink-faint)' }}>
                      {date ? format(date, 'MMMM d, yyyy') : 'Date unknown'} · {receipt.uploadedBy || 'Unknown'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontFamily: 'DM Serif Display, serif', fontSize: '1.1rem' }}>${total.toFixed(2)}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--ink-faint)' }}>{resolvedCount}/{receipt.items?.length || 0} tracked</div>
                  </div>
                  {isOpen ? <ChevronUp size={18} color="var(--ink-faint)" /> : <ChevronDown size={18} color="var(--ink-faint)" />}
                </div>
              </button>

              {isOpen && (
                <div style={{ borderTop: '1px solid var(--cream-dark)', padding: '0 24px 20px' }} className="animate-fade">
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr><th>Item (raw)</th><th>Product</th><th>Price</th><th>Qty</th></tr>
                      </thead>
                      <tbody>
                        {(receipt.items || []).map((item, i) => (
                          <tr key={i}>
                            <td><code style={{ fontSize: '0.78rem', background: 'var(--cream-dark)', padding: '2px 6px', borderRadius: 4 }}>{item.description || item.rawText}</code></td>
                            <td>{item.productId ? <span className="badge badge-green">{item.productName}</span> : <span className="badge badge-gray">Unknown</span>}</td>
                            <td>${(item.price || 0).toFixed(2)}</td>
                            <td style={{ color: 'var(--ink-faint)' }}>{item.quantity || 1}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
