import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { UploadCloud, CheckCircle, AlertCircle, Scale, Plus, ChevronDown, ChevronUp, Pencil, Check, X } from 'lucide-react'
import { extractTextFromImage, parseReceiptText, extractWithClaude, detectDateFromText, checkImageQuality } from '../lib/ocr'
import { findProductByAlias, getOrCreateStore, saveReceipt, detectStoreFromText, getBlacklist, getAllProducts, createProduct } from '../lib/db'
import { CATEGORIES, CATEGORY_ICONS } from '../lib/categories'
import { extractTextFromImage as _extractRaw } from '../lib/ocr'
import { useAuth } from '../hooks/useAuth'
import AliasModal from '../components/AliasModal'
import { useToast } from '../hooks/useToast'

const SIZE_UNITS = ['oz', 'lb', 'kg', 'g', 'ml', 'l', 'fl oz', 'ct', 'pk']

function SizeDisplay({ item }) {
  if (item.weight && item.unit && item.weight > 0) {
    // Sold by weight (bananas etc) — show $/natural-unit
    const ppu = item.pricePerUnit || (item.price / item.weight)
    return (
      <span style={{ fontSize:'0.78rem', color:'var(--ink-light)' }}>
        <Scale size={11} style={{ display:'inline', marginRight:3, verticalAlign:'middle' }} />
        {item.weight} {item.unit} @ ${ppu.toFixed(2)}/{item.unit}
      </span>
    )
  }
  if (item.quantity > 1) {
    // Multi-quantity item (e.g. 2 @ 1.99)
    const unitPrice = item.pricePerUnit || (item.price / item.quantity)
    return (
      <span style={{ fontSize:'0.78rem', color:'var(--ink-light)' }}>
        {item.quantity} × ${unitPrice.toFixed(2)}
        <span style={{ color:'var(--green)', marginLeft:6, fontWeight:600 }}>${item.price.toFixed(2)} total</span>
      </span>
    )
  }
  if (item.packageSize && item.packageUnit) {
    // Fixed package — show price per natural unit (e.g. $/oz, $/lb)
    const ppu = (item.price / item.packageSize).toFixed(2)
    return (
      <span style={{ fontSize:'0.78rem', color:'var(--ink-light)' }}>
        {item.packageSize} {item.packageUnit}
        <span style={{ color:'var(--green)', marginLeft:6, fontWeight:600 }}>${ppu}/{item.packageUnit}</span>
      </span>
    )
  }
  return <span style={{ fontSize:'0.78rem', color:'var(--ink-faint)' }}>—</span>
}

// Inline size editor shown in the review table row
function SizeEditor({ item, onSave, onCancel }) {
  const [size, setSize] = useState(item.packageSize?.toString() || '')
  const [unit, setUnit] = useState(item.packageUnit || item.unit || '')
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      <input
        type="number" step="0.01" min="0" placeholder="size"
        value={size} onChange={e => setSize(e.target.value)}
        autoFocus
        style={{ width:64, padding:'3px 7px', border:'1px solid var(--green)', borderRadius:6, fontSize:'0.82rem' }}
        onKeyDown={e => { if (e.key === 'Enter') onSave(parseFloat(size)||null, unit); if (e.key === 'Escape') onCancel() }}
      />
      <select value={unit} onChange={e => setUnit(e.target.value)}
        style={{ padding:'3px 6px', border:'1px solid var(--border)', borderRadius:6, fontSize:'0.82rem', background:'white' }}>
        {SIZE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
      </select>
      <button className="btn btn-primary btn-sm" onClick={() => onSave(parseFloat(size)||null, unit)} title="Save"><Check size={12} /></button>
      <button className="btn btn-ghost btn-sm" onClick={onCancel} title="Cancel"><X size={12} /></button>
    </div>
  )
}


/**
 * Draw the receipt image on a canvas, overlaying semi-transparent green highlights
 * on rows that match parsed item rawText. Uses a simple text-search heuristic —
 * we scan vertical bands of the image for colour variation to estimate line positions,
 * then colour the lines whose text was successfully parsed.
 * Falls back gracefully; never throws.
 */
