import test from 'node:test'
import assert from 'node:assert/strict'
import { assignRuleId, validateCandidateRule, validateParseResponse } from '../src/engine/ruleValidator.js'

test('validates the brand percentage example', () => {
  const result = validateCandidateRule({
    scope: 'brand',
    appliesTo: 'Natura Casa',
    type: 'percentage',
    value: 20,
    stackable: true,
    minCartValue: null,
  })
  assert.equal(result.ok, true)
  assert.equal(result.rule.appliesTo, 'Natura Casa')
  assert.equal(result.rule.stackable, true)
  assert.equal(result.rule.minCartValue, null)
})

test('validates the platform flat example', () => {
  const result = validateCandidateRule({
    scope: 'platform',
    appliesTo: 'Flipkart',
    type: 'flat',
    value: 100,
    stackable: false,
    minCartValue: null,
  })
  assert.equal(result.ok, true)
  assert.equal(result.rule.value, 100)
})

test('validates the cart percentage example', () => {
  const result = validateCandidateRule({
    scope: 'cart',
    appliesTo: null,
    type: 'percentage',
    value: 10,
    stackable: false,
    minCartValue: 5000,
  })
  assert.equal(result.ok, true)
  assert.equal(result.rule.minCartValue, 5000)
  assert.equal(result.rule.appliesTo, null)
})

test('rejects a missing amount, missing threshold, bad scope, and bad percentage', () => {
  const missingAmount = validateCandidateRule({
    scope: 'brand',
    appliesTo: 'Natura Casa',
    type: 'percentage',
    value: null,
    stackable: false,
    minCartValue: null,
  })
  assert.equal(missingAmount.ok, false)

  const missingThreshold = validateCandidateRule({
    scope: 'cart',
    appliesTo: null,
    type: 'percentage',
    value: 10,
    stackable: false,
    minCartValue: null,
  })
  assert.match(missingThreshold.message, /minimum cart value/)

  const badScope = validateCandidateRule({
    scope: 'category',
    appliesTo: 'Decor',
    type: 'percentage',
    value: 10,
    stackable: false,
    minCartValue: null,
  })
  assert.match(badScope.message, /Scope must be/)

  const high = validateCandidateRule({
    scope: 'brand',
    appliesTo: 'Natura Casa',
    type: 'percentage',
    value: 120,
    stackable: false,
    minCartValue: null,
  })
  assert.match(high.message, /cannot exceed 100/)
})

test('rejects a malformed response and a non-boolean stackable flag', () => {
  const malformed = validateParseResponse(null)
  assert.equal(malformed.ok, false)

  const textFlag = validateCandidateRule({
    scope: 'brand',
    appliesTo: 'Natura Casa',
    type: 'percentage',
    value: 10,
    stackable: 'true',
    minCartValue: null,
  })
  assert.match(textFlag.message, /Stackable must be true or false/)

  const broken = validateParseResponse({ status: 'parsed', rule: { scope: 'brand' }, message: '' })
  assert.equal(broken.ok, false)
})

test('ambiguous and unsupported parser statuses never yield a rule', () => {
  const ambiguous = validateParseResponse({
    status: 'ambiguous',
    rule: null,
    message: 'Please specify the discount amount or percentage and the minimum cart value required.',
  })
  assert.equal(ambiguous.ok, false)
  assert.equal(ambiguous.rule, null)
  assert.match(ambiguous.message, /minimum cart value/)
})

test('assigns the next numeric rule id', () => {
  const rule = assignRuleId(
    [{ ruleId: 'RULE-04' }, { ruleId: 'RULE-02' }],
    { scope: 'brand', appliesTo: 'Natura Casa', type: 'percentage', value: 5, stackable: false, minCartValue: null }
  )
  assert.equal(rule.ruleId, 'RULE-05')
})
