# Architecture — Opptra Discount Engine

## High-Level Overview

The application is a client-side React SPA with one server-side API endpoint for LLM integration. All discount logic lives in pure JavaScript modules with no UI dependency.

```mermaid
flowchart TD
    User["User"]

    subgraph Frontend["React Frontend (Vite)"]
        CSV_R["CSV Rules Upload"]
        CSV_C["CSV Cart Upload"]
        PDF_C["PDF Cart Upload"]
        NL["Natural-Language Input"]
        UI["App.jsx — State & UI"]
        Results["Results Display"]
    end

    subgraph Engine["Discount Engine (pure JS)"]
        CSVParser["csvParser.js"]
        PDFParser["pdfCartParser.js"]
        Validator["ruleValidator.js"]
        Calc["discountEngine.js"]
    end

    subgraph Server["Server-side API"]
        API["/api/parse-rule"]
        LLM["OpenAI LLM"]
    end

    User --> CSV_R --> CSVParser
    User --> CSV_C --> CSVParser
    User --> PDF_C --> PDFParser
    User --> NL --> API --> LLM
    LLM --> API --> Validator
    CSVParser --> UI
    PDFParser --> UI
    Validator --> UI
    UI --> Calc
    Calc --> Results --> User
```

## Natural-Language Rule Flow

```mermaid
sequenceDiagram
    participant U as User
    participant FE as React Frontend
    participant API as POST /api/parse-rule
    participant LLM as OpenAI API
    participant V as ruleValidator.js
    participant E as discountEngine.js

    U->>FE: Types discount description
    FE->>API: POST { description }
    API->>LLM: Chat completion (strict JSON schema)
    LLM-->>API: { status, rule, message }
    API->>V: validateParseResponse()
    V-->>API: { ok, rule, message }
    API-->>FE: Validated response
    FE->>U: Shows confirmation preview
    U->>FE: Clicks "Confirm & Add Rule"
    FE->>V: validateCandidateRule() (second check)
    V-->>FE: Normalised rule
    FE->>E: calculateCartSummary(cart, [...rules, newRule])
    E-->>FE: Updated item + cart totals
    FE->>U: Displays recalculated prices
```

## Cart Processing Sequence

```mermaid
flowchart LR
    A["Cart Items"] --> B["Item-Level Discounts<br/>(brand & platform rules)"]
    B --> C["Item-Discounted Subtotal"]
    C --> D{"subtotal >= minCartValue?"}
    D -- Yes --> E["Cart-Level Discount<br/>(best non-stackable + stackables)"]
    D -- No --> F["No Cart Offer"]
    E --> G["Final Cart Total"]
    F --> G
```

## Module Responsibilities

| Module | Responsibility |
|---|---|
| `src/engine/discountEngine.js` | Pure discount calculation: item-level and cart-level. No UI, no side effects. |
| `src/engine/csvParser.js` | Converts CSV text to typed `DiscountRule` and `CartItem` objects via PapaParse. |
| `src/engine/pdfCartParser.js` | Extracts cart items from text-based PDFs using PDF.js coordinate grouping. |
| `src/engine/ruleValidator.js` | Independent validation of candidate rules (from LLM or any source). |
| `server/parseRule.js` | Server-side LLM handler: system prompt, OpenAI API call, response validation. |
| `api/parse-rule.js` | Vercel serverless function wrapper for `server/parseRule.js`. |
| `src/App.jsx` | Application state, event handlers, and layout composition. |
| `src/components/*.jsx` | Presentational components: uploaders, tables, previews, summaries. |
| `src/formatMoney.js` | Rupee formatting utility. |

## Data Flow Boundaries

```
CSV text ──→ csvParser.js ──→ DiscountRule[] / CartItem[]
PDF file ──→ pdfCartParser.js ──→ CartItem[]
NL text  ──→ /api/parse-rule ──→ LLM ──→ ruleValidator.js ──→ DiscountRule

DiscountRule[] + CartItem[] ──→ discountEngine.js ──→ CartSummary
```

Every input path produces the same domain objects. The discount engine is unaware of where data originated — CSV, PDF, or LLM. Adding another input format requires only a new parser that outputs `DiscountRule` or `CartItem` objects.

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 18 |
| Build tool | Vite 5 |
| Language | JavaScript (ES modules) |
| CSV parsing | PapaParse 5 |
| PDF extraction | pdfjs-dist 4 |
| LLM provider | OpenAI API (gpt-4o-mini) |
| Serverless runtime | Vercel Functions |
| Testing | Node.js built-in test runner |
