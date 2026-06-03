import { useEffect, useState } from 'react'
import { getAllProducts, createProduct, addAliasToProduct, updateProduct, getBlacklist, addToBlacklist } from '../lib/db'
import { CATEGORIES, CATEGORY_ICONS } from '../lib/categories'
import { Package, Plus, Pencil, Check, X, Ban } from 'lucide-react'

const SIZE_UNITS = ['oz', 'lb', 'kg', 'g', 'ml', 'l', 'fl oz', 'ct', 'pk']
import { useToast } from '../hooks/useToast'

export default function Products() {
  const toast = useToast()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newAlias, setNewAlias] = useState('')
  const [newSize, setNewSize] = useState('')
  const [newSizeUnit, setNewSizeUnit] = useState('oz')
  const [filter, setFilter] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [addingAliasFor, setAddingAliasFor] = useState(null)
  const [aliasInput, setAliasInput] = useState('')
  const [editing, setEditing] = useState(null)
  const [blacklist, setBlacklist] = useState([])
  const [showBlacklist, setShowBlacklist] = useState(false)
  const [newBlacklistEntry, setNewBlacklistEntry] = useState('')

  async function load() {
    const [p, bl] = await Promise.all([getAllProducts(), getBlacklist()])
    setProducts(p.sort((a, b) => a.name.localeCompare(b.name)))
    setBlacklist([...bl].sort())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleCreate() {
    if (!newName.trim()) return
    try {
      await createProduct({ name: newName.trim(), category: newCategory, aliases: newAlias ? [newAlias.trim()] : [], defaultSize: newSize ? parseFloat(newSize) : null, defaultUnit: newSize ? newSizeUnit : '' })
      toast('Product created!')
      setNewName(''); setNewCategory(''); setNewAlias(''); setNewSize(''); setNewSizeUnit('oz')
      setShowCreate(false); load()
    } catch (e) { toast('Failed: ' + e.message, 'error') }
  }

  async function handleAddAlias(productId) {
    if (!aliasInput.trim()) return
    try {
      await addAliasToProduct(productId, aliasInput.trim())
      toast('Alias added!')
      setAddingAliasFor(null); setAliasInput(''); load()
    } catch (e) { toast('Failed: ' + e.message, 'error') }
  }

  async function handleAddBlacklistEntry() {
    if (!newBlacklistEntry.trim()) return
    try {
      await addToBlacklist(newBlacklistEntry.trim())
      toast('Added to ignored list.')
      setNewBlacklistEntry('')
      load()
    } catch (e) { toast('Failed: ' + e.message, 'error') }
  }

  async function handleSaveEdit() {
    if (!editing || !editing.name.trim()) return
    try {
      await updateProduct(editing.id, { name: editing.name.trim(), category: editing.category, defaultSize: editing.defaultSize ? parseFloat(editing.defaultSize) : null, defaultUnit: editing.defaultUnit || '' })
      toast('Product updated!')
      setEditing(null); load()
    } catch (e) { toast('Failed: ' + e.message, 'error') }
  }

  const filtered = products.filter(p => {
    const matchText = !filter || p.name.toLowerCase().includes(filter.toLowerCase()) ||
      (p.aliases || []).some(a => a.toLowerCase().includes(filter.toLowerCase()))
    const matchCat = !filterCategory || p.category === filterCategory
    return matchText && matchCat
  })

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><div className="spinner" style={{ width: 36, height: 36, borderWidth: 3, margin: '0 auto' }} /></div>

  return (
    <div className="animate-fade">
      <div className="page-header">
        <h2>Products</h2>
        <p>Manage your product catalog and receipt abbreviation mappings.</p>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <input className="form-input" placeholder="Search products or aliases…" value={filter} onChange={e => setFilter(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
        <select className="form-select" value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_ICONS[c]} {c}</option>)}
        </select>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus size={16} /> Add Product</button>
      </div>

      {showCreate && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>New Product</h3>
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
            <div className="form-group">
              <label className="form-label">Initial Alias (optional)</label>
              <input className="form-input" placeholder="e.g. BANANAS" value={newAlias} onChange={e => setNewAlias(e.target.value)} />
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div className="form-group" style={{ marginBottom:0 }}>
                <label className="form-label">Default Size</label>
                <input className="form-input" type="number" step="0.01" min="0" placeholder="e.g. 18" value={newSize} onChange={e => setNewSize(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom:0 }}>
                <label className="form-label">Unit</label>
                <select className="form-select" value={newSizeUnit} onChange={e => setNewSizeUnit(e.target.value)}>
                  {SIZE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
            <p style={{ fontSize:'0.78rem', color:'var(--ink-faint)', marginTop:4 }}>Size is used to calculate price per oz when comparing products.</p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={!newName.trim()}>Create Product</button>
            </div>
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="empty-state"><Package size={40} /><h3>No products found</h3></div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Product</th><th>Category</th><th>Default Size</th><th>Aliases</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const isEditing = editing?.id === p.id
                return (
                  <tr key={p.id}>
                    <td>
                      {isEditing
                        ? <input className="form-input" style={{ padding: '5px 10px', fontSize: '0.875rem' }} value={editing.name} onChange={e => setEditing(v => ({ ...v, name: e.target.value }))} autoFocus onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditing(null) }} />
                        : <strong>{p.name}</strong>}
                    </td>
                    <td>
                      {isEditing
                        ? <select className="form-select" style={{ padding: '5px 10px', fontSize: '0.875rem' }} value={editing.category} onChange={e => setEditing(v => ({ ...v, category: e.target.value }))}>
                            <option value="">— Select —</option>
                            {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_ICONS[c]} {c}</option>)}
                          </select>
                        : p.category
                          ? <span style={{ fontSize: '0.82rem' }}>{CATEGORY_ICONS[p.category]} {p.category}</span>
                          : <span style={{ color: 'var(--ink-faint)' }}>—</span>}
                    </td>
                    <td>
                      {isEditing
                        ? <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                            <input className="form-input" type="number" step="0.01" min="0" placeholder="size" value={editing.defaultSize} onChange={e => setEditing(v => ({ ...v, defaultSize: e.target.value }))} style={{ width:70, padding:'5px 8px', fontSize:'0.85rem' }} />
                            <select className="form-select" style={{ padding:'5px 8px', fontSize:'0.85rem', width:70 }} value={editing.defaultUnit} onChange={e => setEditing(v => ({ ...v, defaultUnit: e.target.value }))}>
                              {SIZE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>
                        : p.defaultSize
                          ? <span className="badge badge-gray">{p.defaultSize} {p.defaultUnit}</span>
                          : <span style={{ color:'var(--ink-faint)' }}>—</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                        {(p.aliases || []).map(a => (
                          <code key={a} style={{ fontSize: '0.72rem', background: 'var(--cream-dark)', padding: '2px 7px', borderRadius: 4, color: 'var(--ink-light)' }}>{a}</code>
                        ))}
                        {!isEditing && (
                          addingAliasFor === p.id
                            ? <div style={{ display: 'flex', gap: 4 }}>
                                <input className="form-input" style={{ padding: '3px 8px', fontSize: '0.8rem', width: 140 }} placeholder="ABBREV" value={aliasInput} onChange={e => setAliasInput(e.target.value)} autoFocus
                                  onKeyDown={e => { if (e.key === 'Enter') handleAddAlias(p.id); if (e.key === 'Escape') { setAddingAliasFor(null); setAliasInput('') } }} />
                                <button className="btn btn-primary btn-sm" onClick={() => handleAddAlias(p.id)}>Add</button>
                                <button className="btn btn-ghost btn-sm" onClick={() => { setAddingAliasFor(null); setAliasInput('') }}>✕</button>
                              </div>
                            : <button onClick={() => { setAddingAliasFor(p.id); setAliasInput('') }} style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: 4, padding: '2px 6px', fontSize: '0.7rem', color: 'var(--ink-faint)', cursor: 'pointer' }}>+ alias</button>
                        )}
                      </div>
                    </td>
                    <td>
                      {isEditing
                        ? <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-primary btn-sm" onClick={handleSaveEdit} title="Save"><Check size={13} /></button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)} title="Cancel"><X size={13} /></button>
                          </div>
                        : <button className="btn btn-ghost btn-sm" onClick={() => setEditing({ id: p.id, name: p.name, category: p.category || '' })} title="Edit"><Pencil size={13} /></button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ignored / Blacklist section */}
      <div style={{ marginTop: 32 }}>
        <button
          onClick={() => setShowBlacklist(v => !v)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-light)', fontSize: '0.875rem', fontWeight: 600, padding: 0, marginBottom: showBlacklist ? 12 : 0 }}
        >
          <Ban size={15} />
          Ignored OCR strings ({blacklist.length})
          <span style={{ fontSize: '0.75rem', color: 'var(--ink-faint)', fontWeight: 400 }}>— text marked as "not a product"</span>
        </button>

        {showBlacklist && (
          <div className="card animate-fade" style={{ marginTop: 8 }}>
            <p style={{ fontSize: '0.82rem', color: 'var(--ink-faint)', marginBottom: 16 }}>
              These OCR strings are permanently ignored when scanning receipts. Remove one to be asked about it again.
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input
                className="form-input"
                placeholder="Manually add an ignored string…"
                value={newBlacklistEntry}
                onChange={e => setNewBlacklistEntry(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddBlacklistEntry() }}
                style={{ flex: 1 }}
              />
              <button className="btn btn-secondary" onClick={handleAddBlacklistEntry} disabled={!newBlacklistEntry.trim()}>Add</button>
            </div>
            {blacklist.length === 0 && <p style={{ color: 'var(--ink-faint)', fontSize: '0.85rem' }}>Nothing ignored yet.</p>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {blacklist.map(entry => (
                <RemovableTag key={entry} text={entry} onRemove={() => { /* handled via db */ toast('To remove, edit Firestore directly for now.') }} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function RemovableTag({ text, onRemove }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--red-pale)', color: 'var(--red)', border: '1px solid #f5c6c3', borderRadius: 6, padding: '3px 8px', fontSize: '0.75rem', fontFamily: 'monospace' }}>
      {text}
    </span>
  )
}