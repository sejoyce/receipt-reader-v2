# 🛒 Basket — Grocery Price Tracker

A Vite + React + Firestore web app for two people to upload grocery receipts, track product prices across stores, and find the best deals over time. **100% free** — runs on Firebase's Spark (free) plan with no payment required.

---

## Features

- **Receipt OCR** — Upload a photo; Tesseract.js reads it locally in your browser (free, no server). Optional Claude Vision for better accuracy.
- **Smart alias resolution** — When a new store abbreviation appears, a modal prompts you to map it to a product. Saved forever so future receipts recognize it automatically.
- **Price history charts** — See how a product's price has changed at each store over time.
- **Store comparison** — Side-by-side table: avg, min, and max price per store.
- **Best deals dashboard** — Cards showing the lowest price ever seen and where to buy it.
- **Receipt log** — Full history of every uploaded receipt with expandable item lists.
- **Shared Firestore** — Both partners upload from their own devices; all data is shared in real time.

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Set up Firebase (free Spark plan)

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create a new project
3. **Firestore Database** → Create database → Start in **test mode**
4. ⚠️ Do NOT enable Storage — it requires a paid plan and this app doesn't need it
5. **Project Settings** → Your Apps → **Add Web App** → copy the config snippet

### 3. Configure environment

```bash
cp .env.example .env.local
```

Open `.env.local` and paste in your Firebase values (no Storage bucket needed).

### 4. Deploy Firestore rules & indexes

```bash
# In Command Prompt (cmd.exe) or Git Bash — NOT PowerShell
npx firebase-tools login
npx firebase-tools use --add
npx firebase-tools deploy --only firestore
```

### 5. Run the app

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## Firebase Free Tier Limits (Spark Plan)

| Resource | Free limit | Expected usage |
|---|---|---|
| Firestore reads | 50,000 / day | ~100–500 per session |
| Firestore writes | 20,000 / day | ~10–50 per receipt |
| Firestore storage | 1 GiB | Very low (text only) |
| Hosting | 10 GiB / month | Minimal |

A household scanning a few receipts per week will use a tiny fraction of these limits.

---

## Optional: Claude Vision (better OCR accuracy)

For more accurate receipt parsing on tricky images:

1. Get an API key from [console.anthropic.com](https://console.anthropic.com)
2. Add to `.env.local`:
   ```
   VITE_ANTHROPIC_API_KEY=sk-ant-...
   ```
3. On the Upload page, switch the extraction method to **Claude Vision**

> ⚠️ The API key will be visible in the browser bundle. For a shared/public deployment, proxy the Claude API call through a backend function.

---

## Project Structure

```
src/
├── lib/
│   ├── firebase.js        # Firebase init (Firestore only, no Storage)
│   ├── db.js              # All Firestore read/write operations
│   └── ocr.js             # Tesseract.js + optional Claude Vision parsing
├── components/
│   ├── Sidebar.jsx        # Navigation
│   └── AliasModal.jsx     # Unknown abbreviation → product mapping UI
├── pages/
│   ├── Dashboard.jsx      # Stats + recent activity
│   ├── UploadReceipt.jsx  # Upload → OCR → review → save flow
│   ├── ReceiptLog.jsx     # History of all receipts
│   ├── ComparePrices.jsx  # Price charts by product + store
│   ├── Products.jsx       # Product catalog + alias management
│   └── BestDeals.jsx      # Lowest price cards
└── hooks/
    └── useToast.jsx        # Toast notification system
```

---

## Firestore Data Model

```
/products/{id}
  name: "Whole Milk 1 Gallon"
  category: "Dairy"
  aliases: ["WHL MLK 1G", "MILK WHOLE"]   ← receipt abbreviations

/stores/{id}
  name: "Trader Joe's"

/receipts/{id}
  storeId, storeName, date, uploadedBy
  items: [{ description, price, productId, productName, quantity }]

/priceHistory/{id}
  productId, productName, storeId, storeName, price, date, receiptId
```

---

## Deploying to Firebase Hosting (free)

```bash
npm run build
npx firebase-tools deploy --only hosting
```

Your app will be live at `https://your-project.web.app` — shareable with your partner.

---

## Windows Tips

- Use **Command Prompt (cmd.exe)** or **Git Bash** instead of PowerShell to avoid script execution policy errors
- Or run: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` in PowerShell as Administrator

## OCR Tips

- Good lighting, receipt lying flat — no shadows across text
- Tesseract works best on printed thermal-paper receipts
- If items are missed, edit them manually in the review step before saving
- Claude Vision (optional) handles faded or angled receipts better