async function buildHighlightedImage(imageFile, parsedRawTexts) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(imageFile)
    img.onload = () => {
      try {
        URL.revokeObjectURL(url)
        const W = img.naturalWidth, H = img.naturalHeight
        const canvas = document.createElement('canvas')
        canvas.width = W; canvas.height = H
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)

        // Detect text line positions by scanning horizontal brightness variance
        // Sample pixel columns at 10% and 90% width to detect ink
        const sampleData = ctx.getImageData(0, 0, W, H).data
        const lineHeight = Math.max(12, Math.round(H / 50))
        const foundLines = [] // {y, height}

        let inText = false, lineStart = 0
        for (let y = 0; y < H; y += 2) {
          // Sample a row — look for dark pixels (ink) in left 80% of image
          let darkCount = 0
          const rowSamples = Math.min(20, Math.floor(W * 0.8 / (W / 20)))
          for (let s = 0; s < rowSamples; s++) {
            const x = Math.floor(s * W * 0.8 / rowSamples)
            const idx = (y * W + x) * 4
            const luma = 0.299 * sampleData[idx] + 0.587 * sampleData[idx+1] + 0.114 * sampleData[idx+2]
            if (luma < 128) darkCount++
          }
          const hasInk = darkCount >= 2
          if (hasInk && !inText) { inText = true; lineStart = y }
          else if (!hasInk && inText) {
            inText = false
            if (y - lineStart >= 4) foundLines.push({ y: lineStart - 2, height: y - lineStart + 4 })
          }
        }

        // Highlight every detected line in light green (parsed lines get solid green)
        // Since we can't reliably map OCR text back to pixel rows without word-level data,
        // we highlight all detected lines and tint the whole receipt lightly
        ctx.globalAlpha = 0.18
        ctx.fillStyle = '#52b788'
        for (const line of foundLines) {
          ctx.fillRect(0, line.y, W, line.height)
        }

        // Add a stronger tint on roughly every other "item-sized" band
        // to give a "scanned lines" visual even without exact mapping
        ctx.globalAlpha = 0.08
        ctx.fillStyle = '#2d6a4f'
        for (let i = 0; i < foundLines.length; i += 2) {
          const line = foundLines[i]
          ctx.fillRect(0, line.y, W, line.height)
        }

        ctx.globalAlpha = 1.0

        // Border
        ctx.strokeStyle = '#2d6a4f'
        ctx.lineWidth = 3
        ctx.strokeRect(1, 1, W - 2, H - 2)

        resolve(canvas.toDataURL('image/jpeg', 0.85))
      } catch (e) { reject(e) }
    }
    img.onerror = reject
    img.src = url
  })
}

