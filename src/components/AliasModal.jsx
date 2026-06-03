import { useState, useEffect } from 'react'
import { getAllProducts, createProduct, addAliasToProduct, addToBlacklist } from '../lib/db'
import { CATEGORIES, CATEGORY_ICONS } from '../lib/categories'
import { Ban } from 'lucide-react'

const SIZE_UNITS = ['oz', 'lb', 'kg', 'g', 'ml', 'l', 'fl oz', 'ct', 'pk']

export default function AliasModal({ unknownItem, onResolved, onSkip, onBlacklist }) {
  const [products, setProducts] = useState([])
  const [mode, setMode] = useState('search')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [newName, setNewName] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newSize, setNewSize] = useState('')
  const [newSizeUnit, setNewSizeUnit] = useState('oz')
  const [loading, setLoading] = useState(false)
  const [blacklisting, setBlacklisting] = useState(false)
  const [confirmBlacklist, setConfirmBlacklist] = useState(false)

  // Reload products on mount
  useEffect(() => { getAllProducts().then(setProducts) }, [])

  // Reset form state whenever the unknown item changes (next item in queue)
  useEffect(() => {
    setMode('search')
    setSearch('')
    setSelected(null)
    setNewName('')
    setNewCategory('')
    setNewSize('')
    setNewSizeUnit('oz')
    setConfirmBlacklist(false)
  }, [unknownItem?.description])

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
      const id = await createProduct({ name: newName.trim(), category: newCategory, aliases: [unknownItem.description], defaultSize: newSize ? parseFloat(newSize) : null, defaultUnit: newSize ? newSizeUnit : '' })
      onResolved({ ...unknownItem, productId: id, productName: newName.trim() })
    } finally { setLoading(false) }
  }

  async function handleBlacklist() {
    setBlacklisting(true)
    try {
      await addToBlacklist(unknownItem.description)
      onBlacklist(unknownItem)
    } finally { setBlacklisting(false) }
  }

  // Confirmation step before blacklisting
  if (confirmBlacklist) {
    return (
      <div className="modal-overlay">
        <div className="modal" style={{ maxWidth: 400, textAlign: 'center' }}>
          <Ban size={36} color="var(--red)" style={{ marginBottom: 12 }} />
          <h3 style={{ marginBottom: 8 }}>Never ask about this again?</h3>
          <p style={{ color: 'var(--ink-light)', fontSize: '0.875rem', marginBottom: 8 }}>
            <code style={{ background: 'var(--cream-dark)', padding: '2px 8px', borderRadius: 4 }}>{unknownItem.description}</code>
          </p>
          <p style={{ color: 'var(--ink-light)', fontSize: '0.875rem', marginBottom: 24 }}>
            This text will be permanently ignored on all future receipts. It won't be tracked as a product.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn btn-ghost" onClick={() => setConfirmBlacklist(false)}>Go back</button>
            <button className="btn btn-danger" onClick={handleBlacklist} disabled={blacklisting}>
              {blacklisting ? <span className="spinner" /> : <Ban size={14} />} Yes, ignore it
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div style={{ marginBottom: 4 }}><span className="badge badge-amber">Unknown Item</span></div>
        <h3>What is this product?</h3>
        <p style={{ color: 'var(--ink-light)', fontSize: '0.9rem', marginBottom: 20 }}>
          Found <strong style={{ fontFamily: 'monospace', background: 'var(--cream-dark)', padding: '2px 6px', borderRadius: 4 }}>{unknownItem.description}</strong> for <strong>${unknownItem.price?.toFixed(2)}</strong>.
          Map it to a product to track its price over time.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <button className={`btn btn-sm ${mode === 'search' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setMode('search')}>Match existing</button>
          <button className={`btn btn-sm ${mode === 'create' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setMode('create')}>Create new</button>
          <button
            className="btn btn-sm"
            onClick={() => setConfirmBlacklist(true)}
            style={{ marginLeft: 'auto', background: 'var(--red-pale)', color: 'var(--red)', border: '1px solid #f5c6c3', display: 'flex', alignItems: 'center', gap: 5 }}
            title="Mark as not a product — will be ignored on future receipts"
          >
            <Ban size={13} /> Not a product
          </button>
        </div>

        {mode === 'search' && (
          <>
            <div className="form-group">
              <input className="form-input" placeholder="Search products…" value={search} onChange={e => setSearch(e.target.value)} autoFocus />
            </div>
            <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filtered.length === 0 && <p style={{ color: 'var(--ink-faint)', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0' }}>No products found.</p>}
              {filtered.map(p => (
                <button key={p.id} onClick={() => setSelected(p)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s', border: `1.5px solid ${selected?.id === p.id ? 'var(--green)' : 'var(--border)'}`, background: selected?.id === p.id ? 'var(--green-pale)' : 'white' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{p.name}</div>
                    {p.category && <div style={{ fontSize: '0.75rem', color: 'var(--ink-faint)' }}>{CATEGORY_ICONS[p.category]} {p.category}</div>}
                  </div>
                  {p.aliases?.length > 0 && <div style={{ fontSize: '0.7rem', color: 'var(--ink-faint)' }}>{p.aliases.slice(0, 2).join(', ')}</div>}
                </button>
              ))}
            </div>
          </>
        )}

        {mode === 'create' && (
          <>
            <div className="form-group">
              <label className="form-label">Product Name *</label>
              <input className="form-input" placeholder="e.g. Banana" value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Category</label>
              <select className="form-select" value={newCategory} onChange={e => setNewCategory(e.target.value)}>
                <option value="">— Select a category —</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_ICONS[c]} {c}</option>)}
              </select>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div className="form-group" style={{ marginBottom:0 }}>
                <label className="form-label">Default Size <span style={{ color:'var(--ink-faint)', fontWeight:400 }}>(optional)</span></label>
                <input className="form-input" type="number" step="0.01" min="0" placeholder="e.g. 18" value={newSize} onChange={e => setNewSize(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom:0 }}>
                <label className="form-label">Unit</label>
                <select className="form-select" value={newSizeUnit} onChange={e => setNewSizeUnit(e.target.value)}>
                  {SIZE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--ink-faint)', marginTop: 8 }}>"{unknownItem.description}" will be saved as an alias. Size helps compare price per oz across different package sizes.</p>
          </>
        )}

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onSkip}>Skip for now</button>
          {mode === 'search'
            ? <button className="btn btn-primary" onClick={handleMap} disabled={!selected || loading}>{loading ? <span className="spinner" /> : null} Map to {selected?.name || '…'}</button>
            : <button className="btn btn-primary" onClick={handleCreate} disabled={!newName.trim() || loading}>{loading ? <span className="spinner" /> : null} Create & Save</button>
          }
        </div>
      </div>
    </div>
  )
}
