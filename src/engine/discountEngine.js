/**
 * discountEngine.js
 *
 * Pure discount calculation logic. No UI, no side effects.
 * All functions take plain objects and return plain objects.
 *
 * Data shapes:
 *
 * DiscountRule {
 *   ruleId:       string                 — e.g. "RULE-01"
 *   scope:        "brand" | "platform" | "cart"
 *   appliesTo:    string | null          — brand/platform name; null for cart rules
 *   type:         "percentage" | "flat"
 *   value:        number                 — percentage (15 = 15%) or flat rupees
 *   stackable:    boolean
 *   minCartValue: number | null          — required for cart rules
 * }
 *
 * CartItem {
 *   itemId:    string
 *   product:   string
 *   brand:     string
 *   platform:  string
 *   basePrice: number
 * }
 *
 * DiscountResult {
 *   itemId, product, brand, platform,
 *   basePrice, finalPrice, totalDiscount,
 *   appliedRules, skippedRules, reasoning
 * }
 */

/**
 * Whole-rupee rounding. Positive halfway cases round away from zero
 * (Math.round), which matches the assignment's expected sample totals.
 */
export function roundRupees(amount) {
  if (!Number.isFinite(amount)) return 0
  return Math.round(amount)
}

/**
 * Returns true if an item-level rule applies to this cart item.
 * Cart-level rules never match an individual item.
 */
export function ruleMatchesItem(item, rule) {
  if (!rule || rule.scope === 'cart') return false
  const normalise = (s) => String(s ?? '').trim().toLowerCase()
  if (rule.scope === 'brand') {
    return normalise(item.brand) === normalise(rule.appliesTo)
  }
  if (rule.scope === 'platform') {
    return normalise(item.platform) === normalise(rule.appliesTo)
  }
  return false
}

/**
 * Rupee discount a rule gives on a given price, before the remaining-price cap.
 * Percentage discounts use the supplied price so stacking compounds correctly.
 */
export function calculateDiscountAmount(price, rule) {
  if (!rule || !Number.isFinite(price) || price <= 0) return 0
  if (rule.type === 'percentage') {
    return roundRupees((price * rule.value) / 100)
  }
  if (rule.type === 'flat') {
    return roundRupees(rule.value)
  }
  return 0
}

/**
 * Applies a discount without letting the running price go below zero.
 */
function deduct(price, rule) {
  const raw = calculateDiscountAmount(price, rule)
  const amount = Math.min(Math.max(0, raw), roundRupees(price))
  const next = roundRupees(price - amount)
  return { price: Math.max(0, next), amount }
}

function ruleToReasoning(rule) {
  const scopeLabel =
    rule.scope === 'brand' ? 'Brand' : rule.scope === 'platform' ? 'Platform' : 'Cart'
  if (rule.type === 'percentage') {
    return `${scopeLabel} offer: ${formatValue(rule.value)}% off`
  }
  if (rule.type === 'flat') {
    return `${scopeLabel} offer: Rs.${formatValue(rule.value)} off`
  }
  return `${scopeLabel} offer applied`
}

function formatValue(value) {
  if (Number.isInteger(value)) return String(value)
  return String(value)
}

/**
 * Applies brand and platform rules to a single cart item.
 * Cart-scoped rules are ignored here; see applyCartOffers.
 */
export function applyDiscounts(item, rules) {
  const itemRules = (rules || []).filter(
    (rule) => rule && (rule.scope === 'brand' || rule.scope === 'platform')
  )
  const matchingRules = itemRules.filter((rule) => ruleMatchesItem(item, rule))

  if (matchingRules.length === 0) {
    return {
      itemId: item.itemId,
      product: item.product,
      brand: item.brand,
      platform: item.platform,
      basePrice: item.basePrice,
      finalPrice: item.basePrice,
      totalDiscount: 0,
      appliedRules: [],
      skippedRules: [],
      reasoning: 'No offers available',
    }
  }

  const nonStackable = matchingRules.filter((rule) => !rule.stackable)
  const stackable = matchingRules.filter((rule) => rule.stackable)

  let winner = null
  let skipped = []

  if (nonStackable.length > 0) {
    const sorted = [...nonStackable].sort(
      (a, b) =>
        calculateDiscountAmount(item.basePrice, b) - calculateDiscountAmount(item.basePrice, a)
    )
    winner = sorted[0]
    skipped = sorted.slice(1)
  }

  let price = item.basePrice
  const appliedRules = []
  const reasoningParts = []

  if (winner) {
    const step = deduct(price, winner)
    if (step.amount > 0) {
      price = step.price
      appliedRules.push(winner.ruleId)
      reasoningParts.push(ruleToReasoning(winner))
    }
  }

  for (const rule of stackable) {
    const step = deduct(price, rule)
    if (step.amount <= 0) continue
    price = step.price
    appliedRules.push(rule.ruleId)
    reasoningParts.push(ruleToReasoning(rule))
  }

  const finalPrice = Math.max(0, roundRupees(price))

  return {
    itemId: item.itemId,
    product: item.product,
    brand: item.brand,
    platform: item.platform,
    basePrice: item.basePrice,
    finalPrice,
    totalDiscount: roundRupees(item.basePrice - finalPrice),
    appliedRules,
    skippedRules: skipped.map((rule) => rule.ruleId),
    reasoning: reasoningParts.length > 0 ? reasoningParts.join(' + ') : 'No offers available',
  }
}

