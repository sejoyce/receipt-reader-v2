import { createWorker } from 'tesseract.js'
import { detectStoreFromText } from './db'

export async function extractTextFromImage(imageFile, onProgress) {
  const worker = await createWorker('eng', 1, {
    logger: m => {
      if (onProgress && m.status === 'recognizing text') {
        onProgress(Math.round(m.progress * 100))
      }
    }
  })
  const url = URL.createObjectURL(imageFile)
  const { data: { text } } = await worker.recognize(url)
  await worker.terminate()
  URL.revokeObjectURL(url)
  return text
}

export function detectDateFromText(rawText) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean)
  const months = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 }
  for (const line of lines) {
    let m = line.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/)
    if (m) {
      let [, month, day, year] = m
      if (year.length === 2) year = '20' + year
      const yr = parseInt(year), mo = parseInt(month), dy = parseInt(day)
      if (yr >= 2020 && yr <= 2035 && mo >= 1 && mo <= 12 && dy >= 1 && dy <= 31)
        return `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`
    }
    m = line.match(/\b(202\d)-(\d{2})-(\d{2})\b/)
    if (m) return `${m[1]}-${m[2]}-${m[3]}`
    m = line.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})[,\s]+(202\d)\b/i)
    if (m) {
      const mo = String(months[m[1].toLowerCase().slice(0,3)]).padStart(2,'0')
      return `${m[3]}-${mo}-${m[2].padStart(2,'0')}`
    }
    m = line.match(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{2,4})\b/i)
    if (m) {
      const mo = String(months[m[2].toLowerCase().slice(0,3)]).padStart(2,'0')
      let yr = m[3]; if (yr.length === 2) yr = '20' + yr
      return `${yr}-${mo}-${m[1].padStart(2,'0')}`
    }
  }
  return null
}

/**
 * Analyse an image file and return quality warnings.
 * Returns an array of warning strings (empty = looks good).
 * Uses a canvas to inspect pixel data.
 */
export async function checkImageQuality(imageFile) {
  return new Promise((resolve) => {
    const warnings = []
    const img = new Image()
    const url = URL.createObjectURL(imageFile)

    img.onload = () => {
      const w = img.naturalWidth, h = img.naturalHeight
      URL.revokeObjectURL(url)

      // 1. Resolution check
      if (w < 800 || h < 800) {
        warnings.push(`Image is small (${w}×${h}px). For best results, use at least 1000×1000px.`)
      }

      // 2. Aspect ratio — receipts are tall and narrow; landscape suggests rotation
      const aspect = w / h
      if (aspect > 1.2) {
        warnings.push('Image appears to be landscape (wider than tall). Receipts should be photographed in portrait mode.')
      }

      // 3. Sample brightness / contrast via canvas
      const canvas = document.createElement('canvas')
      // Sample at reduced size for speed
      const sw = Math.min(w, 300), sh = Math.min(h, 300)
      canvas.width = sw; canvas.height = sh
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, sw, sh)
      const data = ctx.getImageData(0, 0, sw, sh).data

      let totalBrightness = 0, darkPixels = 0, brightPixels = 0
      const pixelCount = sw * sh
      for (let p = 0; p < data.length; p += 4) {
        // Perceived brightness (luma)
        const luma = 0.299 * data[p] + 0.587 * data[p+1] + 0.114 * data[p+2]
        totalBrightness += luma
        if (luma < 60) darkPixels++
        if (luma > 220) brightPixels++
      }
      const avgBrightness = totalBrightness / pixelCount
      const darkRatio = darkPixels / pixelCount
      const brightRatio = brightPixels / pixelCount

      if (avgBrightness < 80) {
        warnings.push('Image looks dark. Try taking the photo in better lighting or turn on the flash.')
      } else if (avgBrightness > 210) {
        warnings.push('Image looks overexposed (very bright). Avoid direct flash or bright backlighting.')
      }

      if (darkRatio > 0.35) {
        warnings.push('Large dark areas detected — possible shadows across the receipt. Flatten the receipt and avoid shadows.')
      }

      // 4. File size check (very small = likely compressed / blurry)
      if (imageFile.size < 80 * 1024) {
        warnings.push('File is very small — the image may be compressed or blurry. Try using your camera app directly.')
      }

      resolve(warnings)
    }

    img.onerror = () => { URL.revokeObjectURL(url); resolve([]) }
    img.src = url
  })
}

