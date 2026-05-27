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
 * Parse raw OCR text into structured receipt items.
 *
 * Handles all observed formats:
 *
 * 1. Regular item (trailing F/T tax code optional):
 *      WB ORIG ALMONDMILK        2.49 F
 *
 * 2. Weight-before format (Wegmans, Kroger, many others):
 *      3.61 lb @ 0.49 /lb
 *      WT    BANANAS             1.77 F
 *
 * 3. Weight-after / inline format:
 *      BANANA 0.73 lb @ 0.59/lb  0.43
 *
 * 4. Qty prefix:
 *      2 x EGGS                  5.98
 */
export function parseReceiptText(rawText) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean)
  const items = []

  const skipPatterns = [
    /^(subtotal|sub-total|total|tax|change|cash|card|debit|credit|balance|thank|welcome|savings|member|rewards|void|refund|loyalty|points|discount|mastercard|visa|auth|rcpt|op#|every\s+day)/i,
    /^\*+/,
    /^[-=]+$/,
    /^\d{1,2}\/\d{1,2}\/\d{2,4}\s/, // date lines like "05/06/26 OP# 84"
    /^#\d+/,
    /^\(\d{3}\)/,                     // phone numbers like (302) 551-6100
    /^card\s+number/i,
    /^chase/i,
  ]

  // Price at end of line — number, optional space, optional single letter (tax code)
  // e.g. "2.49 F" or "19.99 F" or "1.77"
  const priceAtEnd = /\$?(\d+\.\d{2})\s*[A-Za-z]?\s*$/

  // Weight-only line: "3.61 lb @ 0.49 /lb"  or  "0.73 LB @ $0.59/LB"
  // Captures: (weight) (unit) (pricePerUnit) (unit again)
  const weightOnlyLine = /^(\d*\.?\d+)\s*(lb|lbs|oz|kg|g)\b\s*@\s*\$?(\d+\.?\d*)\s*[\/\\]?\s*(lb|lbs|oz|kg|g)\b/i

  // "WT" prefix line: "WT   BANANAS   1.77 F"
  const wtPrefix = /^WT\s+(.+?)\s+\$?(\d+\.\d{2})\s*[A-Za-z]?\s*$/i

  // Weight inline on same line as item: "BANANA 0.73 lb @ 0.59/lb  0.43 F"
  const weightInline = /^(.+?)\s+(\d*\.?\d+)\s*(lb|lbs|oz|kg|g)\s*@\s*\$?(\d+\.?\d*)\s*[\/\\]\s*(lb|lbs|oz|kg)/i

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    if (skipPatterns.some(p => p.test(line))) { i++; continue }

    // ── Pattern A: weight line BEFORE item ("3.61 lb @ 0.49 /lb") ─────────
    // Next line is the actual item, possibly prefixed with "WT"
    const wOnly = line.match(weightOnlyLine)
    if (wOnly && i + 1 < lines.length) {
      const nextLine = lines[i + 1]
      const weight = parseFloat(wOnly[1])
      const unit = wOnly[2].toLowerCase().replace('lbs', 'lb')
      const pricePerUnit = parseFloat(wOnly[3])

      // Next line could be "WT   BANANAS   1.77 F" or just "BANANAS   1.77 F"
      const wtMatch = nextLine.match(wtPrefix)
      const plainMatch = nextLine.match(/^(.+?)\s+\$?(\d+\.\d{2})\s*[A-Za-z]?\s*$/)

      let description = null
      let totalPrice = null

      if (wtMatch) {
        description = wtMatch[1].trim().toUpperCase()
        totalPrice = parseFloat(wtMatch[2])
      } else if (plainMatch && !skipPatterns.some(p => p.test(nextLine))) {
        description = plainMatch[1].trim().toUpperCase()
        totalPrice = parseFloat(plainMatch[2])
      }

      if (description && totalPrice !== null) {
        items.push({
          rawText: line + ' | ' + nextLine,
          description,
          price: totalPrice,
          pricePerUnit,
          weight,
          unit,
          quantity: 1,
          productId: null,
          productName: null,
        })
        i += 2; continue
      }
    }

    // ── Pattern B: "WT ITEMNAME PRICE" on a single line ──────────────────
    // (in case OCR merges the weight line into the WT line)
    const wtSingle = line.match(wtPrefix)
    if (wtSingle) {
      items.push({
        rawText: line,
        description: wtSingle[1].trim().toUpperCase(),
        price: parseFloat(wtSingle[2]),
        pricePerUnit: null,
        weight: null,
        unit: 'lb',
        quantity: 1,
        productId: null,
        productName: null,
      })
      i++; continue
    }

    // ── Pattern C: weight inline ("BANANA 0.73 lb @ 0.59/lb  0.43") ──────
    const wInline = line.match(weightInline)
    if (wInline) {
      const priceMatch = line.match(priceAtEnd)
      if (priceMatch) {
        const weight = parseFloat(wInline[2])
        const unit = wInline[3].toLowerCase().replace('lbs', 'lb')
        const pricePerUnit = parseFloat(wInline[4])
        items.push({
          rawText: line,
          description: wInline[1].trim().toUpperCase(),
          price: parseFloat(priceMatch[1]),
          pricePerUnit,
          weight,
          unit,
          quantity: 1,
          productId: null,
          productName: null,
        })
        i++; continue
      }
    }

    // ── Pattern D: regular item with price at end ─────────────────────────
    const priceMatch = line.match(priceAtEnd)
    if (priceMatch) {
      const price = parseFloat(priceMatch[1])
      // Strip the price (and optional tax code letter) from the end
      let description = line.replace(/\s+\$?\d+\.\d{2}\s*[A-Za-z]?\s*$/, '').trim()

      if (description.length < 2 || price > 500) { i++; continue }

      // Qty prefix: "2 x EGGS" or "2 @ EGGS"
      let quantity = 1
      const qtyMatch = description.match(/^(\d+)\s+[@x]\s+/i)
      if (qtyMatch) {
        quantity = parseInt(qtyMatch[1])
        description = description.replace(qtyMatch[0], '').trim()
      }

      items.push({
        rawText: line,
        description: description.toUpperCase(),
        price,
        quantity,
        unit: '',
        pricePerUnit: null,
        weight: null,
        productId: null,
        productName: null,
      })
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
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          {
            type: 'text',
            text: `Extract all purchased line items from this grocery receipt. Return ONLY valid JSON, no markdown.
Format: {"storeName": "...", "storeAddress": "...", "date": "YYYY-MM-DD or null", "items": [{"description": "ITEM NAME", "price": 0.00, "quantity": 1, "weight": null, "unit": "", "pricePerUnit": null}]}
Rules:
- description: item name exactly as printed, uppercased
- For weighted items (lines with "WT", "lb @", "kg @", etc): set weight (number), unit ("lb"/"kg"/"oz"), pricePerUnit (number per unit)
- price is always the final charged dollar amount
- Skip: tax, subtotal, total, balance, payment, auth, card number lines
- Include storeName and storeAddress from the receipt header if visible`
          }
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