/**
 * Item-level discounts for every cart line. Cart rules are not applied.
 */
export function processCart(cartItems, rules) {
  return (cartItems || []).map((item) => applyDiscounts(item, rules))
}

/**
 * Sums final item prices. This is the subtotal cart rules are judged against.
 */
export function cartTotal(results) {
  return (results || []).reduce((sum, result) => sum + result.finalPrice, 0)
}

/**
 * Cart-level offers.
 *
 * Eligibility is decided once, against the item-discounted subtotal.
 * The best eligible non-stackable rule (largest rupee saving on that
 * subtotal) is applied first. Eligible stackable rules then apply in
 * input order to the running cart total. A stackable rule can apply
 * even when no non-stackable rule qualifies. Thresholds are not
 * re-checked after the total starts to fall.
 *
 * Only percentage cart rules are applied. Flat cart rules are ignored
 * here because this assignment supports cart-level percentages.
 */
export function applyCartOffers(subtotal, rules) {
  // Compare the raw subtotal. Rounding first would turn 3999.99 into 4000
  // and incorrectly unlock a 4000 threshold.
  const base = Number.isFinite(subtotal) ? subtotal : 0
  const cartRules = (rules || []).filter(
    (rule) => rule && rule.scope === 'cart' && rule.type === 'percentage'
  )

  const eligible = cartRules.filter(
    (rule) =>
      typeof rule.minCartValue === 'number' &&
      Number.isFinite(rule.minCartValue) &&
      base >= rule.minCartValue
  )

  const nonStackable = eligible.filter((rule) => !rule.stackable)
  const stackable = eligible.filter((rule) => rule.stackable)

  let winner = null
  let skipped = []

  if (nonStackable.length > 0) {
    const sorted = [...nonStackable].sort(
      (a, b) => calculateDiscountAmount(base, b) - calculateDiscountAmount(base, a)
    )
    winner = sorted[0]
    skipped = sorted.slice(1)
  }

  let total = base
  const applied = []
  const reasoningParts = []

  const applyToRunningTotal = (rule) => {
    const raw = calculateDiscountAmount(total, rule)
    const amount = Math.min(Math.max(0, raw), Math.max(0, total))
    total = Math.max(0, total - amount)
    return amount
  }

  if (winner) {
    const amount = applyToRunningTotal(winner)
    if (amount > 0) {
      applied.push({ ...winner, amount })
      reasoningParts.push(ruleToReasoning(winner))
    }
  }

  for (const rule of stackable) {
    const amount = applyToRunningTotal(rule)
    if (amount <= 0) continue
    applied.push({ ...rule, amount })
    reasoningParts.push(ruleToReasoning(rule))
  }

  if (applied.length === 0) {
    return {
      cartDiscount: 0,
      appliedCartRules: [],
      skippedCartRules: skipped.map((rule) => rule.ruleId),
      finalCartTotal: base,
      cartOffer: null,
    }
  }

  const finalTotal = Math.max(0, roundRupees(total))
  const discount = roundRupees(base - finalTotal)

  if (discount <= 0) {
    return {
      cartDiscount: 0,
      appliedCartRules: [],
      skippedCartRules: skipped.map((rule) => rule.ruleId),
      finalCartTotal: base,
      cartOffer: null,
    }
  }

  const savedLabel = `Rs.${discount.toLocaleString('en-IN')}`
  const summary =
    reasoningParts.length === 1
      ? `${reasoningParts[0]} — ${savedLabel} saved`
      : `${reasoningParts.join(' + ')} — ${savedLabel} saved`

  return {
    cartDiscount: discount,
    appliedCartRules: applied.map((rule) => rule.ruleId),
    skippedCartRules: skipped.map((rule) => rule.ruleId),
    finalCartTotal: finalTotal,
    cartOffer: {
      ruleIds: applied.map((rule) => rule.ruleId),
      label: reasoningParts.join(' + '),
      amount: discount,
      reasoning: summary,
      rules: applied.map((rule) => ({
        ruleId: rule.ruleId,
        type: rule.type,
        value: rule.value,
        stackable: rule.stackable,
        amount: rule.amount,
      })),
    },
  }
}

/**
 * Full cart calculation: item discounts, then cart-level discounts.
 * This is the only function the UI needs for a customer-facing total.
 */
export function calculateCartSummary(cartItems, rules) {
  const itemResults = processCart(cartItems, rules)
  const cartSubtotal = cartTotal(itemResults)
  const cartLevel = applyCartOffers(cartSubtotal, rules)

  return {
    itemResults,
    cartSubtotal,
    cartDiscount: cartLevel.cartDiscount,
    appliedCartRules: cartLevel.appliedCartRules,
    skippedCartRules: cartLevel.skippedCartRules,
    finalCartTotal: cartLevel.finalCartTotal,
    cartOffer: cartLevel.cartOffer,
  }
}