/** Normalize OCR noise in a single line before parsing */
function normalizeLine(line) {
  return line
    .replace(/(\d),(\d)/g, '$1.$2')  // comma-decimal: 2,94 → 2.94
    .replace(/\s+/g, ' ')            // collapse whitespace
    .trim()
}

export function parseReceiptText(rawText) {
  const rawLines = rawText.split('\n').map(l => l.trim()).filter(Boolean)
  const lines = rawLines.map(normalizeLine)
  const items = []

  const skipPatterns = [
    /\b(subtotal|sub-total|total|tax|change|cash|debit|credit|balance|savings|rewards|void|refund|loyalty|discount)\b/i,
    /\b(mastercard|visa|discover|amex|american\s+express)\b/i,
    /\b(auth|rcpt|op#|terminal|register|cashier|operator|store\s*#|trans|transaction|invoice)\b/i,
    /\b(thank|welcome|every\s+day|get\s+our\s+best|save\s+today|member|loyalty\s+card)\b/i,
    /^\*+/,
    /^[-=#]+$/,
    /^\d{1,2}\/\d{1,2}\/\d{2,4}\s+(op#|op\s+#)/i,
    /^\(\d{3}\)\s*\d{3}/,
    /^card\s+number/i,
    /^(chase|discover\s+purchase|mastercard\s+purchase)/i,
    /\b(points|fuel\s+saver|club\s+card)\b/i,
  ]

  function isSkipped(line) { return skipPatterns.some(p => p.test(line)) }
  function isPriceOnlyNoise(line) { return /^\$?\d{1,4}\.\d{2}\s*[A-Z]?\s*$/.test(line) }

  const priceAtEnd = /\s\$?(\d{1,4}\.\d{2})-?\s*([A-Z])?\s*$/

  // Qty-before line: "2 @ 1.99" or "5 @ 0.79" or "2 @ 2.79"
  // Separate line preceding the item line on Wegmans receipts
  const qtyPriceLine = /^(\d+)\s*@\s*\$?(\d+\.?\d*)\s*$/

  // By-weight line
  const weightOnlyLine = /^(\d+\.?\d*)\s*(lb|lbs|oz|kg|g)\s*@\s*\$?(\d+\.?\d*)\s*[\/\\]?\s*(lb|lbs|oz|kg|g)\b/i

  const wtLineWithPrice = /^WT\s+(.+?)\s+\$?(\d+\.\d{2})\s*[A-Z]?\s*$/i
  const wtLineNoPrice   = /^WT\s+(.+)$/i
  const priceOnlyLine   = /^\$?(\d{1,4}\.\d{2})\s*[A-Z]?\s*$/

  // Package size suffix: "18 OZ", "18OZ", "1LB", "3#" (# = lb)
  const pkgSuffixPattern = /^(.+?)\s*(\d+\.?\d*)\s*(oz|lb|lbs|kg|g|ct|count|pk|pack|ml|l|fl\s*oz|#)\s*$/i

  // SC coupon prefix: "SC   GOLDFISH OLD BAY" or "SC 23719 PF GOLDFISH CHEDDA"
  // Strip SC + optional barcode number from start of description
  const scPrefix = /^SC\s+(\d+\s+)?/i

  // Pending qty from a "N @ price" look-ahead line
  let pendingQty = null
  let pendingUnitPrice = null

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (isSkipped(line)) { pendingQty = null; i++; continue }

    // ── Qty-before line: "2 @ 1.99" ─────────────────────────────────────────
    // Store it and consume the next item line with this qty applied
    const qtyBefore = line.match(qtyPriceLine)
    if (qtyBefore) {
      pendingQty = parseInt(qtyBefore[1])
      pendingUnitPrice = parseFloat(qtyBefore[2])
      i++; continue
    }

    // ── PATTERN A: by-weight line before item ────────────────────────────────
    const wOnly = line.match(weightOnlyLine)
    if (wOnly) {
      pendingQty = null
      const weight = parseFloat(wOnly[1])
      const unit   = wOnly[2].toLowerCase().replace('lbs','lb')
      const pricePerUnit = parseFloat(wOnly[3])
      let description = null, totalPrice = null, skip = 1

      if (i + 1 < lines.length) {
        const n1 = lines[i + 1]
        const wtWithP = n1.match(wtLineWithPrice)
        const wtNoP   = n1.match(wtLineNoPrice)
        if (wtWithP) {
          description = wtWithP[1].trim().toUpperCase()
          totalPrice  = parseFloat(wtWithP[2])
          skip = 2
        } else if (wtNoP) {
          description = wtNoP[1].trim().toUpperCase()
          skip = 2
          if (i + 2 < lines.length) {
            const p2 = lines[i+2].match(priceOnlyLine) || lines[i+2].match(priceAtEnd)
            if (p2) { totalPrice = parseFloat(p2[1]); skip = 3 }
          }
        } else {
          const plain = n1.match(priceAtEnd)
          if (plain && !isSkipped(n1)) {
            description = n1.replace(priceAtEnd,'').trim().toUpperCase()
            totalPrice  = parseFloat(plain[1])
            skip = 2
          }
        }
      }

      if (description && totalPrice === null)
        totalPrice = Math.round(weight * pricePerUnit * 100) / 100

      if (description && totalPrice !== null) {
        items.push({ rawText: rawLines[i], description, price: totalPrice, pricePerUnit, weight, unit, packageSize: null, packageUnit: '', quantity: 1, productId: null, productName: null })
        i += skip; continue
      }
    }

    // ── PATTERN B: WT line with price ────────────────────────────────────────
    const wtP = line.match(wtLineWithPrice)
    if (wtP) {
      pendingQty = null
      items.push({ rawText: rawLines[i], description: wtP[1].trim().toUpperCase(), price: parseFloat(wtP[2]), pricePerUnit: null, weight: null, unit: 'lb', packageSize: null, packageUnit: '', quantity: 1, productId: null, productName: null })
      i++; continue
    }

    // ── PATTERN C: WT line without price (price on next line) ─────────────────
    const wtNP = line.match(wtLineNoPrice)
    if (wtNP) {
      pendingQty = null
      let totalPrice = null, skip = 1
      if (i + 1 < lines.length) {
        const p = lines[i+1].match(priceOnlyLine) || lines[i+1].match(priceAtEnd)
        if (p) { totalPrice = parseFloat(p[1]); skip = 2 }
      }
      if (totalPrice !== null) {
        items.push({ rawText: rawLines[i], description: wtNP[1].trim().toUpperCase(), price: totalPrice, pricePerUnit: null, weight: null, unit: 'lb', packageSize: null, packageUnit: '', quantity: 1, productId: null, productName: null })
        i += skip; continue
      }
    }

    // ── PATTERN D: regular item with price at end ──────────────────────────────
    if (isPriceOnlyNoise(line)) { pendingQty = null; i++; continue }

    const pm = line.match(priceAtEnd)
    if (pm) {
      const price = parseFloat(pm[1])
      let description = line.replace(/\s+\$?\d{1,4}\.\d{2}-?\s*[A-Z]?\s*$/, '').trim()
      if (description.length < 2 || price > 500) { pendingQty = null; i++; continue }

      // Strip SC coupon prefix and embedded barcodes: "SC 23719 PF GOLDFISH CHEDDA" → "PF GOLDFISH CHEDDA"
      description = description.replace(scPrefix, '').trim()
      // Strip leading standalone barcode numbers (5+ digit strings)
      description = description.replace(/^\d{5,}\s+/, '').trim()

      // Inline qty: "2 x EGGS" (less common on Wegmans but keep for other stores)
      let quantity = pendingQty || 1
      const inlineQty = description.match(/^(\d+)\s+[@x]\s+/i)
      if (inlineQty) {
        quantity = parseInt(inlineQty[1])
        description = description.replace(inlineQty[0], '').trim()
        pendingQty = null
      }

      // Normalize "#" as lb in package names: "3# HC APL" → "3 lb HC APL"
      description = description.replace(/(\d+)\s*#/g, '$1 lb')

      // Coupon / discount lines (negative price shown as "0.58-F") — skip as products
      if (line.match(/\d+\.\d{2}-\s*[A-Z]?\s*$/)) {
        pendingQty = null; i++; continue
      }

      // Package size extraction
      let packageSize = null, packageUnit = ''
      const pkgMatch = description.match(pkgSuffixPattern)
      if (pkgMatch) {
        const cleanDesc = pkgMatch[1].trim()
        const size = parseFloat(pkgMatch[2])
        let unit = pkgMatch[3].toLowerCase().replace('lbs','lb').replace('#','lb').replace(/\s+/,'')
        if (cleanDesc.length >= 2 && size > 0) {
          packageSize = size; packageUnit = unit; description = cleanDesc
        }
      }

      items.push({
        rawText: rawLines[i],
        description: description.toUpperCase(),
        price,
        quantity,
        unit: packageUnit,
        pricePerUnit: pendingUnitPrice,  // store the unit price if we had a qty line
        weight: null,
        packageSize, packageUnit,
        productId: null, productName: null
      })

      pendingQty = null
      pendingUnitPrice = null
    } else {
      // Line had no price — reset pending qty so it doesn't bleed to unrelated items
      pendingQty = null
      pendingUnitPrice = null
    }

    i++
  }

  return items
}

export async function extractWithClaude(imageFile) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('No Anthropic API key configured')
  const base64 = await fileToBase64(imageFile)
  const mediaType = imageFile.type || 'image/jpeg'
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: `Extract all purchased line items from this grocery receipt. Return ONLY valid JSON, no markdown.
Format: {"storeName":"...","storeAddress":"...","date":"YYYY-MM-DD or null","items":[{"description":"ITEM NAME","price":0.00,"quantity":1,"weight":null,"unit":"","pricePerUnit":null,"packageSize":null,"packageUnit":""}]}
Rules:
- description: item name uppercased, no size suffix, no SC/coupon prefix, no barcode numbers
- quantity: integer count (from lines like "2 @ 1.99" preceding the item)
- pricePerUnit: unit price from qty lines (e.g. 1.99 from "2 @ 1.99")
- packageSize + packageUnit: fixed package size if in name (e.g. "18 OZ" → 18, "oz"; "3#" → 3, "lb")
- For sold-by-weight (WT prefix or lb@ lines): weight=purchased weight, pricePerUnit=per-lb rate
- price is always the final total charged amount
- Skip negative-price coupon lines (price ends in "-"), tax, subtotal, total, balance, payment lines` }
        ]
      }]
    })
  })
  if (!response.ok) throw new Error(`Claude API error: ${response.status}`)
  const data = await response.json()
  const text = data.content[0].text.trim().replace(/```json|```/g, '')
  const parsed = JSON.parse(text)
  return {
    storeName: parsed.storeName || '',
    storeAddress: parsed.storeAddress || '',
    date: parsed.date || null,
    items: (parsed.items || []).map(item => ({
      rawText: item.description,
      description: (item.description || '').toUpperCase(),
      price: parseFloat(item.price) || 0,
      quantity: item.quantity || 1,
      weight: item.weight || null,
      unit: item.unit || '',
      pricePerUnit: item.pricePerUnit || null,
      packageSize: item.packageSize || null,
      packageUnit: item.packageUnit || '',
      productId: null,
      productName: null,
    }))
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
