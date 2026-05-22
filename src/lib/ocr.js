// src/lib/ocr.js — Receipt OCR using Tesseract.js (free, browser-native)

import { createWorker } from 'tesseract.js'

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

export function parseReceiptText(rawText) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean)
  const items = []
  const pricePattern = /^(.+?)\s+\$?(\d+\.\d{2})\s*[A-Z*]?\s*$/
  const skipPatterns = [
    /^(subtotal|total|tax|change|cash|card|debit|credit|balance|thank|welcome|savings|member|rewards|void|refund)/i,
    /^\*+$/,
    /^-+$/,
    /^\d{1,2}\/\d{1,2}\/\d{2,4}/,
    /^#\d+/,
    /^\(\d+\)/,
  ]

  for (const line of lines) {
    if (skipPatterns.some(p => p.test(line))) continue
    const match = line.match(pricePattern)
    if (match) {
      const description = match[1].trim()
      const price = parseFloat(match[2])
      if (description.length < 2 || price > 500) continue

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
        productId: null,
        productName: null,
      })
    }
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
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          {
            type: 'text',
            text: `Extract all line items from this grocery receipt. Return ONLY valid JSON, no markdown.
Format: {"storeName": "...", "date": "YYYY-MM-DD or null", "items": [{"description": "ITEM NAME AS ON RECEIPT", "price": 0.00, "quantity": 1}]}
- Use the item description exactly as printed (abbreviations and all)
- Skip subtotals, taxes, totals, payment lines
- price should be a number`
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
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
