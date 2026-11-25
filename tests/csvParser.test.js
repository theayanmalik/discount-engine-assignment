import test from 'node:test'
import assert from 'node:assert/strict'
import { parseRulesCSV, parseCartCSV } from '../src/engine/csvParser.js'

const header = 'rule_id,scope,applies_to,type,value,stackable,min_cart_value'

test('parses brand, platform, and cart rules', () => {
  const csv = `${header}
RULE-01,platform,Amazon India,percentage,15,false,
RULE-02,brand,Natura Casa,flat,150,false,
RULE-04,cart,,percentage,10,false,4000`
  const { data, errors } = parseRulesCSV(csv)
  assert.deepEqual(errors, [])
  assert.equal(data.length, 3)
  assert.equal(data[0].scope, 'platform')
  assert.equal(data[0].minCartValue, null)
  assert.equal(data[1].stackable, false)
  assert.equal(data[2].appliesTo, null)
  assert.equal(data[2].minCartValue, 4000)
  assert.equal(data[2].stackable, false)
})

test('accepts yes and no as stackable values and rejects anything else', () => {
  const valid = parseRulesCSV(`${header}
RULE-09,brand,Natura Casa,percentage,5,yes,`)
  assert.equal(valid.data[0].stackable, true)

  const invalid = parseRulesCSV(`${header}
RULE-09,brand,Natura Casa,percentage,5,maybe,`)
  assert.equal(invalid.data.length, 0)
  assert.match(invalid.errors[0], /stackable must be true or false/)
})

test('reports missing fields with the CSV row number', () => {
  const { data, errors } = parseRulesCSV(`${header}
RULE-09,brand,,percentage,5,false,`)
  assert.equal(data.length, 0)
  assert.match(errors[0], /Row 2: missing fields — applies_to/)
})

test('rejects an invalid scope or discount type', () => {
  const scope = parseRulesCSV(`${header}
RULE-09,category,Natura Casa,percentage,5,false,`)
  assert.match(scope.errors[0], /scope must be/)

  const type = parseRulesCSV(`${header}
RULE-09,brand,Natura Casa,bogo,5,false,`)
  assert.match(type.errors[0], /type must be/)
})

test('rejects percentages above 100, non-positive values, and bad thresholds', () => {
  const high = parseRulesCSV(`${header}
RULE-09,brand,Natura Casa,percentage,150,false,`)
  assert.match(high.errors[0], /cannot exceed 100/)

  const zero = parseRulesCSV(`${header}
RULE-09,brand,Natura Casa,flat,0,false,`)
  assert.match(zero.errors[0], /positive number/)

  const threshold = parseRulesCSV(`${header}
RULE-09,cart,,percentage,10,false,0`)
  assert.match(threshold.errors[0], /min_cart_value must be a positive number/)

  const missingThreshold = parseRulesCSV(`${header}
RULE-09,cart,,percentage,10,false,`)
  assert.match(missingThreshold.errors[0], /missing fields — min_cart_value/)
})

test('cart rules cannot target a brand, and brand rules cannot set a threshold', () => {
  const targeted = parseRulesCSV(`${header}
RULE-09,cart,Natura Casa,percentage,10,false,4000`)
  assert.match(targeted.errors[0], /applies_to empty/)

  const extra = parseRulesCSV(`${header}
RULE-09,brand,Natura Casa,flat,50,false,4000`)
  assert.match(extra.errors[0], /only to cart rules/)
})

test('a cart flat discount is rejected', () => {
  const { data, errors } = parseRulesCSV(`${header}
RULE-09,cart,,flat,100,false,4000`)
  assert.equal(data.length, 0)
  assert.match(errors[0], /only support percentage/)
})

test('invalid rules never sit beside the valid ones that were returned', () => {
  const { data, errors } = parseRulesCSV(`${header}
RULE-01,brand,Natura Casa,percentage,10,false,
RULE-02,brand,Natura Casa,percentage,150,false,`)
  assert.equal(errors.length, 1)
  assert.deepEqual(data.map((row) => row.ruleId), ['RULE-01'])
})

test('cart CSV rejects a bad price and keeps a valid row', () => {
  const { data, errors } = parseCartCSV(`item_id,product,brand,platform,base_price
ITEM-01,Cushion Cover,Natura Casa,Amazon India,1299
ITEM-02,Vase,LivSpace Pro,Noon,free`)
  assert.equal(data.length, 1)
  assert.equal(data[0].basePrice, 1299)
  assert.match(errors[0], /Row 3: base_price/)
})
