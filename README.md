# Opptra Discount Engine
Live Demo- https://theayanmalik-discount-engine-assign.vercel.app/

A customer-facing discount engine for an e-commerce marketplace. Upload discount rules and cart items, see exactly what a shopper pays after brand, platform, and cart-wide offers.

## Features

- **CSV discount rule upload** — Brand, platform, and cart-scoped rules with validation
- **CSV cart upload** — Product items with brand, platform, and base price
- **Item-level discount selection** — Best non-stackable offer wins (by rupee savings), stackable offers chain on top
- **Stackable discounts** — Percentage discounts compound on the running price
- **Cart-level discounts** — Percentage offers that trigger when the item-discounted subtotal meets a threshold
- **LLM-based natural-language rule creation** — Describe a rule in plain English; the server parses it via OpenAI
- **Rule validation and confirmation** — Every parsed rule is independently validated; nothing activates without user confirmation
- **PDF cart extraction** — Upload a text-based PDF with Product, Brand, Platform, and Base Price columns
- **Automatic recalculation** — Prices update whenever rules are confirmed or the cart changes
- **Customer-facing price breakdown** — Item savings, applied offers, cart subtotal, cart discount, and final payable amount
- **Load Sample Data** — One-click demo with the assignment's sample rules and cart

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for diagrams and module responsibilities.

| Module | Responsibility |
|---|---|
| `src/engine/discountEngine.js` | Pure discount calculation: item-level and cart-level |
| `src/engine/csvParser.js` | CSV → typed `DiscountRule` and `CartItem` objects |
| `src/engine/pdfCartParser.js` | PDF → `CartItem` objects via PDF.js coordinate grouping |
| `src/engine/ruleValidator.js` | Independent validation of candidate rules |
| `server/parseRule.js` | Server-side LLM handler (OpenAI API, system prompt, validation) |
| `api/parse-rule.js` | Vercel serverless function wrapper |
| `src/App.jsx` | Application state and layout |
| `src/components/*.jsx` | Presentational components |

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite 5, JavaScript (ES modules) |
| CSV parsing | PapaParse 5 |
| PDF extraction | pdfjs-dist 4 (client-side) |
| LLM provider | OpenAI API (gpt-4o-mini default) |
| Serverless | Vercel Functions |
| Testing | Node.js built-in test runner |

## Local Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.example .env.local
# Edit .env.local and add your OpenAI API key

