/**
 * csvParser.js
 *
 * Converts raw CSV text into the typed objects the discount engine expects.
 * Uses papaparse for reliable CSV parsing, then validates every row.
 * Invalid rows are reported and never included in `data`.
 *
 * rules.csv columns:
 *   rule_id, scope, applies_to, type, value, stackable, min_cart_value
 *
 * cart.csv columns:
 *   item_id, product, brand, platform, base_price
 */

import Papa from 'papaparse'

const RULE_SCOPES = new Set(['brand', 'platform', 'cart'])
const DISCOUNT_TYPES = new Set(['percentage', 'flat'])
const STACKABLE_TRUE = new Set(['true', 'yes', '1'])
const STACKABLE_FALSE = new Set(['false', 'no', '0'])

function parseCsv(csvText) {
  return Papa.parse(String(csvText ?? '').replace(/^\uFEFF/, '').trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase().replace(/\s+/g, '_'),
  })
}

function cell(row, key) {
  const value = row[key]
  if (value === undefined || value === null) return ''
  return String(value).trim()
}

/**
 * Parses rules.csv into DiscountRule objects.
 * Returns { data, errors }.
 */
export function parseRulesCSV(csvText) {
  const { data: rows, errors: parseErrors } = parseCsv(csvText)

  if (parseErrors.length > 0) {
    return {
      data: [],
      errors: parseErrors.map((error) => `CSV parse error: ${error.message}`),
    }
  }

  const data = []
  const errors = []

  rows.forEach((row, index) => {
    const rowNum = index + 2
    const rule = parseRuleRow(row, rowNum, errors)
    if (rule) data.push(rule)
  })

  return { data, errors }
}

function parseRuleRow(row, rowNum, errors) {
  const missing = []
  if (!cell(row, 'rule_id')) missing.push('rule_id')
  if (!cell(row, 'scope')) missing.push('scope')
  if (!cell(row, 'type')) missing.push('type')
  if (!cell(row, 'value')) missing.push('value')
  if (!cell(row, 'stackable')) missing.push('stackable')

  const scopeRaw = cell(row, 'scope')
  const scope = scopeRaw.toLowerCase()
  const appliesToRaw = cell(row, 'applies_to')
  const minRaw = cell(row, 'min_cart_value')

  if (scope !== 'cart' && !appliesToRaw) missing.push('applies_to')
  if (scope === 'cart' && !minRaw) missing.push('min_cart_value')

  if (missing.length > 0) {
    errors.push(`Row ${rowNum}: missing fields — ${missing.join(', ')}`)
    return null
  }

  if (!RULE_SCOPES.has(scope)) {
    errors.push(`Row ${rowNum}: scope must be "brand", "platform", or "cart", got "${scopeRaw}"`)
    return null
  }

  const typeRaw = cell(row, 'type')
  const type = typeRaw.toLowerCase()
  if (!DISCOUNT_TYPES.has(type)) {
    errors.push(`Row ${rowNum}: type must be "percentage" or "flat", got "${typeRaw}"`)
    return null
  }

  if (scope === 'cart' && type !== 'percentage') {
    errors.push(`Row ${rowNum}: cart rules only support percentage discounts, got "${typeRaw}"`)
    return null
  }

  const value = Number(cell(row, 'value'))
  if (!Number.isFinite(value) || value <= 0) {
    errors.push(`Row ${rowNum}: value must be a positive number, got "${cell(row, 'value')}"`)
    return null
  }
  if (type === 'percentage' && value > 100) {
    errors.push(`Row ${rowNum}: percentage value cannot exceed 100, got "${cell(row, 'value')}"`)
    return null
  }

  const stackableRaw = cell(row, 'stackable').toLowerCase()
  let stackable
  if (STACKABLE_TRUE.has(stackableRaw)) stackable = true
  else if (STACKABLE_FALSE.has(stackableRaw)) stackable = false
  else {
    errors.push(
      `Row ${rowNum}: stackable must be true or false, got "${cell(row, 'stackable')}"`
    )
    return null
  }

  let appliesTo = appliesToRaw || null
  let minCartValue = null

  if (scope === 'cart') {
    if (appliesToRaw) {
      errors.push(`Row ${rowNum}: cart rules must leave applies_to empty, got "${appliesToRaw}"`)
      return null
    }
    appliesTo = null
    const threshold = Number(minRaw)
    if (!Number.isFinite(threshold) || threshold <= 0) {
      errors.push(`Row ${rowNum}: min_cart_value must be a positive number, got "${minRaw}"`)
      return null
    }
    minCartValue = threshold
  } else if (minRaw) {
    errors.push(`Row ${rowNum}: min_cart_value applies only to cart rules`)
    return null
  }

  return {
    ruleId: cell(row, 'rule_id'),
    scope,
    appliesTo,
    type,
    value,
    stackable,
    minCartValue,
  }
}

/**
 * Parses cart.csv into CartItem objects.
 * Returns { data, errors }.
 */
export function parseCartCSV(csvText) {
  const { data: rows, errors: parseErrors } = parseCsv(csvText)

  if (parseErrors.length > 0) {
    return {
      data: [],
      errors: parseErrors.map((error) => `CSV parse error: ${error.message}`),
    }
  }

  const data = []
  const errors = []

  rows.forEach((row, index) => {
    const rowNum = index + 2
    const missing = []

    if (!cell(row, 'item_id')) missing.push('item_id')
    if (!cell(row, 'product')) missing.push('product')
    if (!cell(row, 'brand')) missing.push('brand')
    if (!cell(row, 'platform')) missing.push('platform')
    if (!cell(row, 'base_price')) missing.push('base_price')

    if (missing.length > 0) {
      errors.push(`Row ${rowNum}: missing fields — ${missing.join(', ')}`)
      return
    }

    const basePrice = Number(cell(row, 'base_price'))
    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      errors.push(`Row ${rowNum}: base_price must be a positive number, got "${cell(row, 'base_price')}"`)
      return
    }

    data.push({
      itemId: cell(row, 'item_id'),
      product: cell(row, 'product'),
      brand: cell(row, 'brand'),
      platform: cell(row, 'platform'),
      basePrice: Math.round(basePrice),
    })
  })

  return { data, errors }
}
