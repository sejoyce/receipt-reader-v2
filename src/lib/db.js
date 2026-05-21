// src/lib/db.js — All Firestore read/write operations

import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, setDoc,
  query, where, orderBy, serverTimestamp, arrayUnion
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from './firebase'

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

export async function addAliasToProduct(productId, alias) {
  await updateDoc(doc(db, 'products', productId), {
    aliases: arrayUnion(alias.toUpperCase().trim())
  })
}

/** Find a product by one of its aliases. Returns product or null. */
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

export async function getOrCreateStore(name) {
  const normalized = name.trim()
  const q = query(collection(db, 'stores'), where('name', '==', normalized))
  const snap = await getDocs(q)
  if (!snap.empty) {
    const d = snap.docs[0]
    return { id: d.id, ...d.data() }
  }
  const ref = await addDoc(collection(db, 'stores'), { name: normalized, createdAt: serverTimestamp() })
  return { id: ref.id, name: normalized }
}

// ── Receipts ──────────────────────────────────────────────────────────────────

export async function saveReceipt({ storeId, storeName, date, imageFile, items, uploadedBy }) {
  let imageUrl = null
  if (imageFile) {
    const storageRef = ref(storage, `receipts/${Date.now()}_${imageFile.name}`)
    await uploadBytes(storageRef, imageFile)
    imageUrl = await getDownloadURL(storageRef)
  }

  const receiptRef = await addDoc(collection(db, 'receipts'), {
    storeId,
    storeName,
    date: date ? new Date(date) : serverTimestamp(),
    imageUrl,
    uploadedBy: uploadedBy || 'unknown',
    items,
    createdAt: serverTimestamp(),
  })

  // Write price history entries for resolved items
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
  // For each product, find the lowest price entry across all stores
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
