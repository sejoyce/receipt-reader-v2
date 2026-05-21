// src/lib/ocr.js — Receipt OCR using Tesseract.js (free, browser-native)

import { createWorker } from 'tesseract.js'

/**
 * Run Tesseract OCR on an image file.
 * Returns raw text string.
 */
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
 * Grocery receipts typically have lines like:
 *   ITEM ABBREV      1.99
 *   SOME PRODUCT     @2  3.98
 *   ORGANIC MLK 1GL  4.49 F
 *
 * Returns array of: { rawText, description, price, quantity, unit }
 */
export function parseReceiptText(rawText) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean)
  const items = []

  // Regex: capture description + price (handles $ prefix, trailing letters like F/T/tax codes)
  const pricePattern = /^(.+?)\s+\$?(\d+\.\d{2})\s*[A-Z*]?\s*$/

  // Skip lines that look like headers/footers
  const skipPatterns = [
    /^(subtotal|total|tax|change|cash|card|debit|credit|balance|thank|welcome|savings|member|rewards|void|refund)/i,
    /^\*+$/,
    /^-+$/,
    /^\d{1,2}\/\d{1,2}\/\d{2,4}/, // dates
    /^#\d+/,                         // transaction numbers
    /^\(\d+\)/,                       // phone numbers
  ]

  for (const line of lines) {
    if (skipPatterns.some(p => p.test(line))) continue

    const match = line.match(pricePattern)
    if (match) {
      const description = match[1].trim()
      const price = parseFloat(match[2])

      // Skip very short descriptions (likely noise) or suspiciously high prices
      if (description.length < 2 || price > 500) continue

      // Try to extract quantity like "2 @" or "@2"
      let quantity = 1
      let cleanDesc = description
      const qtyMatch = description.match(/^(\d+)\s+[@x]\s*/i) || description.match(/[@x]\s*(\d+)\s*/i)
      if (qtyMatch) {
        quantity = parseInt(qtyMatch[1])
        cleanDesc = description.replace(qtyMatch[0], '').trim()
      }

      items.push({
        rawText: line,
        description: cleanDesc.toUpperCase(),
        price,
        quantity,
        unit: '',
        productId: null,   // to be resolved via alias lookup
        productName: null,
      })
    }
  }

  return items
}

/**
 * Use Claude Vision API (Anthropic) as a fallback for better accuracy.
 * Only called if VITE_ANTHROPIC_API_KEY is set.
 */
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
      model: 'claude-opus-4-5',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 }
          },
          {
            type: 'text',
            text: `Extract all line items from this grocery receipt. Return ONLY valid JSON, no markdown, no explanation.
Format: {"storeName": "...", "date": "YYYY-MM-DD or null", "items": [{"description": "ITEM NAME AS ON RECEIPT", "price": 0.00, "quantity": 1}]}
- Use the item description exactly as printed on the receipt (abbreviations and all)
- Skip subtotals, taxes, totals, payment lines
- price should be the per-item price as a number`
          }
        ]
      }]
    })
  })

  if (!response.ok) throw new Error(`Claude API error: ${response.status}`)
  const data = await response.json()
  const text = data.content[0].text.trim()

  try {
    const parsed = JSON.parse(text)
    return {
      storeName: parsed.storeName || '',
      date: parsed.date || null,
      items: (parsed.items || []).map(item => ({
        rawText: item.description,
        description: (item.description || '').toUpperCase(),
        price: parseFloat(item.price) || 0,
        quantity: item.quantity || 1,
        unit: '',
        productId: null,
        productName: null,
      }))
    }
  } catch {
    throw new Error('Failed to parse Claude response as JSON')
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