# 3. Start the development server
npm run dev
```

Open http://localhost:5173

The Vite dev server includes a middleware that proxies `/api/parse-rule` to the same LLM handler used in production, so both the frontend and the natural-language endpoint work from `npm run dev`.

## Environment Variables

Create a `.env.local` file (never commit it):

```
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-4o-mini
```

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | Yes (for NL rules) | OpenAI API key. Read server-side only. |
| `OPENAI_MODEL` | No | Model name. Defaults to `gpt-4o-mini`. |

> **Security**: The API key is read only in `server/parseRule.js` and the Vercel function. It is never exposed to the browser or included in the frontend bundle. If the key is missing, the LLM feature shows a configuration error; all other features continue working.

## Usage Instructions

### Upload rules and cart

1. Click **Load sample data** to use the included sample files, or:
2. Upload `sample-data/rules.csv` in the **Discount rules** section
3. Upload `sample-data/cart.csv` in the **Cart** section
4. Click **Calculate Discounts**

### Create a natural-language rule

1. Type a discount description in the **Create a rule in plain English** section
   - Example: *"20% off for Natura Casa brand, stackable with other offers"*
2. Click **Parse rule** — the server sends it to OpenAI
3. Review the structured preview
4. Click **Confirm & add rule** to activate, or **Discard** to cancel
5. The cart recalculates automatically

### Upload a PDF cart

1. In the **Cart** section, click **Upload PDF**
2. Select a text-based PDF with Product, Brand, Platform, and Base Price columns
3. The PDF is parsed client-side; on success the cart is replaced and prices recalculate
4. If parsing fails, the previous cart is preserved

## CSV Formats

**rules.csv**

```
rule_id,scope,applies_to,type,value,stackable,min_cart_value
RULE-01,platform,Amazon India,percentage,15,false,
RULE-02,brand,Natura Casa,flat,150,false,
RULE-03,platform,Flipkart,percentage,10,true,
RULE-04,cart,,percentage,10,false,4000
```

| Column | Type | Notes |
|---|---|---|
| rule_id | string | Unique identifier |
| scope | `brand` \| `platform` \| `cart` | Rule scope |
| applies_to | string \| empty | Brand/platform name; empty for cart rules |
| type | `percentage` \| `flat` | Discount type (cart rules: percentage only) |
| value | number | Positive; percentages ≤ 100 |
| stackable | `true` \| `false` | Whether it stacks with other offers |
| min_cart_value | number \| empty | Required for cart rules; must be positive |

**cart.csv**

```
item_id,product,brand,platform,base_price
ITEM-01,Cushion Cover,Natura Casa,Amazon India,1299
```

## Expected Sample Output

| Item | Base Price | Final Price | Reasoning |
|---|---:|---:|---|
| ITEM-01 | Rs.1,299 | Rs.1,104 | Platform offer: 15% off |
| ITEM-02 | Rs.849 | Rs.629 | Brand offer: Rs.150 off + Platform offer: 10% off |
| ITEM-03 | Rs.599 | Rs.509 | Platform offer: 15% off |
| ITEM-04 | Rs.2,499 | Rs.2,499 | No offers available |
| ITEM-05 | Rs.449 | Rs.382 | Platform offer: 15% off |
| ITEM-06 | Rs.899 | Rs.809 | Platform offer: 10% off |

**Cart summary:**
- Cart total before offer: **Rs.5,932**
- Cart offer (RULE-04): 10% off — **Rs.593 saved**
- Final cart total: **Rs.5,339**

## Testing

```bash
npm test
```

Runs 49 tests using Node's built-in test runner:

- **discountEngine.test.js** (18 tests) — Item-level and cart-level discount logic, boundary cases, rounding
- **csvParser.test.js** (10 tests) — Rule and cart CSV parsing, validation, error reporting
- **ruleValidator.test.js** (7 tests) — Candidate rule validation, parse response validation, ID assignment
- **parseRule.test.js** (6 tests) — API endpoint: missing key, invalid requests, model responses, rate limits
- **pdfCartParser.test.js** (8 tests) — PDF extraction, price parsing, error handling, real PDF integration

Tests that exercise the LLM endpoint use a mock `fetchImpl` and do not require a live API key.

## Deployment

### Vercel (recommended)

1. Push the repository to GitHub
2. Import the project in [vercel.com](https://vercel.com)
3. Framework preset: **Vite**
4. Build command: `npm run build`
5. Output directory: `dist`
6. Add environment variables in Vercel dashboard:
   - `OPENAI_API_KEY` — your OpenAI API key
   - `OPENAI_MODEL` — `gpt-4o-mini` (optional)
7. Deploy

The `vercel.json` and `api/parse-rule.js` are already configured. The serverless function at `/api/parse-rule` handles the LLM integration.

### Manual build

```bash
npm run build
```

Deploy the `dist/` folder to any static host. The `/api/parse-rule` endpoint requires a serverless function runtime (Vercel, Netlify Functions, etc.).

### Production verification

After deployment:
1. Open the live URL
2. Click **Load sample data**
3. Verify the six item prices and Rs.5,339 final total
4. Test a natural-language rule (requires OPENAI_API_KEY configured)
5. Test PDF upload with `sample-data/cart.pdf`

## Live Deployment

<!-- Add your verified deployment URL here after deploying -->
> **Note**: Add the verified live URL here after deploying to Vercel.

## Engineering Decisions

See [docs/ENGINEERING_DECISIONS.md](docs/ENGINEERING_DECISIONS.md) for documented tradeoffs including:
- Why the existing engine was extended instead of replaced
- How competing non-stackable cart offers are handled
- Why LLM rules require independent validation and user confirmation
- How malformed PDFs are handled without destroying the existing cart
- Cart threshold boundary behaviour

## Project Structure

```
src/
  engine/
    discountEngine.js    ← pure discount logic (no UI)
    csvParser.js         ← CSV → typed objects
    pdfCartParser.js     ← PDF → CartItem objects
    ruleValidator.js     ← independent rule validation
  components/
    CsvUploader.jsx      ← CSV file upload
    PdfUploader.jsx      ← PDF file upload
    DataTable.jsx        ← reusable table
    ErrorBanner.jsx      ← error display
    Notice.jsx           ← success/warning notices
    RuleInput.jsx        ← natural-language input + examples
    RuleConfirmation.jsx ← parsed rule preview + confirm/discard
    ResultsTable.jsx     ← item price results
    CartSummary.jsx      ← cart subtotal, offer, final total
  App.jsx                ← main UI + state
  main.jsx               ← entry point
  formatMoney.js         ← rupee formatting
  index.css              ← all styles

api/
  parse-rule.js          ← Vercel serverless function

server/
  parseRule.js           ← LLM handler (shared by Vite dev + Vercel)

docs/
  ARCHITECTURE.md        ← architecture diagrams
  ENGINEERING_DECISIONS.md ← tradeoff documentation

sample-data/
  rules.csv              ← sample discount rules (4 rules)
  cart.csv               ← sample cart items (6 products)
  cart.pdf               ← sample PDF cart

tests/
  discountEngine.test.js
  csvParser.test.js
  ruleValidator.test.js
  parseRule.test.js
  pdfCartParser.test.js
  acceptance.test.js
```
