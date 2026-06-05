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

/** Normalize OCR noise in a single line before parsing.
 *  - Replace comma-as-decimal: "2,94" → "2.94" (only when surrounded by digits)
 *  - Collapse multiple spaces to single space
 */
function normalizeLine(line) {
  return line
    .replace(/(\d),(\d)/g, '$1.$2')   // comma-decimal: 2,94 → 2.94
    .replace(/\s+/g, ' ')             // collapse whitespace
    .trim()
}

export function parseReceiptText(rawText) {
  const rawLines = rawText.split('\n').map(l => l.trim()).filter(Boolean)
  // Normalize every line before parsing
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

  function isPriceOnlyNoise(line) {
    return /^\$?\d{1,4}\.\d{2}\s*[A-Z]?\s*$/.test(line)
  }

  const priceAtEnd = /\s\$?(\d{1,4}\.\d{2})\s*([A-Z])?\s*$/

  // By-weight line — now also tolerates OCR noise:
  // "2.94 lb @ 0.49 /lb"  "2,94 lb @ 0,49 /lb" (already normalized above)
  // Also handles missing space before unit: "2.94lb@0.49/lb"
  const weightOnlyLine = /^(\d+\.?\d*)\s*(lb|lbs|oz|kg|g)\s*@\s*\$?(\d+\.?\d*)\s*[\/\\]?\s*(lb|lbs|oz|kg|g)\b/i

  const wtLineWithPrice = /^WT\s+(.+?)\s+\$?(\d+\.\d{2})\s*[A-Z]?\s*$/i
  const wtLineNoPrice   = /^WT\s+(.+)$/i
  const priceOnlyLine   = /^\$?(\d{1,4}\.\d{2})\s*[A-Z]?\s*$/

  // Package size patterns — handles both spaced and unspaced variants:
  // "BLUEBERRIES 18 OZ", "BLUEBERRIES 18OZ", "STRAWBERRIES 1LB", "STRAWBERRIES1LB"
  // Capture groups: (base description)(size number)(unit)
  const pkgSuffixPattern = /^(.+?)\s*(\d+\.?\d*)\s*(oz|lb|lbs|kg|g|ct|count|pk|pack|ml|l|fl\s*oz)\s*$/i

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (skipPatterns.some(p => p.test(line))) { i++; continue }

    // ── PATTERN A: by-weight line before item ─────────────────────────────
    const wOnly = line.match(weightOnlyLine)
    if (wOnly) {
      const weight       = parseFloat(wOnly[1])
      const unit         = wOnly[2].toLowerCase().replace('lbs','lb')
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
            const n2 = lines[i + 2]
            const p2 = n2.match(priceOnlyLine) || n2.match(priceAtEnd)
            if (p2) { totalPrice = parseFloat(p2[1]); skip = 3 }
          }
        } else {
          const plain = n1.match(priceAtEnd)
          if (plain && !skipPatterns.some(p => p.test(n1))) {
            description = n1.replace(priceAtEnd, '').trim().toUpperCase()
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

    // ── PATTERN B: WT line with price ────────────────────────────────────
    const wtP = line.match(wtLineWithPrice)
    if (wtP) {
      items.push({ rawText: rawLines[i], description: wtP[1].trim().toUpperCase(), price: parseFloat(wtP[2]), pricePerUnit: null, weight: null, unit: 'lb', packageSize: null, packageUnit: '', quantity: 1, productId: null, productName: null })
      i++; continue
    }

    // ── PATTERN C: WT line without price (price on next line) ────────────
    const wtNP = line.match(wtLineNoPrice)
    if (wtNP) {
      let totalPrice = null, skip = 1
      if (i + 1 < lines.length) {
        const p = lines[i + 1].match(priceOnlyLine) || lines[i + 1].match(priceAtEnd)
        if (p) { totalPrice = parseFloat(p[1]); skip = 2 }
      }
      if (totalPrice !== null) {
        items.push({ rawText: rawLines[i], description: wtNP[1].trim().toUpperCase(), price: totalPrice, pricePerUnit: null, weight: null, unit: 'lb', packageSize: null, packageUnit: '', quantity: 1, productId: null, productName: null })
        i += skip; continue
      }
    }

    // ── PATTERN D: regular item with price at end ─────────────────────────
    if (isPriceOnlyNoise(line)) { i++; continue }

    const pm = line.match(priceAtEnd)
    if (pm) {
      const price = parseFloat(pm[1])
      let description = line.replace(/\s+\$?\d{1,4}\.\d{2}\s*[A-Z]?\s*$/, '').trim()
      if (description.length < 2 || price > 500) { i++; continue }

      let quantity = 1
      const qtyMatch = description.match(/^(\d+)\s+[@x]\s+/i)
      if (qtyMatch) { quantity = parseInt(qtyMatch[1]); description = description.replace(qtyMatch[0], '').trim() }

      // Extract package size — handles spaced ("18 OZ"), unspaced ("18OZ"), and attached ("1LB")
      let packageSize = null, packageUnit = ''
      const pkgMatch = description.match(pkgSuffixPattern)
      if (pkgMatch) {
        const cleanDesc = pkgMatch[1].trim()
        const size = parseFloat(pkgMatch[2])
        const unit = pkgMatch[3].toLowerCase().replace('lbs','lb').replace(/\s+/,'')
        if (cleanDesc.length >= 2 && size > 0) {
          packageSize = size
          packageUnit = unit
          description = cleanDesc
        }
      }

      items.push({ rawText: rawLines[i], description: description.toUpperCase(), price, quantity, unit: packageUnit, pricePerUnit: null, weight: null, packageSize, packageUnit, productId: null, productName: null })
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
- description: item name uppercased, WITHOUT size/weight suffix
- packageSize + packageUnit: fixed package size if in name (e.g. "BLUEBERRIES 18 OZ" → packageSize:18, packageUnit:"oz")
- For sold-by-weight (WT prefix or lb@ lines): weight=purchased weight, pricePerUnit=per-lb rate
- price is always the final charged dollar amount
- Skip tax, subtotal, total, balance, payment, auth, card number lines` }
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
