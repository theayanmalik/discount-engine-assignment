import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyDiscounts,
  applyCartOffers,
  calculateCartSummary,
  calculateDiscountAmount,
} from '../src/engine/discountEngine.js'

const item = (overrides) => ({
  itemId: 'ITEM-01',
  product: 'Cushion Cover',
  brand: 'Natura Casa',
  platform: 'Amazon India',
  basePrice: 1299,
  ...overrides,
})

const rule = (overrides) => ({
  ruleId: 'RULE-01',
  scope: 'brand',
  appliesTo: 'Natura Casa',
  type: 'percentage',
  value: 10,
  stackable: false,
  minCartValue: null,
  ...overrides,
})

test('no matching offer keeps the base price', () => {
  const result = applyDiscounts(item({ brand: 'Other', platform: 'Noon' }), [
    rule({ scope: 'platform', appliesTo: 'Amazon India' }),
  ])
  assert.equal(result.finalPrice, result.basePrice)
  assert.equal(result.totalDiscount, 0)
  assert.deepEqual(result.appliedRules, [])
  assert.equal(result.reasoning, 'No offers available')
})

test('brand-only flat discount', () => {
  const result = applyDiscounts(item(), [
    rule({ ruleId: 'RULE-02', type: 'flat', value: 150 }),
  ])
  assert.equal(result.finalPrice, 1149)
  assert.equal(result.totalDiscount, 150)
  assert.deepEqual(result.appliedRules, ['RULE-02'])
  assert.equal(result.reasoning, 'Brand offer: Rs.150 off')
})

test('platform-only percentage discount uses whole-rupee rounding', () => {
  const result = applyDiscounts(item({ basePrice: 449, brand: 'Nordic Basics' }), [
    rule({ scope: 'platform', appliesTo: 'Amazon India', value: 15 }),
  ])
  assert.equal(calculateDiscountAmount(449, rule({ value: 15, scope: 'platform' })), 67)
  assert.equal(result.finalPrice, 382)
  assert.equal(result.reasoning, 'Platform offer: 15% off')
})

test('two non-stackable rules: the larger rupee saving wins', () => {
  const result = applyDiscounts(item(), [
    rule({ ruleId: 'RULE-02', type: 'flat', value: 150 }),
    rule({ ruleId: 'RULE-01', scope: 'platform', appliesTo: 'Amazon India', value: 15 }),
  ])
  assert.equal(result.finalPrice, 1104)
  assert.deepEqual(result.appliedRules, ['RULE-01'])
  assert.deepEqual(result.skippedRules, ['RULE-02'])
  assert.equal(result.reasoning, 'Platform offer: 15% off')
})

test('equal non-stackable savings keep the earlier rule', () => {
  const result = applyDiscounts(item({ basePrice: 1000 }), [
    rule({ ruleId: 'RULE-A', type: 'flat', value: 100 }),
    rule({ ruleId: 'RULE-B', scope: 'platform', appliesTo: 'Amazon India', type: 'flat', value: 100 }),
  ])
  assert.deepEqual(result.appliedRules, ['RULE-A'])
  assert.deepEqual(result.skippedRules, ['RULE-B'])
})

test('a stackable rule applies alone when nothing else matches', () => {
  const result = applyDiscounts(item({ basePrice: 899, brand: 'Nordic Basics', platform: 'Flipkart' }), [
    rule({ ruleId: 'RULE-03', scope: 'platform', appliesTo: 'Flipkart', value: 10, stackable: true }),
  ])
  assert.equal(result.finalPrice, 809)
  assert.deepEqual(result.appliedRules, ['RULE-03'])
})

test('stackable percentage is calculated on the price after the winning offer', () => {
  const result = applyDiscounts(item({ basePrice: 849, platform: 'Flipkart' }), [
    rule({ ruleId: 'RULE-02', type: 'flat', value: 150 }),
    rule({ ruleId: 'RULE-03', scope: 'platform', appliesTo: 'Flipkart', value: 10, stackable: true }),
  ])
  assert.equal(result.finalPrice, 629)
  assert.deepEqual(result.appliedRules, ['RULE-02', 'RULE-03'])
  assert.equal(result.reasoning, 'Brand offer: Rs.150 off + Platform offer: 10% off')
})

test('multiple stackable rules apply in input order on the running price', () => {
  const result = applyDiscounts(item({ basePrice: 1000 }), [
    rule({ ruleId: 'RULE-A', value: 10, stackable: true }),
    rule({ ruleId: 'RULE-B', scope: 'platform', appliesTo: 'Amazon India', value: 10, stackable: true }),
  ])
  assert.equal(result.finalPrice, 810)
  assert.deepEqual(result.appliedRules, ['RULE-A', 'RULE-B'])
})

test('a discount cannot push the item price below zero', () => {
  const result = applyDiscounts(item({ basePrice: 100 }), [
    rule({ type: 'flat', value: 250 }),
  ])
  assert.equal(result.finalPrice, 0)
  assert.equal(result.totalDiscount, 100)
})

