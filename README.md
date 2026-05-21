# 🛒 Basket — Grocery Price Tracker

A Vite + React + Firestore web app for two people to upload grocery receipts, track product prices across stores, and find the best deals over time.

---

## Features

- **Receipt OCR** — Upload a photo and Tesseract.js reads it in the browser (free, no server needed). Optional Claude Vision for better accuracy.
- **Smart alias resolution** — When a new store abbreviation is found, a modal prompts you to map it to a known product. That mapping is saved forever.
- **Price history charts** — See how a product's price has changed at each store over time.
- **Store comparison** — Side-by-side table showing avg, min, and max price per store.
- **Best deals dashboard** — Cards showing the lowest price ever seen and where to buy it.
- **Receipt log** — Full history of every uploaded receipt with expandable item lists.
- **Shared Firestore** — Both partners upload from their own devices; data is shared in real time.

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Set up Firebase

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create a new project
3. **Firestore Database** → Create database → Start in test mode
4. **Storage** → Get started
5. **Project Settings** → Your Apps → Add Web App → copy config

### 3. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` and fill in your Firebase config values.

### 4. Deploy Firestore rules & indexes

```bash
npm install -g firebase-tools
firebase login
firebase use --add   # select your project
firebase deploy --only firestore,storage
```

### 5. Run the app

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## Optional: Claude Vision (better OCR)

For more accurate receipt parsing (especially handwritten or low-quality images):

1. Get an API key from [console.anthropic.com](https://console.anthropic.com)
2. Add to `.env.local`:
   ```
   VITE_ANTHROPIC_API_KEY=sk-ant-...
   ```
3. On the Upload page, switch the extraction method to **Claude Vision**

> ⚠️ The API key will be visible in the browser. For a shared/public deployment, move the Claude API call to a backend function.

---

## Project Structure

```
src/
├── lib/
│   ├── firebase.js      # Firebase init + data model docs
│   ├── db.js            # All Firestore read/write operations
│   └── ocr.js           # Tesseract + Claude receipt parsing
├── components/
│   ├── Sidebar.jsx      # Navigation
│   └── AliasModal.jsx   # Unknown abbreviation resolution UI
├── pages/
│   ├── Dashboard.jsx    # Stats + recent activity
│   ├── UploadReceipt.jsx # Full upload + OCR + review flow
│   ├── ReceiptLog.jsx   # History of all receipts
│   ├── ComparePrices.jsx # Price charts by product + store
│   ├── Products.jsx     # Product catalog + alias management
│   └── BestDeals.jsx    # Lowest price cards
└── hooks/
    └── useToast.jsx     # Toast notification system
```

---

## Firestore Data Model

```
/products/{id}
  name: "Whole Milk 1 Gallon"
  category: "Dairy"
  aliases: ["WHL MLK 1G", "MILK WHOLE", "ORG WHL MLK"]

/stores/{id}
  name: "Trader Joe's"

/receipts/{id}
  storeId, storeName, date, imageUrl, uploadedBy
  items: [{ description, price, productId, productName, quantity }]

/priceHistory/{id}
  productId, productName, storeId, storeName, price, date, receiptId
```

---

## Deploying to Firebase Hosting

```bash
npm run build
firebase deploy --only hosting
```

Your app will be live at `https://your-project.web.app`

---

## Tips for Best OCR Results

- Take photos in good lighting with the receipt flat
- Avoid shadows across text
- Capture the full receipt in frame
- Tesseract works best on printed (not handwritten) text
- If Tesseract misses items, switch to Claude Vision or add items manually in the review step

---

## Roadmap Ideas

- [ ] Firebase Authentication (per-user data isolation)
- [ ] Push notifications when a favorite product goes on sale
- [ ] Weekly summary email
- [ ] Barcode scanning as an alternative to OCR
- [ ] Export price history to CSV
- [ ] Mobile app (Capacitor or React Native)
