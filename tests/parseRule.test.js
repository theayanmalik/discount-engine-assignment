import test from 'node:test'
import assert from 'node:assert/strict'
import { handleParseRule, parseRuleRequest } from '../server/parseRule.js'

const env = { OPENAI_API_KEY: 'sk-test', OPENAI_MODEL: 'gpt-4o-mini' }

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

function modelFetch(content, status = 200) {
  return async () => jsonResponse(status, {
    choices: [{ message: { content: JSON.stringify(content) } }],
  })
}

test('missing API key fails before any model call', async () => {
  let called = false
  const result = await parseRuleRequest(
    { description: '10% off Natura Casa' },
    { env: {}, fetchImpl: async () => { called = true } }
  )
  assert.equal(called, false)
  assert.equal(result.statusCode, 503)
  assert.match(result.body.message, /OPENAI_API_KEY/)
})

test('invalid requests are rejected without a model call', async () => {
  let called = false
  const fetchImpl = async () => { called = true }
  const empty = await parseRuleRequest({ description: '   ' }, { env, fetchImpl })
  const huge = await parseRuleRequest({ description: 'a'.repeat(501) }, { env, fetchImpl })
  const junk = await parseRuleRequest('not-json', { env, fetchImpl })
  const wrongMethod = await handleParseRule('GET', { description: '10% off' }, { env, fetchImpl })

  assert.equal(called, false)
  assert.equal(empty.statusCode, 400)
  assert.equal(huge.statusCode, 400)
  assert.equal(junk.statusCode, 400)
  assert.equal(wrongMethod.statusCode, 405)
})

test('a parsed model payload is validated before it is returned', async () => {
  const result = await parseRuleRequest(
    { description: '20% off for Natura Casa brand, stackable with other offers' },
    {
      env,
      fetchImpl: modelFetch({
        status: 'parsed',
        message: '20% off Natura Casa, stackable.',
        rule: {
          scope: 'brand',
          appliesTo: 'Natura Casa',
          type: 'percentage',
          value: 20,
          stackable: true,
          minCartValue: null,
        },
      }),
    }
  )
  assert.equal(result.statusCode, 200)
  assert.equal(result.body.status, 'parsed')
  assert.equal(result.body.rule.appliesTo, 'Natura Casa')
  assert.equal(result.body.rule.stackable, true)
})

test('an ambiguous model response is returned without a rule', async () => {
  const result = await parseRuleRequest(
    { description: 'Give a discount for big orders' },
    {
      env,
      fetchImpl: modelFetch({
        status: 'ambiguous',
        rule: null,
        message: 'Please specify the discount amount or percentage and the minimum cart value required.',
      }),
    }
  )
  assert.equal(result.statusCode, 200)
  assert.equal(result.body.status, 'ambiguous')
  assert.equal(result.body.rule, null)
  assert.match(result.body.message, /minimum cart value/)
})

test('a parsed model rule that fails validation does not come back as parsed', async () => {
  const result = await parseRuleRequest(
    { description: '1000% off everything' },
    {
      env,
      fetchImpl: modelFetch({
        status: 'parsed',
        message: 'Parsed.',
        rule: {
          scope: 'cart',
          appliesTo: null,
          type: 'percentage',
          value: 1000,
          stackable: false,
          minCartValue: 1,
        },
      }),
    }
  )
  assert.equal(result.statusCode, 200)
  assert.equal(result.body.status, 'invalid')
  assert.equal(result.body.rule, null)
  assert.match(result.body.message, /cannot exceed 100/)
})

test('rate limits and unreadable model output become client-safe errors', async () => {
  const limited = await parseRuleRequest(
    { description: '10% off Flipkart items' },
    { env, fetchImpl: async () => jsonResponse(429, { error: { message: 'slow down' } }) }
  )
  assert.equal(limited.statusCode, 429)
  assert.equal(limited.body.status, 'error')

  const garbled = await parseRuleRequest(
    { description: '10% off Flipkart items' },
    { env, fetchImpl: async () => jsonResponse(200, { choices: [{ message: { content: 'not-json' } }] }) }
  )
  assert.equal(garbled.statusCode, 502)
  assert.doesNotMatch(garbled.body.message, /not-json|stack/)
})
