import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, arrayUnion, writeBatch
} from 'firebase/firestore'
import { db } from './firebase'

// ── Products ──────────────────────────────────────────────────────────────────

export async function getAllProducts() {
  const snap = await getDocs(collection(db, 'products'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function createProduct({ name, category, aliases = [] }) {
  const ref = await addDoc(collection(db, 'products'), {
    name, category: category || 'Other',
    aliases: aliases.map(a => a.toUpperCase().trim()),
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateProduct(productId, fields) {
  await updateDoc(doc(db, 'products', productId), fields)
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
  if (!snap.empty) { const d = snap.docs[0]; return { id: d.id, ...d.data() } }
  const ref = await addDoc(collection(db, 'stores'), { name: normalized, address: address.trim(), createdAt: serverTimestamp() })
  return { id: ref.id, name: normalized, address: address.trim() }
}

// Store auto-detection from OCR text
const STORE_PATTERNS = [
  [/trader\s*joe/i, "Trader Joe's"], [/whole\s*foods/i, "Whole Foods"],
  [/kroger/i, "Kroger"], [/safeway/i, "Safeway"], [/albertson/i, "Albertsons"],
  [/aldi/i, "ALDI"], [/lidl/i, "Lidl"], [/costco/i, "Costco"],
  [/sam.s\s*club/i, "Sam's Club"], [/walmart|wal-mart/i, "Walmart"],
  [/target/i, "Target"], [/publix/i, "Publix"], [/meijer/i, "Meijer"],
  [/heb\b/i, "H-E-B"], [/wegman/i, "Wegmans"], [/stop\s*&?\s*shop/i, "Stop & Shop"],
  [/giant\s*food/i, "Giant Food"], [/food\s*lion/i, "Food Lion"],
  [/sprouts/i, "Sprouts"], [/harris\s*teeter/i, "Harris Teeter"],
  [/vons/i, "Vons"], [/ralphs/i, "Ralphs"], [/market\s*basket/i, "Market Basket"],
  [/shaw.s/i, "Shaw's"], [/hannaford/i, "Hannaford"],
  [/price\s*chopper/i, "Price Chopper"], [/winco/i, "WinCo"],
  [/food\s*4\s*less/i, "Food 4 Less"], [/smart\s*&?\s*final/i, "Smart & Final"],
  [/fresh\s*thyme/i, "Fresh Thyme"],
]

export function detectStoreFromText(rawText) {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean)
  const top = lines.slice(0, 8)
  let storeName = null, storeAddress = null

  for (const line of top) {
    if (storeName) break
    for (const [pattern, canonical] of STORE_PATTERNS) {
      if (pattern.test(line)) { storeName = canonical; break }
    }
  }

  const addressPattern = /^\d+\s+\w.*(st|ave|blvd|rd|dr|ln|way|pkwy|hwy|court|ct|plaza|plz|mall|cir|circle)\.?\b/i
  for (const line of top) {
    if (addressPattern.test(line)) {
      storeAddress = line
      const addrIdx = lines.indexOf(line)
      if (addrIdx >= 0 && lines[addrIdx + 1]) {
        const cityLine = lines[addrIdx + 1]
        if (/[A-Z]{2}\s+\d{5}/.test(cityLine) || /,\s*[A-Z]{2}/.test(cityLine))
          storeAddress = storeAddress + ', ' + cityLine
      }
      break
    }
  }
  return { storeName, storeAddress }
}

// ── Receipts ──────────────────────────────────────────────────────────────────

export async function saveReceipt({ storeId, storeName, storeAddress, date, items, uploadedBy }) {
  const receiptRef = await addDoc(collection(db, 'receipts'), {
    storeId, storeName, storeAddress: storeAddress || '',
    date: date ? new Date(date) : serverTimestamp(),
    uploadedBy: uploadedBy || 'unknown',
    items, createdAt: serverTimestamp(),
  })
  await _writePriceHistory(receiptRef.id, storeId, storeName, date, items)
  return receiptRef.id
}

export async function updateReceipt(receiptId, { storeName, storeAddress, date, items }) {
  const updates = {}
  if (storeName !== undefined) updates.storeName = storeName
  if (storeAddress !== undefined) updates.storeAddress = storeAddress
  if (date !== undefined) updates.date = date ? new Date(date) : serverTimestamp()
  if (items !== undefined) updates.items = items
  await updateDoc(doc(db, 'receipts', receiptId), updates)

  // Rebuild price history for this receipt
  if (items !== undefined) {
    const receiptSnap = await getDoc(doc(db, 'receipts', receiptId))
    const receipt = receiptSnap.data()
    // Delete old price history entries for this receipt
    const oldQ = query(collection(db, 'priceHistory'), where('receiptId', '==', receiptId))
    const oldSnap = await getDocs(oldQ)
    const batch = writeBatch(db)
    oldSnap.docs.forEach(d => batch.delete(d.ref))
    await batch.commit()
    // Write fresh ones
    await _writePriceHistory(receiptId, receipt.storeId, storeName || receipt.storeName, date || receipt.date, items)
  }
}

export async function deleteReceipt(receiptId) {
  // Delete receipt doc
  await deleteDoc(doc(db, 'receipts', receiptId))
  // Delete all price history entries for this receipt
  const q = query(collection(db, 'priceHistory'), where('receiptId', '==', receiptId))
  const snap = await getDocs(q)
  const batch = writeBatch(db)
  snap.docs.forEach(d => batch.delete(d.ref))
  await batch.commit()
}

async function _writePriceHistory(receiptId, storeId, storeName, date, items) {
  const promises = items
    .filter(item => item.productId && item.price != null)
    .map(item =>
      addDoc(collection(db, 'priceHistory'), {
        productId: item.productId,
        productName: item.productName,
        storeId, storeName,
        price: item.price,
        unit: item.unit || '',
        pricePerUnit: item.pricePerUnit || null,
        weight: item.weight || null,
        packageSize: item.packageSize || null,
        packageUnit: item.packageUnit || '',
        date: date ? new Date(date) : serverTimestamp(),
        receiptId,
      })
    )
  await Promise.all(promises)
}

export async function getAllReceipts() {
  const q = query(collection(db, 'receipts'), orderBy('date', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ── Price History ─────────────────────────────────────────────────────────────

export async function getPriceHistoryForProduct(productId) {
  const q = query(collection(db, 'priceHistory'), where('productId', '==', productId), orderBy('date', 'asc'))
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
      byProduct[entry.productId] = { productId: entry.productId, productName: entry.productName, entries: [], lowestPrice: null, lowestStore: null }
    }
    byProduct[entry.productId].entries.push(entry)
    if (byProduct[entry.productId].lowestPrice === null || entry.price < byProduct[entry.productId].lowestPrice) {
      byProduct[entry.productId].lowestPrice = entry.price
      byProduct[entry.productId].lowestStore = entry.storeName
    }
  }
  return Object.values(byProduct).sort((a, b) => a.productName.localeCompare(b.productName))
}
