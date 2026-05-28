import { useEffect, useState } from 'react'
import { getAllProducts, createProduct, addAliasToProduct, updateProduct } from '../lib/db'
import { CATEGORIES, CATEGORY_ICONS } from '../lib/categories'
import { Package, Plus, Pencil, Check, X } from 'lucide-react'
import { useToast } from '../hooks/useToast'

export default function Products() {
  const toast = useToast()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newAlias, setNewAlias] = useState('')
  const [filter, setFilter] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [addingAliasFor, setAddingAliasFor] = useState(null)
  const [aliasInput, setAliasInput] = useState('')
  const [editing, setEditing] = useState(null)

  async function load() {
    const p = await getAllProducts()
    setProducts(p.sort((a, b) => a.name.localeCompare(b.name)))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleCreate() {
    if (!newName.trim()) return
    try {
      await createProduct({ name: newName.trim(), category: newCategory, aliases: newAlias ? [newAlias.trim()] : [] })
      toast('Product created!')
      setNewName(''); setNewCategory(''); setNewAlias('')
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

  async function handleSaveEdit() {
    if (!editing || !editing.name.trim()) return
    try {
      await updateProduct(editing.id, { name: editing.name.trim(), category: editing.category })
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
              <tr><th>Product</th><th>Category</th><th>Aliases</th><th></th></tr>
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
    </div>
  )
}
