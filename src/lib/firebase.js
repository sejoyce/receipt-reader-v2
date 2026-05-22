// src/lib/firebase.js
// ─────────────────────────────────────────────────────────────────────────────
// SETUP INSTRUCTIONS:
// 1. Go to https://console.firebase.google.com and create a project
// 2. Enable Firestore Database (start in test mode for development)
//    — Storage is NOT needed; this app runs entirely on the free Spark plan
// 3. Register a Web App and copy the config below
// 4. Replace the placeholder values with your actual config
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)

export const db = getFirestore(app)

// ─────────────────────────────────────────────────────────────────────────────
// FIRESTORE DATA MODEL:
//
// /products/{productId}
//   name: string           — canonical product name (e.g. "Whole Milk 1gal")
//   category: string       — e.g. "Dairy"
//   aliases: string[]      — abbreviations from receipts (e.g. ["WHL MLK 1G"])
//
// /stores/{storeId}
//   name: string           — e.g. "Trader Joe's"
//
// /receipts/{receiptId}
//   storeId: string
//   storeName: string
//   date: Timestamp
//   uploadedBy: string     — "partner1" | "partner2"
//   items: [
//     { rawText, description, productId, productName, price, quantity, unit }
//   ]
//
// /priceHistory/{entryId}
//   productId, productName, storeId, storeName, price, date, receiptId
// ─────────────────────────────────────────────────────────────────────────────