test('cart rules are not copied onto item discounts', () => {
  const summary = calculateCartSummary(
    [item({ basePrice: 1000, brand: 'Other', platform: 'Noon' })],
    [rule({ ruleId: 'RULE-04', scope: 'cart', appliesTo: null, value: 10, minCartValue: 100 })]
  )
  assert.equal(summary.itemResults[0].finalPrice, 1000)
  assert.equal(summary.itemResults[0].totalDiscount, 0)
  assert.equal(summary.cartDiscount, 100)
  assert.equal(summary.finalCartTotal, 900)
})

test('cart offer is withheld below the threshold, including 3999.99', () => {
  const cartRule = rule({ ruleId: 'RULE-04', scope: 'cart', appliesTo: null, value: 10, minCartValue: 4000 })
  const below = applyCartOffers(3999.99, [cartRule])
  assert.equal(below.cartOffer, null)
  assert.equal(below.cartDiscount, 0)
  assert.equal(below.finalCartTotal, 3999.99)
})

test('cart offer applies at the exact threshold', () => {
  const result = applyCartOffers(4000, [
    rule({ ruleId: 'RULE-04', scope: 'cart', appliesTo: null, value: 10, minCartValue: 4000 }),
  ])
  assert.equal(result.cartDiscount, 400)
  assert.equal(result.finalCartTotal, 3600)
  assert.deepEqual(result.appliedCartRules, ['RULE-04'])
})

test('cart percentage savings and final total use whole rupees', () => {
  const result = applyCartOffers(5932, [
    rule({ ruleId: 'RULE-04', scope: 'cart', appliesTo: null, value: 10, minCartValue: 4000 }),
  ])
  assert.equal(result.cartDiscount, 593)
  assert.equal(result.finalCartTotal, 5339)
  assert.equal(result.cartOffer.reasoning, 'Cart offer: 10% off — Rs.593 saved')
})

test('no cart rule means no cart offer', () => {
  const result = applyCartOffers(5932, [rule()])
  assert.equal(result.cartOffer, null)
  assert.equal(result.finalCartTotal, 5932)
})

test('the larger eligible non-stackable cart rule wins', () => {
  const result = applyCartOffers(5000, [
    rule({ ruleId: 'RULE-10', scope: 'cart', appliesTo: null, value: 10, minCartValue: 1000 }),
    rule({ ruleId: 'RULE-20', scope: 'cart', appliesTo: null, value: 20, minCartValue: 1000 }),
  ])
  assert.deepEqual(result.appliedCartRules, ['RULE-20'])
  assert.deepEqual(result.skippedCartRules, ['RULE-10'])
  assert.equal(result.finalCartTotal, 4000)
})

test('an eligible stackable cart rule still applies when no non-stackable rule qualifies', () => {
  const result = applyCartOffers(5000, [
    rule({ ruleId: 'RULE-LOW', scope: 'cart', appliesTo: null, value: 50, minCartValue: 9000 }),
    rule({ ruleId: 'RULE-STACK', scope: 'cart', appliesTo: null, value: 10, stackable: true, minCartValue: 4000 }),
  ])
  assert.deepEqual(result.appliedCartRules, ['RULE-STACK'])
  assert.equal(result.finalCartTotal, 4500)
})

test('stackable cart rules stay eligible against the original subtotal', () => {
  const result = applyCartOffers(5000, [
    rule({ ruleId: 'RULE-HALF', scope: 'cart', appliesTo: null, value: 50, minCartValue: 4000 }),
    rule({ ruleId: 'RULE-STACK', scope: 'cart', appliesTo: null, value: 10, stackable: true, minCartValue: 4000 }),
  ])
  assert.deepEqual(result.appliedCartRules, ['RULE-HALF', 'RULE-STACK'])
  assert.equal(result.cartDiscount, 2750)
  assert.equal(result.finalCartTotal, 2250)
})

test('cart subtotal is the sum of item prices after item discounts', () => {
  const summary = calculateCartSummary(
    [
      item({ itemId: 'A', basePrice: 1299 }),
      item({ itemId: 'B', basePrice: 849, platform: 'Flipkart' }),
    ],
    [
      rule({ ruleId: 'RULE-01', scope: 'platform', appliesTo: 'Amazon India', value: 15 }),
      rule({ ruleId: 'RULE-02', type: 'flat', value: 150 }),
      rule({ ruleId: 'RULE-03', scope: 'platform', appliesTo: 'Flipkart', value: 10, stackable: true }),
      rule({ ruleId: 'RULE-04', scope: 'cart', appliesTo: null, value: 10, minCartValue: 4000 }),
    ]
  )
  assert.equal(summary.itemResults[0].finalPrice, 1104)
  assert.equal(summary.itemResults[1].finalPrice, 629)
  assert.equal(summary.cartSubtotal, 1733)
  assert.equal(summary.cartOffer, null)
  assert.equal(summary.finalCartTotal, 1733)
})
