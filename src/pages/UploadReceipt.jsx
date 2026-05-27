import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { UploadCloud, CheckCircle, AlertCircle, Scale } from 'lucide-react'
import { extractTextFromImage, parseReceiptText, extractWithClaude, detectDateFromText } from '../lib/ocr'
import { findProductByAlias, getOrCreateStore, saveReceipt, detectStoreFromText } from '../lib/db'
import { useAuth } from '../hooks/useAuth'
import AliasModal from '../components/AliasModal'
import { useToast } from '../hooks/useToast'

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

  const [items, setItems] = useState([])
  const [unknownQueue, setUnknownQueue] = useState([])
  const [currentUnknown, setCurrentUnknown] = useState(null)

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setStoreAutoDetected(false)
  }

  function handleDrop(e) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file?.type.startsWith('image/')) {
      setImageFile(file)
      setImagePreview(URL.createObjectURL(file))
      setStoreAutoDetected(false)
    }
  }

  async function processReceipt() {
    if (!imageFile) return
    setStep('processing')
    setOcrProgress(0)

    try {
      let parsedItems = []
      let detectedStore = storeName
      let detectedAddress = storeAddress
      let detectedDate = receiptDate

      if (ocrMethod === 'claude' && import.meta.env.VITE_ANTHROPIC_API_KEY) {
        const result = await extractWithClaude(imageFile)
        parsedItems = result.items
        if (!detectedStore && result.storeName) { detectedStore = result.storeName; setStoreAutoDetected(true) }
        if (!detectedAddress && result.storeAddress) detectedAddress = result.storeAddress
        if (!detectedDate && result.date) detectedDate = result.date
      } else {
        const rawText = await extractTextFromImage(imageFile, setOcrProgress)
        parsedItems = parseReceiptText(rawText)
        // Auto-detect store from OCR text
        if (!detectedStore) {
          const detected = detectStoreFromText(rawText)
          if (detected.storeName) { detectedStore = detected.storeName; setStoreAutoDetected(true) }
          if (detected.storeAddress) detectedAddress = detected.storeAddress
        }
        // Auto-detect date from OCR text
        if (!detectedDate) {
          const foundDate = detectDateFromText(rawText)
          if (foundDate) detectedDate = foundDate
        }
      }

      if (detectedStore) setStoreName(detectedStore)
      if (detectedAddress) setStoreAddress(detectedAddress)
      if (detectedDate) setReceiptDate(detectedDate)

      // Resolve known aliases
      const resolved = await Promise.all(
        parsedItems.map(async item => {
          const product = await findProductByAlias(item.description)
          if (product) return { ...item, productId: product.id, productName: product.name }
          return item
        })
      )

      const unknown = resolved.filter(i => !i.productId)
      setItems(resolved)
      if (unknown.length > 0) { setUnknownQueue(unknown); setCurrentUnknown(unknown[0]) }
      setStep('review')
    } catch (err) {
      console.error(err)
      toast('OCR failed: ' + err.message, 'error')
      setStep('upload')
    }
  }

  function handleAliasResolved(resolvedItem) {
    setItems(prev => prev.map(it => it.description === resolvedItem.description ? resolvedItem : it))
    advanceQueue()
  }

  function advanceQueue() {
    setUnknownQueue(prev => {
      const remaining = prev.slice(1)
      setCurrentUnknown(remaining[0] || null)
      return remaining
    })
  }

  function updateItem(idx, field, value) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }

  function removeItem(idx) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    if (!storeName.trim()) { toast('Please enter a store name', 'error'); return }
    setStep('saving')
    try {
      const store = await getOrCreateStore(storeName, storeAddress)
      await saveReceipt({
        storeId: store.id,
        storeName: store.name,
        date: receiptDate || null,
        items,
        uploadedBy: uploadedBy || user?.email || 'unknown',
      })
      setStep('done')
      toast('Receipt saved!')
    } catch (err) {
      console.error(err)
      toast('Failed to save: ' + err.message, 'error')
      setStep('review')
    }
  }

  function reset() {
    setStep('upload'); setImageFile(null); setImagePreview(null); setItems([])
    setStoreName(''); setStoreAddress(''); setReceiptDate(''); setStoreAutoDetected(false)
    setUnknownQueue([]); setCurrentUnknown(null)
  }

  if (step === 'done') {
    return (
      <div className="animate-fade" style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center' }}>
        <CheckCircle size={56} color="var(--green)" style={{ marginBottom: 16 }} />
        <h2 style={{ marginBottom: 8 }}>Receipt saved!</h2>
        <p style={{ color: 'var(--ink-light)', marginBottom: 28 }}>
          {items.filter(i => i.productId).length} items tracked
          {items.filter(i => !i.productId).length > 0 && `, ${items.filter(i => !i.productId).length} skipped`}.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
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

      {/* Step indicators */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 28, alignItems: 'center' }}>
        {['Upload', 'Process', 'Review', 'Save'].map((label, i) => {
          const stepMap = ['upload', 'processing', 'review', 'saving']
          const idx = stepMap.indexOf(step)
          const active = i === idx; const done = i < idx
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, background: done ? 'var(--green)' : active ? 'var(--ink)' : 'var(--border)', color: done || active ? 'white' : 'var(--ink-faint)' }}>
                {done ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: '0.8rem', color: active ? 'var(--ink)' : 'var(--ink-faint)', fontWeight: active ? 600 : 400 }}>{label}</span>
              {i < 3 && <div style={{ width: 24, height: 1, background: 'var(--border)' }} />}
            </div>
          )
        })}
      </div>

      {step === 'upload' && (
        <div className="grid-2" style={{ gap: 24, alignItems: 'start' }}>
          <div>
            <div onDrop={handleDrop} onDragOver={e => e.preventDefault()} onClick={() => fileRef.current?.click()}
              style={{ border: `2px dashed ${imageFile ? 'var(--green)' : 'var(--border)'}`, borderRadius: 'var(--radius-lg)', padding: '40px 24px', textAlign: 'center', cursor: 'pointer', background: imageFile ? 'var(--green-pale)' : 'var(--cream)', transition: 'all 0.2s', marginBottom: 16 }}>
              {imagePreview
                ? <img src={imagePreview} alt="receipt" style={{ maxHeight: 220, maxWidth: '100%', borderRadius: 8, objectFit: 'contain' }} />
                : <><UploadCloud size={36} color="var(--ink-faint)" style={{ marginBottom: 12 }} /><p style={{ fontWeight: 600, marginBottom: 4 }}>Drop receipt image here</p><p style={{ fontSize: '0.8rem', color: 'var(--ink-faint)' }}>or click to browse · JPG, PNG, WEBP</p></>
              }
            </div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} style={{ display: 'none' }} />
            <div style={{ fontSize: '0.78rem', color: 'var(--ink-faint)', background: 'var(--cream-dark)', borderRadius: 8, padding: '10px 14px' }}>
              📱 Images are processed locally and never uploaded — 100% free tier.
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: '1rem', marginBottom: 16 }}>Receipt Details</h3>
            <div className="form-group">
              <label className="form-label">Store Name *</label>
              <div style={{ position: 'relative' }}>
                <input className="form-input" placeholder="e.g. Trader Joe's" value={storeName} onChange={e => { setStoreName(e.target.value); setStoreAutoDetected(false) }} />
                {storeAutoDetected && (
                  <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '0.7rem', background: 'var(--green-pale)', color: 'var(--green)', padding: '2px 7px', borderRadius: 99, fontWeight: 600 }}>
                    Auto-detected
                  </span>
                )}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Store Address</label>
              <input className="form-input" placeholder="e.g. 123 Main St, City, ST" value={storeAddress} onChange={e => setStoreAddress(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Date</label>
              <input className="form-input" type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Uploaded by</label>
              <input className="form-input" placeholder="Your name" value={uploadedBy} onChange={e => setUploadedBy(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Extraction Method</label>
              <select className="form-select" value={ocrMethod} onChange={e => setOcrMethod(e.target.value)}>
                <option value="tesseract">Tesseract OCR (free, local)</option>
                <option value="claude" disabled={!import.meta.env.VITE_ANTHROPIC_API_KEY}>Claude Vision (requires API key)</option>
              </select>
            </div>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={!imageFile} onClick={processReceipt}>
              <UploadCloud size={16} /> Process Receipt
            </button>
          </div>
        </div>
      )}

      {step === 'processing' && (
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <div className="spinner" style={{ width: 40, height: 40, borderWidth: 3, margin: '0 auto 20px' }} />
          <h3 style={{ marginBottom: 8 }}>Reading your receipt…</h3>
          {ocrMethod === 'tesseract' && ocrProgress > 0 && (
            <>
              <p style={{ color: 'var(--ink-light)', marginBottom: 12 }}>{ocrProgress}% complete</p>
              <div style={{ width: 240, height: 6, background: 'var(--border)', borderRadius: 3, margin: '0 auto' }}>
                <div style={{ width: `${ocrProgress}%`, height: '100%', background: 'var(--green)', borderRadius: 3, transition: 'width 0.2s' }} />
              </div>
            </>
          )}
        </div>
      )}

      {step === 'review' && (
        <div>
          {currentUnknown && <AliasModal unknownItem={currentUnknown} onResolved={handleAliasResolved} onSkip={advanceQueue} />}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: '1.1rem' }}>Review Items ({items.length})</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--ink-faint)' }}>
                {items.filter(i => i.productId).length} resolved · {items.filter(i => !i.productId).length} unknown
                {items.filter(i => i.weight).length > 0 && ` · ${items.filter(i => i.weight).length} by weight`}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setStep('upload')}>← Back</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={items.filter(i => i.productId).length === 0}>Save Receipt</button>
            </div>
          </div>

          {storeName && (
            <div className="card" style={{ marginBottom: 16, padding: '14px 18px', display: 'flex', gap: 16, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Store</div>
                <div style={{ fontWeight: 600 }}>{storeName}</div>
                {storeAddress && <div style={{ fontSize: '0.78rem', color: 'var(--ink-light)' }}>{storeAddress}</div>}
              </div>
              {receiptDate && <div style={{ fontSize: '0.85rem', color: 'var(--ink-light)' }}>{receiptDate}</div>}
            </div>
          )}

          {items.length === 0 && (
            <div className="card"><div className="empty-state"><AlertCircle size={32} /><h3>No items detected</h3><p style={{ fontSize: '0.85rem' }}>Try re-uploading a clearer image.</p></div></div>
          )}

          {items.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Raw Text</th><th>Product</th><th>Price</th><th>Weight/Qty</th><th></th></tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={idx}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {item.weight && <Scale size={13} color="var(--amber)" title="Sold by weight" />}
                            <code style={{ fontSize: '0.78rem', background: 'var(--cream-dark)', padding: '2px 6px', borderRadius: 4 }}>{item.description}</code>
                          </div>
                        </td>
                        <td>
                          {item.productId
                            ? <span className="badge badge-green">{item.productName}</span>
                            : <span className="badge badge-amber">Unknown</span>
                          }
                        </td>
                        <td>
                          <input type="number" step="0.01" min="0" value={item.price ?? ''} onChange={e => updateItem(idx, 'price', parseFloat(e.target.value))}
                            style={{ width: 80, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: '0.85rem' }} />
                        </td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--ink-light)' }}>
                          {item.weight
                            ? <span>{item.weight} {item.unit} @ ${item.pricePerUnit}/{item.unit}</span>
                            : <span>×{item.quantity}</span>
                          }
                        </td>
                        <td><button className="btn btn-danger btn-sm" onClick={() => removeItem(idx)}>✕</button></td>
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
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <div className="spinner" style={{ width: 40, height: 40, borderWidth: 3, margin: '0 auto 20px' }} />
          <h3>Saving to Firestore…</h3>
        </div>
      )}
    </div>
  )
}
