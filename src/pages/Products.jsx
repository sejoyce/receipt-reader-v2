import { useEffect, useState } from 'react'
import { getAllProducts, createProduct, addAliasToProduct, updateProduct } from '../lib/db'
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
  const [addingAliasFor, setAddingAliasFor] = useState(null)
  const [aliasInput, setAliasInput] = useState('')
  // Inline editing state: { id, name, category }
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
      await createProduct({ name: newName.trim(), category: newCategory.trim(), aliases: newAlias ? [newAlias.trim()] : [] })
      toast('Product created!')
      setNewName(''); setNewCategory(''); setNewAlias('')
      setShowCreate(false)
      load()
    } catch (e) { toast('Failed: ' + e.message, 'error') }
  }

  async function handleAddAlias(productId) {
    if (!aliasInput.trim()) return
    try {
      await addAliasToProduct(productId, aliasInput.trim())
      toast('Alias added!')
      setAddingAliasFor(null); setAliasInput('')
      load()
    } catch (e) { toast('Failed: ' + e.message, 'error') }
  }

  async function handleSaveEdit() {
    if (!editing || !editing.name.trim()) return
    try {
      await updateProduct(editing.id, { name: editing.name.trim(), category: editing.category.trim() })
      toast('Product updated!')
      setEditing(null)
      load()
    } catch (e) { toast('Failed: ' + e.message, 'error') }
  }

  const filtered = products.filter(p =>
    !filter || p.name.toLowerCase().includes(filter.toLowerCase()) ||
    p.category?.toLowerCase().includes(filter.toLowerCase()) ||
    (p.aliases || []).some(a => a.toLowerCase().includes(filter.toLowerCase()))
  )

  const categories = [...new Set(products.map(p => p.category).filter(Boolean))].sort()

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><div className="spinner" style={{ width: 36, height: 36, borderWidth: 3, margin: '0 auto' }} /></div>

  return (
    <div className="animate-fade">
      <div className="page-header">
        <h2>Products</h2>
        <p>Manage your product catalog and receipt abbreviation mappings.</p>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <input className="form-input" placeholder="Search products or aliases…" value={filter} onChange={e => setFilter(e.target.value)} style={{ flex: 1, maxWidth: 320 }} />
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Plus size={16} /> Add Product</button>
      </div>

      {showCreate && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>New Product</h3>
            <p style={{ color: 'var(--ink-light)', fontSize: '0.875rem', marginBottom: 20 }}>Aliases are added automatically when you scan receipts.</p>
            <div className="form-group">
              <label className="form-label">Product Name *</label>
              <input className="form-input" placeholder="e.g. Organic Whole Milk 1 Gallon" value={newName} onChange={e => setNewName(e.target.value)} autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Category</label>
              <input className="form-input" placeholder="e.g. Dairy" list="cat-list" value={newCategory} onChange={e => setNewCategory(e.target.value)} />
              <datalist id="cat-list">{categories.map(c => <option key={c} value={c} />)}</datalist>
            </div>
            <div className="form-group">
              <label className="form-label">Initial Alias (optional)</label>
              <input className="form-input" placeholder="e.g. ORG WHL MLK" value={newAlias} onChange={e => setNewAlias(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={!newName.trim()}>Create Product</button>
            </div>
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="empty-state">
          <Package size={40} />
          <h3>No products yet</h3>
          <p>Products are created when you resolve unknown items on receipts, or add them manually here.</p>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Product</th><th>Category</th><th>Aliases (receipt codes)</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const isEditing = editing?.id === p.id
                return (
                  <tr key={p.id}>
                    <td>
                      {isEditing ? (
                        <input
                          className="form-input"
                          style={{ padding: '5px 10px', fontSize: '0.875rem' }}
                          value={editing.name}
                          onChange={e => setEditing(v => ({ ...v, name: e.target.value }))}
                          autoFocus
                          onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditing(null) }}
                        />
                      ) : (
                        <strong>{p.name}</strong>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          className="form-input"
                          style={{ padding: '5px 10px', fontSize: '0.875rem', width: 140 }}
                          list="cat-list-edit"
                          value={editing.category}
                          onChange={e => setEditing(v => ({ ...v, category: e.target.value }))}
                          placeholder="Category"
                        />
                      ) : (
                        p.category ? <span className="badge badge-gray">{p.category}</span> : <span style={{ color: 'var(--ink-faint)' }}>—</span>
                      )}
                      <datalist id="cat-list-edit">{categories.map(c => <option key={c} value={c} />)}</datalist>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                        {(p.aliases || []).map(a => (
                          <code key={a} style={{ fontSize: '0.72rem', background: 'var(--cream-dark)', padding: '2px 7px', borderRadius: 4, color: 'var(--ink-light)' }}>{a}</code>
                        ))}
                        {!isEditing && (
                          addingAliasFor === p.id ? (
                            <div style={{ display: 'flex', gap: 4 }}>
                              <input className="form-input" style={{ padding: '3px 8px', fontSize: '0.8rem', width: 140 }} placeholder="ABBREV" value={aliasInput} onChange={e => setAliasInput(e.target.value)} autoFocus
                                onKeyDown={e => { if (e.key === 'Enter') handleAddAlias(p.id); if (e.key === 'Escape') { setAddingAliasFor(null); setAliasInput('') } }} />
                              <button className="btn btn-primary btn-sm" onClick={() => handleAddAlias(p.id)}>Add</button>
                              <button className="btn btn-ghost btn-sm" onClick={() => { setAddingAliasFor(null); setAliasInput('') }}>✕</button>
                            </div>
                          ) : (
                            <button onClick={() => { setAddingAliasFor(p.id); setAliasInput('') }}
                              style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: 4, padding: '2px 6px', fontSize: '0.7rem', color: 'var(--ink-faint)', cursor: 'pointer' }}>
                              + alias
                            </button>
                          )
                        )}
                      </div>
                    </td>
                    <td>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-primary btn-sm" onClick={handleSaveEdit} title="Save"><Check size={13} /></button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)} title="Cancel"><X size={13} /></button>
                        </div>
                      ) : (
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditing({ id: p.id, name: p.name, category: p.category || '' })} title="Edit name & category">
                          <Pencil size={13} />
                        </button>
                      )}
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
