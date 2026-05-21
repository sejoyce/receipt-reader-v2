// src/lib/firebase.js
// ─────────────────────────────────────────────────────────────────────────────
// SETUP INSTRUCTIONS:
// 1. Go to https://console.firebase.google.com and create a project
// 2. Enable Firestore Database (start in test mode for development)
// 3. Enable Storage (for receipt images)
// 4. Register a Web App and copy the config below
// 5. Replace the placeholder values with your actual config
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)

export const db = getFirestore(app)
export const storage = getStorage(app)

// ─────────────────────────────────────────────────────────────────────────────
// FIRESTORE DATA MODEL:
//
// /products/{productId}
//   name: string           — canonical product name (e.g. "Whole Milk 1gal")
//   category: string       — e.g. "Dairy"
//   aliases: string[]      — abbreviations from receipts (e.g. ["WHL MLK 1G", "MILK WHL"])
//
// /stores/{storeId}
//   name: string           — e.g. "Trader Joe's"
//   location: string       — optional address/neighborhood
//
// /receipts/{receiptId}
//   storeId: string
//   storeName: string
//   date: Timestamp
//   imageUrl: string
//   uploadedBy: string     — "partner1" | "partner2"
//   items: [
//     { rawText: string, productId: string|null, productName: string, price: number, unit: string }
//   ]
//
// /priceHistory/{entryId}
//   productId: string
//   productName: string
//   storeId: string
//   storeName: string
//   price: number
//   date: Timestamp
//   receiptId: string
// ─────────────────────────────────────────────────────────────────────────────
