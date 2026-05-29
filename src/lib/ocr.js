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

/**
 * Extract the receipt date from raw OCR text.
 * Returns "YYYY-MM-DD" or null.
 */
export function detectDateFromText(rawText) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean)
  const months = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 }

  for (const line of lines) {
    // MM/DD/YY or MM/DD/YYYY (Wegmans: "04/19/26 OP# 82")
    let m = line.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/)
    if (m) {
      let [, month, day, year] = m
      if (year.length === 2) year = '20' + year
      const yr = parseInt(year), mo = parseInt(month), dy = parseInt(day)
      if (yr >= 2020 && yr <= 2035 && mo >= 1 && mo <= 12 && dy >= 1 && dy <= 31)
        return `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`
    }
    // ISO: YYYY-MM-DD
    m = line.match(/\b(202\d)-(\d{2})-(\d{2})\b/)
    if (m) return `${m[1]}-${m[2]}-${m[3]}`
    // "May 6, 2026" or "MAY 06 2026"
    m = line.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})[,\s]+(202\d)\b/i)
    if (m) {
      const mo = String(months[m[1].toLowerCase().slice(0,3)]).padStart(2,'0')
      return `${m[3]}-${mo}-${m[2].padStart(2,'0')}`
    }
    // "06 MAY 2026"
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
 * Parse raw OCR text into structured receipt items.
 *
 * Wegmans format observed:
 *   WB ORIG ALMONDMILK     2.49 F      ← regular, tax code F
 *   HE SF HONEY COND       9.99        ← regular, no tax code
 *   NEUT ULT SHR SPF30     9.99 H      ← regular, tax code H
 *   BLUEBERRIES 18 OZ      8.99 F      ← fixed-weight packaged (NOT by-weight)
 *   STRAWBERRIES 1LB       2.99 F      ← fixed-weight packaged (NOT by-weight)
 *   2.94 lb @ 0.49 /lb                 ← by-weight info line
 *   WT    BANANAS                      ← item name, price MISSING from this line
 *                          1.44 F      ← price on its OWN separate line
 */
