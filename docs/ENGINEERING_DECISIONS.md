# Engineering Decisions — Opptra Discount Engine

This document records the key design and implementation tradeoffs.

---

## 1. Why the existing discount engine was extended instead of replaced

The starter engine already had correct item-level discount selection (non-stackable winner + stackable chaining). Replacing it would risk breaking verified behaviour and would add no value. Instead, cart-level logic was added as a separate function (`applyCartOffers`) that takes the item-discounted subtotal as input, keeping the existing `applyDiscounts` and `processCart` functions unchanged.

## 2. Why cart discounts are calculated after item discounts

The assignment requires cart-level eligibility to be judged against the subtotal **after** brand and platform offers. This matches real-world e-commerce behaviour: a "10% off orders over Rs.4,000" offer makes sense only when the retailer knows the actual item prices the customer will pay. `calculateCartSummary` enforces this sequence.

## 3. How competing non-stackable cart offers are handled

When multiple non-stackable cart rules are eligible, the one producing the **largest rupee saving** on the item-discounted subtotal wins. This is consistent with item-level non-stackable selection. Eligible stackable cart rules then apply sequentially to the running total. Eligibility thresholds are evaluated once against the original subtotal so that one discount cannot disqualify another by reducing the total mid-calculation.

## 4. How rounding is handled

All rupee amounts are rounded to whole numbers using `Math.round()`. This matches the assignment's expected sample output (e.g., 15% of 1299 = 194.85 → 195 discount → 1104 final price). Rounding is applied after each discount step rather than once at the end, which keeps intermediate prices deterministic and prevents floating-point drift.

## 5. Why LLM-generated rules require independent validation

An LLM can produce structurally valid JSON that violates business rules (e.g., a percentage above 100, a cart rule without a threshold). `ruleValidator.js` runs the same validation regardless of whether the data came from the LLM, a CSV, or any future source. This is defence in depth: even with a strict JSON schema in the OpenAI request, the validator catches edge cases the model might produce.

## 6. Why the user must confirm a rule before it becomes active

A confirmed rule permanently changes the active pricing. Requiring explicit user confirmation prevents:
- Accidental activation from a misunderstood description.
- Silent price changes that the user did not review.
- Double submission from rapid clicks (the preview is consumed on confirmation).

The confirmation preview shows every parsed field so the user can verify intent before the rule affects prices.

## 7. Why API secrets are kept server-side

The `OPENAI_API_KEY` is read only inside `server/parseRule.js` and the Vercel function. It is never exposed through a `VITE_` environment variable or included in the frontend bundle. If the key were in the browser, any user could extract it from DevTools and consume the account's API quota or use it for unrelated requests. The Vite config loads `.env.local` variables into `process.env` only on the server side during development.

## 8. How malformed PDFs are handled

The PDF parser uses an all-or-nothing strategy: if any product row is malformed (missing column, invalid price), the entire extraction fails and the existing cart is preserved. This prevents a half-parsed PDF from silently replacing valid cart data with an incomplete dataset. The user receives specific error messages identifying which rows failed and why.

## 9. Why unsuccessful PDF uploads preserve the existing cart

`replaceCartIfValid` returns the original cart items when extraction fails. This avoids a destructive workflow where an accidental bad upload wipes the user's work. The user can retry with a corrected file without having to re-upload the previous cart CSV.

## 10. Why scanned / image-only PDFs are not supported without OCR

The assignment specifies a text-based PDF. PDF.js extracts positioned text elements; it cannot read pixels from scanned documents. Supporting scanned PDFs would require an OCR library (Tesseract.js), which adds ~5 MB to the bundle and significant processing time. For a focused prototype, this complexity was deliberately excluded. The error message explains the requirement clearly.

## 11. Why no database or persistence layer was introduced

The assignment specifies in-memory state. Adding a database would introduce connection management, schema migrations, and deployment complexity without clear benefit for a demonstration prototype. All state lives in React's `useState` hooks and is recalculated on demand.

## 12. Cart threshold boundary behaviour

The engine uses `subtotal >= minCartValue` (greater than or equal). The comparison is performed on the raw subtotal **before** rounding, so a subtotal of Rs.3,999.99 does not unlock a Rs.4,000 threshold (3999.99 < 4000). This prevents rounding artefacts from incorrectly qualifying or disqualifying a cart offer. The boundary is explicitly tested.

## 13. PDF column detection via coordinate anchoring

Rather than splitting text by whitespace (which fails when product names or brands contain spaces), the parser identifies column positions from the header row's x-coordinates and assigns each text element to the nearest column. This handles multi-word fields like "Amazon India" and "Natura Casa" reliably.

## 14. Local development uses a Vite plugin instead of a separate server

The LLM endpoint runs as a Vite dev server middleware (`localParseRulePlugin`), so `npm run dev` is the only command needed locally. In production, the same handler runs as a Vercel serverless function. This avoids requiring two terminal windows or a process manager during development.
