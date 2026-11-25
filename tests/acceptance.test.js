import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseRulesCSV, parseCartCSV } from '../src/engine/csvParser.js'
import { calculateCartSummary } from '../src/engine/discountEngine.js'

const rulesCsv = readFileSync(new URL('../sample-data/rules.csv', import.meta.url), 'utf8')
const cartCsv = readFileSync(new URL('../sample-data/cart.csv', import.meta.url), 'utf8')

test('sample rules and cart produce the assignment totals', () => {
  const rules = parseRulesCSV(rulesCsv)
  const cart = parseCartCSV(cartCsv)
  assert.deepEqual(rules.errors, [])
  assert.deepEqual(cart.errors, [])

  const summary = calculateCartSummary(cart.data, rules.data)
  const prices = Object.fromEntries(summary.itemResults.map((item) => [item.itemId, item.finalPrice]))

  assert.deepEqual(prices, {
    'ITEM-01': 1104,
    'ITEM-02': 629,
    'ITEM-03': 509,
    'ITEM-04': 2499,
    'ITEM-05': 382,
    'ITEM-06': 809,
  })

  const itemSavings = summary.itemResults.reduce((sum, item) => sum + item.totalDiscount, 0)
  assert.equal(summary.cartSubtotal, 5932)
  assert.equal(summary.cartDiscount, 593)
  assert.equal(summary.finalCartTotal, 5339)
  assert.equal(itemSavings, 662)
  assert.deepEqual(summary.appliedCartRules, ['RULE-04'])
  assert.equal(summary.itemResults[0].reasoning, 'Platform offer: 15% off')
  assert.equal(summary.itemResults[1].reasoning, 'Brand offer: Rs.150 off + Platform offer: 10% off')
  assert.equal(summary.itemResults[3].reasoning, 'No offers available')
  assert.equal(summary.cartOffer.reasoning, 'Cart offer: 10% off — Rs.593 saved')
})