export function parseReceiptText(rawText) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean)
  const items = []

  const skipPatterns = [
    /^(subtotal|sub-total|total|tax|change|cash|card\b|debit|credit|balance|thank|welcome|savings|member|rewards|void|refund|loyalty|points|discount|mastercard|visa|discover|auth|rcpt|op#|every\s+day)/i,
    /^\*+/,
    /^[-=]+$/,
    /^\d{1,2}\/\d{1,2}\/\d{2,4}\s+op#/i,  // "04/19/26 OP# 82"
    /^\(\d{3}\)/,                            // phone numbers
    /^card\s+number/i,
    /^chase|^discover\s+purchase/i,
  ]

  // Lines that are ONLY a price (e.g. standalone "0.00" after TAX line) — skip as items
  // but still usable as price values when explicitly looked up by the weight/WT patterns
  function isPriceOnlyNoise(line) {
    // A line is noise if it's just a number with no description context
    return /^\$?\d{1,4}\.\d{2}\s*[A-Z]?\s*$/.test(line)
  }

  // Core price pattern: optional $, digits.2digits, optional whitespace,
  // optional SINGLE tax-code letter (F, H, T, B, N, etc.), end of string.
  // We use a strict end anchor to avoid matching mid-line numbers.
  const priceAtEnd = /\s\$?(\d{1,4}\.\d{2})\s*([A-Z])?\s*$/

  // By-weight line: "2.94 lb @ 0.49 /lb"
  // Must start with a number+unit — not an item description
  const weightOnlyLine = /^(\d+\.?\d*)\s*(lb|lbs|oz|kg|g)\b\s*@\s*\$?(\d+\.?\d*)\s*[\/\\]?\s*(lb|lbs|oz|kg|g)\b/i

  // WT prefix line — may or may not have a price on the same line
  // "WT    BANANAS            1.44 F"  or  "WT    BANANAS"
  const wtLineWithPrice = /^WT\s+(.+?)\s+\$?(\d+\.\d{2})\s*[A-Z]?\s*$/i
  const wtLineNoPrice   = /^WT\s+(.+)$/i

  // Price-only line (standalone): "   1.44 F" or "1.44"
  // Entire line is just a price (+optional tax code), nothing else
  const priceOnlyLine = /^\$?(\d{1,4}\.\d{2})\s*[A-Z]?\s*$/

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (skipPatterns.some(p => p.test(line))) { i++; continue }

    // ── PATTERN A: by-weight line before item ─────────────────────────────
    // "2.94 lb @ 0.49 /lb"  →  look ahead for the item and price
    const wOnly = line.match(weightOnlyLine)
    if (wOnly) {
      const weight      = parseFloat(wOnly[1])
      const unit        = wOnly[2].toLowerCase().replace('lbs','lb')
      const pricePerUnit = parseFloat(wOnly[3])

      // Next line(s): find the item name and price
      // Could be:  "WT BANANAS  1.44 F"  (price on same line as name)
      // Or:        "WT BANANAS"  then  "1.44 F"  (price on following line)
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
          // Price might be on the line after
          if (i + 2 < lines.length) {
            const n2 = lines[i + 2]
            const p2 = n2.match(priceOnlyLine) || n2.match(priceAtEnd)
            if (p2) {
              totalPrice = parseFloat(p2[1])
              skip = 3
            }
          }
        } else {
          // No WT prefix — try plain "ITEM  PRICE" on next line
          const plain = n1.match(priceAtEnd)
          if (plain && !skipPatterns.some(p => p.test(n1))) {
            description = n1.replace(priceAtEnd, '').trim().toUpperCase()
            totalPrice  = parseFloat(plain[1])
            skip = 2
          }
        }
      }

      // Fallback: calculate price from weight if we have a name but no price
      if (description && totalPrice === null)
        totalPrice = Math.round(weight * pricePerUnit * 100) / 100

      if (description && totalPrice !== null) {
        items.push({ rawText: line, description, price: totalPrice, pricePerUnit, weight, unit, quantity: 1, productId: null, productName: null })
        i += skip; continue
      }
    }

    // ── PATTERN B: WT line with price ────────────────────────────────────
    const wtP = line.match(wtLineWithPrice)
    if (wtP) {
      items.push({ rawText: line, description: wtP[1].trim().toUpperCase(), price: parseFloat(wtP[2]), pricePerUnit: null, weight: null, unit: 'lb', quantity: 1, productId: null, productName: null })
      i++; continue
    }

    // ── PATTERN C: WT line without price (price on next line) ────────────
    const wtNP = line.match(wtLineNoPrice)
    if (wtNP) {
      let totalPrice = null, skip = 1
      if (i + 1 < lines.length) {
        const n1 = lines[i + 1]
        const p = n1.match(priceOnlyLine) || n1.match(priceAtEnd)
        if (p) { totalPrice = parseFloat(p[1]); skip = 2 }
      }
      if (totalPrice !== null) {
        items.push({ rawText: line, description: wtNP[1].trim().toUpperCase(), price: totalPrice, pricePerUnit: null, weight: null, unit: 'lb', quantity: 1, productId: null, productName: null })
        i += skip; continue
      }
    }

    // ── PATTERN D: regular item with price at end ─────────────────────────
    // e.g. "WB ORIG ALMONDMILK   2.49 F" or "HE SF HONEY COND   9.99"
    // Skip standalone price-only lines (e.g. "0.00" after TAX line)
    if (isPriceOnlyNoise(line)) { i++; continue }

    const pm = line.match(priceAtEnd)
    if (pm) {
      const price = parseFloat(pm[1])
      // Strip trailing price + optional tax code
      let description = line.replace(/\s+\$?\d{1,4}\.\d{2}\s*[A-Z]?\s*$/, '').trim()

      // Skip if description is too short, price is implausible
      if (description.length < 2 || price > 500) { i++; continue }

      // Qty prefix: "2 x EGGS" or "2 @ EGGS"
      let quantity = 1
      const qtyMatch = description.match(/^(\d+)\s+[@x]\s+/i)
      if (qtyMatch) { quantity = parseInt(qtyMatch[1]); description = description.replace(qtyMatch[0], '').trim() }

      items.push({ rawText: line, description: description.toUpperCase(), price, quantity, unit: '', pricePerUnit: null, weight: null, productId: null, productName: null })
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
- description: item name as printed, uppercased, WITHOUT size/weight suffix
- packageSize + packageUnit: fixed package size if in name (e.g. "BLUEBERRIES 18 OZ" → packageSize:18, packageUnit:"oz"; "STRAWBERRIES 1LB" → packageSize:1, packageUnit:"lb")
- For sold-by-weight items (WT prefix or lb@ lines): weight=actual weight purchased, pricePerUnit=per-lb rate
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
