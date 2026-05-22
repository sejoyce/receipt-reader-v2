import { useState, useEffect } from 'react'
import { getAllProducts, createProduct, addAliasToProduct } from '../lib/db'

export default function AliasModal({ unknownItem, onResolved, onSkip }) {
  const [products, setProducts] = useState([])
  const [mode, setMode] = useState('search')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [newName, setNewName] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => { getAllProducts().then(setProducts) }, [])

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.aliases || []).some(a => a.toLowerCase().includes(search.toLowerCase()))
  )

  async function handleMap() {
    if (!selected) return
    setLoading(true)
    try {
      await addAliasToProduct(selected.id, unknownItem.description)
      onResolved({ ...unknownItem, productId: selected.id, productName: selected.name })
    } finally { setLoading(false) }
  }

  async function handleCreate() {
    if (!newName.trim()) return
    setLoading(true)
    try {
      const id = await createProduct({ name: newName.trim(), category: newCategory.trim(), aliases: [unknownItem.description] })
      onResolved({ ...unknownItem, productId: id, productName: newName.trim() })
    } finally { setLoading(false) }
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div style={{ marginBottom: 4 }}>
          <span className="badge badge-amber">Unknown Item</span>
        </div>
        <h3>What is this product?</h3>
        <p style={{ color: 'var(--ink-light)', fontSize: '0.9rem', marginBottom: 20 }}>
          We found <strong style={{ fontFamily: 'monospace', background: 'var(--cream-dark)', padding: '2px 6px', borderRadius: 4 }}>{unknownItem.description}</strong> on your receipt for <strong>${unknownItem.price?.toFixed(2)}</strong>. Map it to a product so we can track its price over time.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <button className={`btn btn-sm ${mode === 'search' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setMode('search')}>Match existing</button>
          <button className={`btn btn-sm ${mode === 'create' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setMode('create')}>Create new product</button>
        </div>

        {mode === 'search' && (
          <>
            <div className="form-group">
              <input className="form-input" placeholder="Search products…" value={search} onChange={e => setSearch(e.target.value)} autoFocus />
            </div>
            <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filtered.length === 0 && (
                <p style={{ color: 'var(--ink-faint)', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0' }}>No products found. Try creating a new one.</p>
              )}
              {filtered.map(p => (
                <button key={p.id} onClick={() => setSelected(p)} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s',
                  border: `1.5px solid ${selected?.id === p.id ? 'var(--green)' : 'var(--border)'}`,
                  background: selected?.id === p.id ? 'var(--green-pale)' : 'white',
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{p.name}</div>
                    {p.category && <div style={{ fontSize: '0.75rem', color: 'var(--ink-faint)' }}>{p.category}</div>}
                  </div>
                  {p.aliases?.length > 0 && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--ink-faint)' }}>{p.aliases.slice(0, 2).join(', ')}</div>
                  )}
                </button>
              ))}
            </div>
          </>
        )}

        {mode === 'create' && (
          <>
            <div className="form-group">
              <label className="form-label">Product Name *</label>
              <input className="form-input" placeholder="e.g. Whole Milk 1 Gallon" value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Category</label>
              <input className="form-input" placeholder="e.g. Dairy, Produce, Bread" value={newCategory} onChange={e => setNewCategory(e.target.value)} />
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--ink-faint)' }}>"{unknownItem.description}" will be saved as an alias for this product.</p>
          </>
        )}

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onSkip}>Skip for now</button>
          {mode === 'search' ? (
            <button className="btn btn-primary" onClick={handleMap} disabled={!selected || loading}>
              {loading ? <span className="spinner" /> : null} Map to {selected?.name || '…'}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleCreate} disabled={!newName.trim() || loading}>
              {loading ? <span className="spinner" /> : null} Create & Save
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
