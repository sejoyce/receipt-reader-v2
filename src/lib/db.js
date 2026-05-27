import {
  collection, doc, getDocs, addDoc, updateDoc,
  query, where, orderBy, serverTimestamp, arrayUnion
} from 'firebase/firestore'
import { db } from './firebase'

// ── Products ──────────────────────────────────────────────────────────────────

export async function getAllProducts() {
  const snap = await getDocs(collection(db, 'products'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function createProduct({ name, category, aliases = [] }) {
  const ref = await addDoc(collection(db, 'products'), {
    name,
    category: category || 'Uncategorized',
    aliases: aliases.map(a => a.toUpperCase().trim()),
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateProduct(productId, { name, category }) {
  await updateDoc(doc(db, 'products', productId), {
    ...(name !== undefined && { name }),
    ...(category !== undefined && { category }),
  })
}

export async function addAliasToProduct(productId, alias) {
  await updateDoc(doc(db, 'products', productId), {
    aliases: arrayUnion(alias.toUpperCase().trim())
  })
}

export async function findProductByAlias(alias) {
  const normalized = alias.toUpperCase().trim()
  const q = query(collection(db, 'products'), where('aliases', 'array-contains', normalized))
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...d.data() }
}

// ── Stores ────────────────────────────────────────────────────────────────────

export async function getAllStores() {
  const snap = await getDocs(collection(db, 'stores'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function getOrCreateStore(name, address = '') {
  const normalized = name.trim()
  const q = query(collection(db, 'stores'), where('name', '==', normalized))
  const snap = await getDocs(q)
  if (!snap.empty) {
    const d = snap.docs[0]
    return { id: d.id, ...d.data() }
  }
  const ref = await addDoc(collection(db, 'stores'), {
    name: normalized,
    address: address.trim(),
    createdAt: serverTimestamp()
  })
  return { id: ref.id, name: normalized, address: address.trim() }
}

// ── Store name aliases (e.g. "TRADER JOE'S #123" → "Trader Joe's") ───────────

// Known store name patterns → canonical name
const STORE_PATTERNS = [
  [/trader\s*joe/i,         "Trader Joe's"],
  [/whole\s*foods/i,        "Whole Foods"],
  [/kroger/i,               "Kroger"],
  [/safeway/i,              "Safeway"],
  [/albertson/i,            "Albertsons"],
  [/aldi/i,                 "ALDI"],
  [/lidl/i,                 "Lidl"],
  [/costco/i,               "Costco"],
  [/sam.s\s*club/i,         "Sam's Club"],
  [/walmart|wal-mart/i,     "Walmart"],
  [/target/i,               "Target"],
  [/publix/i,               "Publix"],
  [/meijer/i,               "Meijer"],
  [/heb\b/i,                "H-E-B"],
  [/wegman/i, "Wegmans"],
  [/stop\s*&?\s*shop/i,     "Stop & Shop"],
  [/giant\s*food/i,         "Giant Food"],
  [/food\s*lion/i,          "Food Lion"],
  [/sprouts/i,              "Sprouts"],
  [/harris\s*teeter/i,      "Harris Teeter"],
  [/vons/i,                 "Vons"],
  [/ralphs/i,               "Ralphs"],
  [/market\s*basket/i,      "Market Basket"],
  [/shaw.s/i,               "Shaw's"],
  [/hannaford/i,            "Hannaford"],
  [/price\s*chopper/i,      "Price Chopper"],
  [/winco/i,                "WinCo"],
  [/food\s*4\s*less/i,      "Food 4 Less"],
  [/smart\s*&?\s*final/i,   "Smart & Final"],
  [/fresh\s*thyme/i,        "Fresh Thyme"],
  [/lucky\s*supermarket/i,  "Lucky Supermarket"],
]

/**
 * Try to extract store name and address from the top lines of OCR text.
 * Returns { storeName, storeAddress } or nulls if not found.
 */
export function detectStoreFromText(rawText) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean)
  // Look at top 8 lines for store name
  const top = lines.slice(0, 8)

  let storeName = null
  let storeAddress = null

  for (const line of top) {
    if (storeName) break
    for (const [pattern, canonical] of STORE_PATTERNS) {
      if (pattern.test(line)) {
        storeName = canonical
        break
      }
    }
  }

  // Detect address: look for a line with a number + street word
  const addressPattern = /^\d+\s+\w.*(st|ave|blvd|rd|dr|ln|way|pkwy|hwy|court|ct|plaza|plz|mall|cir|circle)\.?\b/i
  for (const line of top) {
    if (addressPattern.test(line)) {
      storeAddress = line
      break
    }
  }

  // Also try to grab city/state line after address
  if (storeAddress) {
    const addrIdx = lines.indexOf(storeAddress)
    if (addrIdx >= 0 && lines[addrIdx + 1]) {
      const cityLine = lines[addrIdx + 1]
      if (/[A-Z]{2}\s+\d{5}/.test(cityLine) || /,\s*[A-Z]{2}/.test(cityLine)) {
        storeAddress = storeAddress + ', ' + cityLine
      }
    }
  }

  return { storeName, storeAddress }
}

// ── Receipts ──────────────────────────────────────────────────────────────────

export async function saveReceipt({ storeId, storeName, date, items, uploadedBy }) {
  const receiptRef = await addDoc(collection(db, 'receipts'), {
    storeId,
    storeName,
    date: date ? new Date(date) : serverTimestamp(),
    uploadedBy: uploadedBy || 'unknown',
    items,
    createdAt: serverTimestamp(),
  })

  const pricePromises = items
    .filter(item => item.productId && item.price != null)
    .map(item =>
      addDoc(collection(db, 'priceHistory'), {
        productId: item.productId,
        productName: item.productName,
        storeId,
        storeName,
        price: item.price,
        unit: item.unit || '',
        pricePerUnit: item.pricePerUnit || null,
        date: date ? new Date(date) : serverTimestamp(),
        receiptId: receiptRef.id,
      })
    )

  await Promise.all(pricePromises)
  return receiptRef.id
}

export async function getAllReceipts() {
  const q = query(collection(db, 'receipts'), orderBy('date', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ── Price History ─────────────────────────────────────────────────────────────

export async function getPriceHistoryForProduct(productId) {
  const q = query(
    collection(db, 'priceHistory'),
    where('productId', '==', productId),
    orderBy('date', 'asc')
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function getAllPriceHistory() {
  const q = query(collection(db, 'priceHistory'), orderBy('date', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function getBestDeals() {
  const allHistory = await getAllPriceHistory()
  const byProduct = {}

  for (const entry of allHistory) {
    if (!byProduct[entry.productId]) {
      byProduct[entry.productId] = {
        productId: entry.productId,
        productName: entry.productName,
        entries: [],
        lowestPrice: null,
        lowestStore: null,
      }
    }
    byProduct[entry.productId].entries.push(entry)
    if (byProduct[entry.productId].lowestPrice === null || entry.price < byProduct[entry.productId].lowestPrice) {
      byProduct[entry.productId].lowestPrice = entry.price
      byProduct[entry.productId].lowestStore = entry.storeName
    }
  }

  return Object.values(byProduct).sort((a, b) => a.productName.localeCompare(b.productName))
}
