import { useEffect, useState } from 'react'
import { getAllReceipts, updateReceipt, deleteReceipt } from '../lib/db'
import { CATEGORIES, CATEGORY_ICONS } from '../lib/categories'
import { format } from 'date-fns'
import { ReceiptText, ChevronDown, ChevronUp, Pencil, Trash2, Check, X, Scale } from 'lucide-react'
import { useToast } from '../hooks/useToast'

function toDate(val) {
  if (!val) return null
  if (val.toDate) return val.toDate()
  return new Date(val)
}

function toDateStr(val) {
  const d = toDate(val)
  if (!d || isNaN(d)) return ''
  return format(d, 'yyyy-MM-dd')
}

export default function ReceiptLog() {
  const toast = useToast()
  const [receipts, setReceipts] = useState([])
  const [expanded, setExpanded] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  // Edit state: { id, storeName, storeAddress, date, items }
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)

  async function load() {
    const r = await getAllReceipts()
    setReceipts(r)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = receipts.filter(r =>
    !filter || r.storeName?.toLowerCase().includes(filter.toLowerCase()) ||
    r.uploadedBy?.toLowerCase().includes(filter.toLowerCase())
  )

  async function handleSaveEdit() {
    if (!editing) return
    setSaving(true)
    try {
      await updateReceipt(editing.id, {
        storeName: editing.storeName,
        storeAddress: editing.storeAddress,
        date: editing.date || null,
        items: editing.items,
      })
      toast('Receipt updated!')
      setEditing(null)
      load()
    } catch (e) {
      toast('Failed: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(receiptId) {
    try {
      await deleteReceipt(receiptId)
      setConfirmDelete(null)
      setExpanded(null)
      toast('Receipt deleted.')
      load()
    } catch (e) {
      toast('Failed: ' + e.message, 'error')
    }
  }

  function startEdit(receipt) {
    setEditing({
      id: receipt.id,
      storeName: receipt.storeName || '',
      storeAddress: receipt.storeAddress || '',
      date: toDateStr(receipt.date),
      items: (receipt.items || []).map(i => ({ ...i })),
    })
  }

  function updateEditItem(idx, field, value) {
    setEditing(prev => ({
      ...prev,
      items: prev.items.map((it, i) => i === idx ? { ...it, [field]: field === 'price' ? parseFloat(value) || 0 : value } : it)
    }))
  }

  function removeEditItem(idx) {
    setEditing(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }))
  }

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 80 }}>
      <div className="spinner" style={{ width: 36, height: 36, borderWidth: 3, margin: '0 auto 16px' }} />
    </div>
  )

  return (
    <div className="animate-fade">
      <div className="page-header">
        <h2>Receipt Log</h2>
        <p>All your scanned receipts — tap to expand, edit, or delete.</p>
      </div>

      <div style={{ marginBottom: 20 }}>
        <input className="form-input" placeholder="Filter by store or uploader…" value={filter} onChange={e => setFilter(e.target.value)} style={{ maxWidth: 320 }} />
      </div>

      {filtered.length === 0 && (
        <div className="empty-state"><ReceiptText size={40} /><h3>No receipts found</h3><p>Upload your first receipt to get started.</p></div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 380, textAlign: 'center' }}>
            <Trash2 size={36} color="var(--red)" style={{ marginBottom: 12 }} />
            <h3 style={{ marginBottom: 8 }}>Delete this receipt?</h3>
            <p style={{ color: 'var(--ink-light)', fontSize: '0.875rem', marginBottom: 24 }}>
              This will permanently delete the receipt and all its price history entries. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleDelete(confirmDelete)}>Delete receipt</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 680, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3>Edit Receipt</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}><X size={16} /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Store Name</label>
                <input className="form-input" value={editing.storeName} onChange={e => setEditing(v => ({ ...v, storeName: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Date</label>
                <input className="form-input" type="date" value={editing.date} onChange={e => setEditing(v => ({ ...v, date: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                <label className="form-label">Store Address</label>
                <input className="form-input" value={editing.storeAddress} onChange={e => setEditing(v => ({ ...v, storeAddress: e.target.value }))} />
              </div>
            </div>

            <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink-light)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Items</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {editing.items.map((item, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center', padding: '10px 12px', background: 'var(--cream)', borderRadius: 8 }}>
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{item.productName || <span style={{ color: 'var(--ink-faint)', fontWeight: 400 }}>{item.description}</span>}</div>
                    {item.weight && <div style={{ fontSize: '0.72rem', color: 'var(--ink-faint)' }}><Scale size={10} style={{ display: 'inline', marginRight: 3 }} />{item.weight} {item.unit} @ ${item.pricePerUnit}/{item.unit}</div>}
                    {item.packageSize && <div style={{ fontSize: '0.72rem', color: 'var(--ink-faint)' }}>{item.packageSize} {item.packageUnit}</div>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--ink-faint)' }}>$</span>
                    <input
                      type="number" step="0.01" min="0"
                      value={item.price ?? ''}
                      onChange={e => updateEditItem(idx, 'price', e.target.value)}
                      style={{ width: 72, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.85rem' }}
                    />
                  </div>
                  <button className="btn btn-danger btn-sm" onClick={() => removeEditItem(idx)}>✕</button>
                </div>
              ))}
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveEdit} disabled={saving}>
                {saving ? <span className="spinner" /> : <Check size={14} />} Save changes
              </button>
            </div>
          </div>
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
              <div style={{ display: 'flex', alignItems: 'center' }}>
                {/* Expand toggle */}
                <button onClick={() => setExpanded(isOpen ? null : receipt.id)} style={{ flex: 1, padding: '18px 20px', background: 'none', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--green-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <ReceiptText size={18} color="var(--green)" />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>{receipt.storeName}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--ink-faint)' }}>
                        {date ? format(date, 'MMMM d, yyyy') : 'Date unknown'} · {receipt.uploadedBy || 'Unknown'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 700, fontFamily: 'DM Serif Display, serif', fontSize: '1.1rem' }}>${total.toFixed(2)}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--ink-faint)' }}>{resolvedCount}/{receipt.items?.length || 0} tracked</div>
                    </div>
                    {isOpen ? <ChevronUp size={18} color="var(--ink-faint)" /> : <ChevronDown size={18} color="var(--ink-faint)" />}
                  </div>
                </button>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 6, padding: '0 16px', borderLeft: '1px solid var(--cream-dark)' }}>
                  <button className="btn btn-ghost btn-sm" title="Edit receipt" onClick={() => startEdit(receipt)}><Pencil size={14} /></button>
                  <button className="btn btn-danger btn-sm" title="Delete receipt" onClick={() => setConfirmDelete(receipt.id)}><Trash2 size={14} /></button>
                </div>
              </div>

              {isOpen && (
                <div style={{ borderTop: '1px solid var(--cream-dark)', padding: '0 20px 20px' }} className="animate-fade">
                  {receipt.storeAddress && (
                    <p style={{ fontSize: '0.78rem', color: 'var(--ink-faint)', padding: '10px 0 4px' }}>{receipt.storeAddress}</p>
                  )}
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr><th>Item</th><th>Product</th><th>Size/Weight</th><th>Price</th></tr>
                      </thead>
                      <tbody>
                        {(receipt.items || []).map((item, i) => (
                          <tr key={i}>
                            <td><code style={{ fontSize: '0.78rem', background: 'var(--cream-dark)', padding: '2px 6px', borderRadius: 4 }}>{item.description || item.rawText}</code></td>
                            <td>{item.productId ? <span className="badge badge-green">{item.productName}</span> : <span className="badge badge-gray">Unknown</span>}</td>
                            <td style={{ fontSize: '0.8rem', color: 'var(--ink-light)' }}>
                              {item.weight
                                ? <span><Scale size={11} style={{ display: 'inline', marginRight: 3 }} />{item.weight} {item.unit} @ ${item.pricePerUnit}/{item.unit}</span>
                                : item.packageSize ? `${item.packageSize} ${item.packageUnit}`
                                : item.quantity > 1 ? `×${item.quantity}` : '—'}
                            </td>
                            <td>${(item.price || 0).toFixed(2)}</td>
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