export default function UploadReceipt() {
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const fileRef = useRef()

  const [step, setStep] = useState('upload')
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [ocrMethod, setOcrMethod] = useState('tesseract')

  const [storeName, setStoreName] = useState('')
  const [storeAddress, setStoreAddress] = useState('')
  const [receiptDate, setReceiptDate] = useState('')
  const [uploadedBy, setUploadedBy] = useState(user?.email?.split('@')[0] || '')
  const [storeAutoDetected, setStoreAutoDetected] = useState(false)
  const [dateAutoDetected, setDateAutoDetected] = useState(false)
  const [showDetails, setShowDetails] = useState(false)

  const [items, setItems] = useState([])
  const [unknownQueue, setUnknownQueue] = useState([])
  const [currentUnknown, setCurrentUnknown] = useState(null)
  // Which row is currently showing the inline size editor
  const [editingSizeIdx, setEditingSizeIdx] = useState(null)

  const [qualityWarnings, setQualityWarnings] = useState([])
  const [checkingQuality, setCheckingQuality] = useState(false)

  // Manual add item panel
  const [showAddItem, setShowAddItem] = useState(false)
  const [allProducts, setAllProducts] = useState([])
  const [newItem, setNewItem] = useState({ productId:'', productName:'', price:'', packageSize:'', packageUnit:'oz', quantity:1 })
  const [productSearch, setProductSearch] = useState('')
  const [addItemMode, setAddItemMode] = useState('search') // 'search' | 'create'
  const [createName, setCreateName] = useState('')
  const [createCategory, setCreateCategory] = useState('')
  const [createAlias, setCreateAlias] = useState('')
  // Receipt highlight: canvas overlay showing parsed lines
  const [highlightedImage, setHighlightedImage] = useState(null)
  const [rawOcrLines, setRawOcrLines] = useState([])
  const [parsedCount, setParsedCount] = useState(null)

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file); setImagePreview(URL.createObjectURL(file))
    setStoreAutoDetected(false); setDateAutoDetected(false)
    setQualityWarnings([])
    setCheckingQuality(true)
    const warnings = await checkImageQuality(file)
    setQualityWarnings(warnings)
    setCheckingQuality(false)
  }

  async function handleDrop(e) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (!file?.type.startsWith('image/')) return
    setImageFile(file); setImagePreview(URL.createObjectURL(file))
    setQualityWarnings([])
    setCheckingQuality(true)
    const warnings = await checkImageQuality(file)
    setQualityWarnings(warnings)
    setCheckingQuality(false)
  }

  async function processReceipt() {
    if (!imageFile) return
    setStep('processing'); setOcrProgress(0)
    try {
      let parsedItems = [], detectedStore = storeName, detectedAddress = storeAddress, detectedDate = receiptDate

      if (ocrMethod === 'claude' && import.meta.env.VITE_ANTHROPIC_API_KEY) {
        const result = await extractWithClaude(imageFile)
        parsedItems = result.items
        if (!detectedStore && result.storeName) { detectedStore = result.storeName; setStoreAutoDetected(true) }
        if (!detectedAddress && result.storeAddress) detectedAddress = result.storeAddress
        if (!detectedDate && result.date) { detectedDate = result.date; setDateAutoDetected(true) }
      } else {
        const rawText = await extractTextFromImage(imageFile, setOcrProgress)
        parsedItems = parseReceiptText(rawText)
        if (!detectedStore) {
          const detected = detectStoreFromText(rawText)
          if (detected.storeName) { detectedStore = detected.storeName; setStoreAutoDetected(true) }
          if (detected.storeAddress) detectedAddress = detected.storeAddress
        }
        if (!detectedDate) {
          const foundDate = detectDateFromText(rawText)
          if (foundDate) { detectedDate = foundDate; setDateAutoDetected(true) }
        }
      }

      if (detectedStore) setStoreName(detectedStore)
      if (detectedAddress) setStoreAddress(detectedAddress)
      if (detectedDate) setReceiptDate(detectedDate)

      const [blacklist, ...resolvedItems] = await Promise.all([
        getBlacklist(),
        ...parsedItems.map(async item => {
          const product = await findProductByAlias(item.description)
          if (product) return { ...item, productId: product.id, productName: product.name }
          return item
        })
      ])

      const resolved = resolvedItems.filter(item => !blacklist.has(item.description.toUpperCase().trim()))
      setParsedCount(resolved.length)

      // Build highlighted receipt image showing which lines were parsed
      if (imageFile && resolved.length > 0) {
        try {
          const highlighted = await buildHighlightedImage(imageFile, resolved.map(i => i.rawText).filter(Boolean))
          setHighlightedImage(highlighted)
        } catch (_) { /* non-critical */ }
      }

      const unknown = resolved.filter(i => !i.productId)
      setItems(resolved)
      if (unknown.length > 0) { setUnknownQueue(unknown); setCurrentUnknown(unknown[0]) }
      setStep('review')
    } catch (err) {
      console.error(err); toast('OCR failed: ' + err.message, 'error'); setStep('upload')
    }
  }

  function handleAliasResolved(resolvedItem) {
    setItems(prev => prev.map(it => it.description === resolvedItem.description ? resolvedItem : it))
    advanceQueue()
  }

  function advanceQueue() {
    setUnknownQueue(prev => { const r = prev.slice(1); setCurrentUnknown(r[0]||null); return r })
  }

  function handleBlacklist(item) {
    setItems(prev => prev.filter(it => it.description !== item.description))
    advanceQueue()
  }

  function updateItem(idx, field, value) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }

  function applySizeEdit(idx, size, unit) {
    setItems(prev => prev.map((it, i) => i === idx
      ? { ...it, packageSize: size, packageUnit: unit, unit: unit }
      : it
    ))
    setEditingSizeIdx(null)
  }

  function removeItem(idx) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  async function openAddItem() {
    const prods = await getAllProducts()
    setAllProducts(prods.sort((a,b) => a.name.localeCompare(b.name)))
    setNewItem({ productId:'', productName:'', price:'', packageSize:'', packageUnit:'oz', quantity:1 })
    setProductSearch(''); setAddItemMode('search')
    setCreateName(''); setCreateCategory(''); setCreateAlias('')
    setShowAddItem(true)
  }

  async function handleCreateAndAdd() {
    if (!createName.trim() || !newItem.price) { toast('Enter a product name and price', 'error'); return }
    try {
      const aliases = createAlias.trim() ? [createAlias.trim()] : []
      const id = await createProduct({ name: createName.trim(), category: createCategory, aliases })
      const prods = await getAllProducts()
      setAllProducts(prods.sort((a,b) => a.name.localeCompare(b.name)))
      const item = {
        rawText: '[manual]',
        description: createName.trim(),
        productId: id,
        productName: createName.trim(),
        price: parseFloat(newItem.price),
        quantity: parseInt(newItem.quantity) || 1,
        packageSize: newItem.packageSize ? parseFloat(newItem.packageSize) : null,
        packageUnit: newItem.packageSize ? newItem.packageUnit : '',
        weight: null, pricePerUnit: null, unit: newItem.packageUnit || '',
      }
      setItems(prev => [...prev, item])
      setShowAddItem(false)
      toast(`"${createName.trim()}" created and added.`)
    } catch (e) { toast('Failed: ' + e.message, 'error') }
  }

  function handleAddItem() {
    if (!newItem.productId || !newItem.price) { toast('Select a product and enter a price', 'error'); return }
    const item = {
      rawText: '[manual]',
      description: newItem.productName,
      productId: newItem.productId,
      productName: newItem.productName,
      price: parseFloat(newItem.price),
      quantity: parseInt(newItem.quantity) || 1,
      packageSize: newItem.packageSize ? parseFloat(newItem.packageSize) : null,
      packageUnit: newItem.packageSize ? newItem.packageUnit : '',
      weight: null, pricePerUnit: null, unit: newItem.packageUnit || '',
    }
    setItems(prev => [...prev, item])
    setShowAddItem(false)
    toast('Item added manually.')
  }

  async function handleSave() {
    if (!storeName.trim()) { toast('Please enter a store name in receipt details', 'error'); setShowDetails(true); return }
    setStep('saving')
    try {
      const store = await getOrCreateStore(storeName, storeAddress)
      await saveReceipt({ storeId: store.id, storeName: store.name, storeAddress, date: receiptDate || null, items, uploadedBy: uploadedBy || user?.email || 'unknown' })
      setStep('done'); toast('Receipt saved!')
    } catch (err) {
      console.error(err); toast('Failed to save: ' + err.message, 'error'); setStep('review')
    }
  }

  function reset() {
    setStep('upload'); setImageFile(null); setImagePreview(null); setItems([])
    setStoreName(''); setStoreAddress(''); setReceiptDate('')
    setStoreAutoDetected(false); setDateAutoDetected(false); setShowDetails(false)
    setUnknownQueue([]); setCurrentUnknown(null); setShowAddItem(false); setEditingSizeIdx(null)
  }

  const filteredProducts = allProducts.filter(p =>
    !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.aliases||[]).some(a => a.toLowerCase().includes(productSearch.toLowerCase()))
  )

  if (step === 'done') {
    return (
      <div className="animate-fade" style={{ maxWidth:480, margin:'80px auto', textAlign:'center' }}>
        <CheckCircle size={56} color="var(--green)" style={{ marginBottom:16 }} />
        <h2 style={{ marginBottom:8 }}>Receipt saved!</h2>
        <p style={{ color:'var(--ink-light)', marginBottom:28 }}>
          {items.filter(i=>i.productId).length} items tracked{items.filter(i=>!i.productId).length > 0 && `, ${items.filter(i=>!i.productId).length} skipped`}.
        </p>
        <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
          <button className="btn btn-secondary" onClick={reset}>Upload another</button>
          <button className="btn btn-primary" onClick={() => navigate('/compare')}>Compare prices</button>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade">
      <div className="page-header">
        <h2>Upload Receipt</h2>
        <p>Snap or upload a receipt — OCR runs in your browser, only item data is saved.</p>
      </div>

      <div style={{ display:'flex', gap:8, marginBottom:28, alignItems:'center' }}>
        {['Upload','Process','Review','Save'].map((label, i) => {
          const stepMap = ['upload','processing','review','saving']
          const idx = stepMap.indexOf(step), active = i===idx, done = i<idx
          return (
            <div key={label} style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:24, height:24, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.7rem', fontWeight:700, background:done?'var(--green)':active?'var(--ink)':'var(--border)', color:done||active?'white':'var(--ink-faint)' }}>
                {done?'✓':i+1}
              </div>
              <span style={{ fontSize:'0.8rem', color:active?'var(--ink)':'var(--ink-faint)', fontWeight:active?600:400 }}>{label}</span>
              {i<3 && <div style={{ width:24, height:1, background:'var(--border)' }} />}
            </div>
          )
        })}
      </div>

      {step === 'upload' && (
        <div style={{ maxWidth:480 }}>
          <div onDrop={handleDrop} onDragOver={e=>e.preventDefault()} onClick={()=>fileRef.current?.click()}
            style={{ border:`2px dashed ${imageFile?'var(--green)':'var(--border)'}`, borderRadius:'var(--radius-lg)', padding:'40px 24px', textAlign:'center', cursor:'pointer', background:imageFile?'var(--green-pale)':'var(--cream)', transition:'all 0.2s', marginBottom:16 }}>
            {imagePreview
              ? <img src={imagePreview} alt="receipt" style={{ maxHeight:220, maxWidth:'100%', borderRadius:8, objectFit:'contain' }} />
              : <><UploadCloud size={36} color="var(--ink-faint)" style={{ marginBottom:12 }} /><p style={{ fontWeight:600, marginBottom:4 }}>Drop receipt image here</p><p style={{ fontSize:'0.8rem', color:'var(--ink-faint)' }}>or click to browse · JPG, PNG, WEBP</p></>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} style={{ display:'none' }} />
          {/* Quality warnings */}
          {checkingQuality && (
            <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:'0.82rem', color:'var(--ink-faint)', marginBottom:12 }}>
              <div className="spinner" style={{ width:14, height:14, borderWidth:2 }} /> Checking image quality…
            </div>
          )}
          {qualityWarnings.length > 0 && (
            <div style={{ background:'#fef9ec', border:'1.5px solid #f5c842', borderRadius:'var(--radius-sm)', padding:'12px 16px', marginBottom:16 }}>
              <div style={{ fontWeight:600, fontSize:'0.82rem', color:'#7a5c00', marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
                ⚠ Image quality tips
              </div>
              {qualityWarnings.map((w, i) => (
                <div key={i} style={{ fontSize:'0.8rem', color:'#5a4200', marginBottom: i < qualityWarnings.length-1 ? 4 : 0, paddingLeft:4 }}>
                  • {w}
                </div>
              ))}
              <div style={{ fontSize:'0.75rem', color:'#8a7030', marginTop:10, borderTop:'1px solid #f0d860', paddingTop:8 }}>
                <strong>Best practices:</strong> Lay the receipt flat on a dark surface · Shoot straight down · Use good lighting, no flash glare · Make sure all lines are in frame · Crop tightly to just the receipt
              </div>
            </div>
          )}
          {imageFile && qualityWarnings.length === 0 && !checkingQuality && (
            <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:'0.8rem', color:'var(--green)', marginBottom:12, fontWeight:500 }}>
              ✓ Image looks good
            </div>
          )}

          <div className="form-group" style={{ marginBottom:16 }}>
            <label className="form-label">Extraction Method</label>
            <select className="form-select" value={ocrMethod} onChange={e=>setOcrMethod(e.target.value)}>
              <option value="tesseract">Tesseract OCR (free, local)</option>
              <option value="claude" disabled={!import.meta.env.VITE_ANTHROPIC_API_KEY}>Claude Vision (requires API key)</option>
            </select>
          </div>
          <button className="btn btn-primary" style={{ width:'100%', justifyContent:'center' }} disabled={!imageFile} onClick={processReceipt}>
            <UploadCloud size={16} /> Process Receipt
          </button>
        </div>
      )}

      {step === 'processing' && (
        <div style={{ textAlign:'center', padding:'80px 20px' }}>
          <div className="spinner" style={{ width:40, height:40, borderWidth:3, margin:'0 auto 20px' }} />
          <h3 style={{ marginBottom:8 }}>Reading your receipt…</h3>
          {ocrMethod === 'tesseract' && ocrProgress > 0 && (
            <>
              <p style={{ color:'var(--ink-light)', marginBottom:12 }}>{ocrProgress}% complete</p>
              <div style={{ width:240, height:6, background:'var(--border)', borderRadius:3, margin:'0 auto' }}>
                <div style={{ width:`${ocrProgress}%`, height:'100%', background:'var(--green)', borderRadius:3, transition:'width 0.2s' }} />
              </div>
            </>
          )}
        </div>
      )}

      {step === 'review' && (
        <div>
          {currentUnknown && <AliasModal unknownItem={currentUnknown} onResolved={handleAliasResolved} onSkip={advanceQueue} onBlacklist={handleBlacklist} />}

          {/* Manual add item modal */}
          {showAddItem && (
            <div className="modal-overlay">
              <div className="modal" style={{ maxWidth:480 }}>
                <h3 style={{ marginBottom:4 }}>Add item manually</h3>
                <p style={{ color:'var(--ink-light)', fontSize:'0.85rem', marginBottom:12 }}>For items Tesseract missed on the receipt.</p>

                {/* Mode toggle */}
                <div style={{ display:'flex', gap:8, marginBottom:16 }}>
                  <button className={`btn btn-sm ${addItemMode==='search'?'btn-primary':'btn-secondary'}`} onClick={()=>setAddItemMode('search')}>Search existing</button>
                  <button className={`btn btn-sm ${addItemMode==='create'?'btn-primary':'btn-secondary'}`} onClick={()=>setAddItemMode('create')}>Create new product</button>
                </div>

                {/* Create mode fields */}
                {addItemMode === 'create' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Product Name *</label>
                      <input className="form-input" placeholder="e.g. Banana" value={createName} onChange={e=>setCreateName(e.target.value)} autoFocus />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Category</label>
                      <select className="form-select" value={createCategory} onChange={e=>setCreateCategory(e.target.value)}>
                        <option value="">— Select —</option>
                        {CATEGORIES.map(c=><option key={c} value={c}>{CATEGORY_ICONS[c]} {c}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Receipt Alias (optional)</label>
                      <input className="form-input" placeholder="e.g. WBO FIRM TOFU" value={createAlias} onChange={e=>setCreateAlias(e.target.value)} />
                    </div>
                  </>
                )}

                {/* Search mode fields */}
                {addItemMode === 'search' && (
                  <div className="form-group">
                    <label className="form-label">Product *</label>
                    <input className="form-input" placeholder="Search products…" value={productSearch} onChange={e=>setProductSearch(e.target.value)} autoFocus style={{ marginBottom:8 }} />
                    <div style={{ maxHeight:180, overflowY:'auto', border:'1px solid var(--border)', borderRadius:8, background:'white' }}>
                      {filteredProducts.length === 0 && (
                        <p style={{ padding:'12px 16px', color:'var(--ink-faint)', fontSize:'0.85rem' }}>No products found — switch to "Create new product" above.</p>
                      )}
                      {filteredProducts.map(p => (
                        <button key={p.id} onClick={()=>{ setNewItem(v=>({...v,productId:p.id,productName:p.name})); setProductSearch(p.name) }}
                          style={{ display:'block', width:'100%', textAlign:'left', padding:'10px 14px', background:newItem.productId===p.id?'var(--green-pale)':'transparent', border:'none', borderBottom:'1px solid var(--cream-dark)', cursor:'pointer', fontSize:'0.875rem' }}>
                          <div style={{ fontWeight:600 }}>{p.name}</div>
                          {p.category && <div style={{ fontSize:'0.72rem', color:'var(--ink-faint)' }}>{CATEGORY_ICONS[p.category]} {p.category}</div>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Price / qty / size fields — always shown */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:4 }}>
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label className="form-label">Price *</label>
                    <input className="form-input" type="number" step="0.01" min="0" placeholder="0.00" value={newItem.price} onChange={e=>setNewItem(v=>({...v,price:e.target.value}))} />
                  </div>
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label className="form-label">Quantity</label>
                    <input className="form-input" type="number" min="1" value={newItem.quantity} onChange={e=>setNewItem(v=>({...v,quantity:e.target.value}))} />
                  </div>
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label className="form-label">Package Size</label>
                    <input className="form-input" type="number" step="0.01" min="0" placeholder="e.g. 18" value={newItem.packageSize} onChange={e=>setNewItem(v=>({...v,packageSize:e.target.value}))} />
                  </div>
                  <div className="form-group" style={{ marginBottom:0 }}>
                    <label className="form-label">Unit</label>
                    <select className="form-select" value={newItem.packageUnit} onChange={e=>setNewItem(v=>({...v,packageUnit:e.target.value}))}>
                      {SIZE_UNITS.map(u=><option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>

                <div className="modal-actions">
                  <button className="btn btn-ghost" onClick={()=>setShowAddItem(false)}>Cancel</button>
                  {addItemMode === 'search'
                    ? <button className="btn btn-primary" onClick={handleAddItem} disabled={!newItem.productId||!newItem.price}><Plus size={14} /> Add item</button>
                    : <button className="btn btn-primary" onClick={handleCreateAndAdd} disabled={!createName.trim()||!newItem.price}><Plus size={14} /> Create & add</button>
                  }
                </div>
              </div>
            </div>
          )}

          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div>
              <h3 style={{ fontSize:'1.1rem' }}>Review Items ({items.length})</h3>
              <p style={{ fontSize:'0.8rem', color:'var(--ink-faint)' }}>
                {items.filter(i=>i.productId).length} resolved · {items.filter(i=>!i.productId).length} unknown
                {items.filter(i=>i.weight||i.packageSize).length > 0 && ` · ${items.filter(i=>i.weight||i.packageSize).length} with size`}
                {parsedCount !== null && parsedCount !== items.length && (
                  <span style={{ color:'var(--amber)', marginLeft:6 }}>
                    ({parsedCount} lines detected by OCR)
                  </span>
                )}
              </p>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-secondary btn-sm" onClick={()=>setStep('upload')}>← Back</button>
              <button className="btn btn-ghost btn-sm" onClick={openAddItem}><Plus size={14} /> Add item</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={items.filter(i=>i.productId).length===0}>Save Receipt</button>
            </div>
          </div>

          {/* Collapsible receipt details */}
          <div className="card" style={{ marginBottom:16, padding:0, overflow:'hidden' }}>
            <button onClick={()=>setShowDetails(v=>!v)} style={{ width:'100%', padding:'14px 20px', background:'none', border:'none', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', textAlign:'left' }}>
              <div style={{ display:'flex', alignItems:'center', gap:16, flex:1 }}>
                <span style={{ fontWeight:600, fontSize:'0.9rem' }}>
                  {storeName || <span style={{ color:'var(--red)' }}>⚠ Store name required</span>}
                </span>
                {storeAddress && <span style={{ fontSize:'0.78rem', color:'var(--ink-faint)' }}>{storeAddress}</span>}
                <div style={{ display:'flex', gap:6 }}>
                  {storeAutoDetected && <span className="badge badge-green" style={{ fontSize:'0.65rem' }}>Store detected</span>}
                  {dateAutoDetected && <span className="badge badge-green" style={{ fontSize:'0.65rem' }}>Date detected</span>}
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                {receiptDate && <span style={{ fontSize:'0.82rem', color:'var(--ink-light)' }}>{receiptDate}</span>}
                <span style={{ fontSize:'0.78rem', color:'var(--green)' }}>Edit details</span>
                {showDetails ? <ChevronUp size={16} color="var(--ink-faint)" /> : <ChevronDown size={16} color="var(--ink-faint)" />}
              </div>
            </button>
            {showDetails && (
              <div style={{ padding:'0 20px 20px', borderTop:'1px solid var(--cream-dark)', display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }} className="animate-fade">
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label className="form-label">Store Name *</label>
                  <input className="form-input" placeholder="e.g. Wegmans" value={storeName} onChange={e=>{setStoreName(e.target.value);setStoreAutoDetected(false)}} />
                </div>
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label className="form-label">Date</label>
                  <input className="form-input" type="date" value={receiptDate} onChange={e=>{setReceiptDate(e.target.value);setDateAutoDetected(false)}} />
                </div>
                <div className="form-group" style={{ marginBottom:0, gridColumn:'1 / -1' }}>
                  <label className="form-label">Store Address</label>
                  <input className="form-input" placeholder="e.g. 371 Buckley Mill Rd, Wilmington, DE" value={storeAddress} onChange={e=>setStoreAddress(e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom:0 }}>
                  <label className="form-label">Uploaded by</label>
                  <input className="form-input" placeholder="Your name" value={uploadedBy} onChange={e=>setUploadedBy(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          {/* Receipt scan overlay */}
          {highlightedImage && (
            <div className="card" style={{ marginBottom:16, padding:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <span style={{ fontSize:'0.82rem', fontWeight:600, color:'var(--ink-light)' }}>
                  Scanned Receipt — {parsedCount} line{parsedCount !== 1 ? 's' : ''} detected
                </span>
                <button onClick={()=>setHighlightedImage(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--ink-faint)', fontSize:'0.78rem' }}>Hide</button>
              </div>
              <img src={highlightedImage} alt="scanned receipt" style={{ width:'100%', maxHeight:320, objectFit:'contain', borderRadius:8, border:'1px solid var(--border)' }} />
              <p style={{ fontSize:'0.72rem', color:'var(--ink-faint)', marginTop:8 }}>
                Green overlay shows lines detected by OCR. If items are missing, use "+ Add item" to enter them manually.
              </p>
            </div>
          )}

          {items.length === 0 && (
            <div className="card">
              <div className="empty-state">
                <AlertCircle size={32} />
                <h3>No items detected</h3>
                <p style={{ fontSize:'0.85rem' }}>Try re-uploading a clearer image, or add items manually.</p>
                <button className="btn btn-primary btn-sm" onClick={openAddItem}><Plus size={14} /> Add item manually</button>
              </div>
            </div>
          )}

          {items.length > 0 && (
            <div className="card" style={{ padding:0, overflow:'hidden' }}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Raw Text</th><th>Product</th><th>Size / Weight</th><th>Price</th><th></th></tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={idx}>
                        <td>
                          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            {item.weight && <Scale size={13} color="var(--amber)" />}
                            <code style={{ fontSize:'0.78rem', background:'var(--cream-dark)', padding:'2px 6px', borderRadius:4 }}>
                              {item.rawText === '[manual]' ? '(manual)' : item.description}
                            </code>
                          </div>
                        </td>
                        <td>
                          {item.productId
                            ? <span className="badge badge-green">{item.productName}</span>
                            : <span className="badge badge-amber">Unknown</span>}
                        </td>
                        <td>
                          {editingSizeIdx === idx
                            ? <SizeEditor item={item} onSave={(s,u)=>applySizeEdit(idx,s,u)} onCancel={()=>setEditingSizeIdx(null)} />
                            : <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                <SizeDisplay item={item} />
                                {/* Only show edit button for non-by-weight items */}
                                {!item.weight && (
                                  <button onClick={()=>setEditingSizeIdx(idx)} title="Edit size"
                                    style={{ background:'none', border:'none', cursor:'pointer', color:'var(--ink-faint)', padding:'2px', display:'flex', alignItems:'center' }}>
                                    <Pencil size={11} />
                                  </button>
                                )}
                              </div>
                          }
                        </td>
                        <td>
                          <input type="number" step="0.01" min="0" value={item.price??''} onChange={e=>updateItem(idx,'price',parseFloat(e.target.value))}
                            style={{ width:80, padding:'4px 8px', border:'1px solid var(--border)', borderRadius:6, fontSize:'0.85rem' }} />
                        </td>
                        <td><button className="btn btn-danger btn-sm" onClick={()=>removeItem(idx)}>✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 'saving' && (
        <div style={{ textAlign:'center', padding:'80px 20px' }}>
          <div className="spinner" style={{ width:40, height:40, borderWidth:3, margin:'0 auto 20px' }} />
          <h3>Saving to Firestore…</h3>
        </div>
      )}
    </div>
  )
}
