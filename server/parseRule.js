/**
 * server/parseRule.js
 *
 * Turns a natural-language discount description into a structured rule.
 * The OpenAI API key is read only from server environment variables.
 * Model output is validated again before it can be confirmed in the UI.
 */

import { validateParseResponse } from '../src/engine/ruleValidator.js'

const DEFAULT_MODEL = 'gpt-4o-mini'
const REQUEST_TIMEOUT_MS = 25000
const MAX_DESCRIPTION = 500

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'rule', 'message'],
  properties: {
    status: { type: 'string', enum: ['parsed', 'ambiguous', 'unsupported'] },
    message: { type: 'string' },
    rule: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['scope', 'appliesTo', 'type', 'value', 'stackable', 'minCartValue'],
          properties: {
            scope: { type: 'string', enum: ['brand', 'platform', 'cart'] },
            appliesTo: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            type: { type: 'string', enum: ['percentage', 'flat'] },
            value: { anyOf: [{ type: 'number' }, { type: 'null' }] },
            stackable: { anyOf: [{ type: 'boolean' }, { type: 'null' }] },
            minCartValue: { anyOf: [{ type: 'number' }, { type: 'null' }] },
          },
        },
      ],
    },
  },
}

const SYSTEM_PROMPT = `You convert one English discount description into a single marketplace pricing rule.

Return JSON only, matching the schema. Never invent a discount amount, brand, platform, or cart threshold.

status:
- "parsed" only when every field required for that scope is explicit in the description.
- "ambiguous" when the offer type is clear but a required number or target is missing. Set rule to null.
- "unsupported" when the request is not a brand, platform, or cart discount this engine can represent. Set rule to null.

message:
- For a parsed rule, one short sentence describing it.
- For an ambiguous cart-like request with no amount or threshold, use exactly: "Please specify the discount amount or percentage and the minimum cart value required."
- Otherwise explain the specific missing or unsupported piece. Do not apologise at length.

scope:
- "brand" when a brand is named. appliesTo is that brand. minCartValue is null. type is "percentage" or "flat".
- "platform" when a storefront or marketplace is named (for example Amazon India, Flipkart, Noon). appliesTo is that platform. minCartValue is null.
- "cart" when the offer depends on the order total or applies to the whole cart. appliesTo is null. type must be "percentage". minCartValue is the rupee threshold the user stated.

value:
- A positive number. Percentages are 1 to 100. Flat values are rupees.
- "20% off" is percentage 20. "Rs.100 off" or "100 rupees" is flat 100.
- If no numeric discount is stated, status is "ambiguous" and rule is null.

stackable:
- true only if the user says the offer stacks, combines, or works with other offers.
- false if they say it does not stack, or if stacking is not mentioned.

Cart thresholds:
- Copy the stated number. "more than Rs.5,000", "above 5000", "at least 5000", and "minimum 5000" all mean minCartValue 5000.
- The engine applies the offer when the item-discounted subtotal is greater than or equal to minCartValue. Do not add or subtract 1.
- A cart offer without a threshold, or a threshold without a discount amount, is "ambiguous" with rule null.

Do not create category, product, customer, shipping, or buy-one-get-one rules.
Do not fill rule with guesses when status is not "parsed".`

function errorResult(statusCode, message) {
  return { statusCode, body: { status: 'error', message } }
}

function readDescription(body) {
  let payload = body
  if (typeof body === 'string') {
    if (body.length > 20000) return { error: 'Request is too large.', statusCode: 413 }
    try {
      payload = body.trim() ? JSON.parse(body) : {}
    } catch {
      return { error: 'Request body must be JSON.', statusCode: 400 }
    }
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { error: 'Request body must be a JSON object.', statusCode: 400 }
  }

  if (typeof payload.description !== 'string') {
    return { error: 'Describe the discount rule you want to create.', statusCode: 400 }
  }

  const description = payload.description.trim()
  if (!description) {
    return { error: 'Describe the discount rule you want to create.', statusCode: 400 }
  }
  if (description.length > MAX_DESCRIPTION) {
    return { error: 'Please keep the description under 500 characters.', statusCode: 400 }
  }

  return { description }
}

function parseModelContent(content) {
  const text = String(content ?? '').trim()
  if (!text) {
    throw new Error('empty')
  }
  const unfenced = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  return JSON.parse(unfenced)
}

function providerMessage(payload) {
  const message = payload?.error?.message
  if (typeof message !== 'string') return ''
  return message.replace(/\s+/g, ' ').slice(0, 180)
}

/**
 * Handles POST /api/parse-rule.
 * options.fetchImpl and options.env exist so tests can avoid a live model call.
 */
export async function parseRuleRequest(body, options = {}) {
  const env = options.env || process.env
  const fetchImpl = options.fetchImpl || globalThis.fetch

  const descriptionResult = readDescription(body)
  if (descriptionResult.error) {
    return errorResult(descriptionResult.statusCode, descriptionResult.error)
  }

  const apiKey = typeof env.OPENAI_API_KEY === 'string' ? env.OPENAI_API_KEY.trim() : ''
  if (!apiKey) {
    return errorResult(
      503,
      'Natural-language rules are unavailable because OPENAI_API_KEY is not configured on the server.'
    )
  }

  const model = (typeof env.OPENAI_MODEL === 'string' && env.OPENAI_MODEL.trim()) || DEFAULT_MODEL

  let response
  try {
    response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'discount_rule_parse',
            strict: true,
            schema: RESPONSE_SCHEMA,
          },
        },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: descriptionResult.description },
        ],
      }),
    })
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      return errorResult(504, 'The rule parser timed out. Please try again.')
    }
    return errorResult(502, 'The rule parser could not be reached. Please try again.')
  }

  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (response.status === 401 || response.status === 403) {
    return errorResult(502, 'The rule parser rejected the server API key. Check OPENAI_API_KEY.')
  }
  if (response.status === 429) {
    return errorResult(429, 'The rule parser is rate limited right now. Wait a moment and try again.')
  }
  if (!response.ok) {
    const detail = providerMessage(payload)
    return errorResult(
      502,
      detail
        ? `The rule parser failed: ${detail}`
        : 'The rule parser failed before it could read that description.'
    )
  }

  try {
    const content = payload?.choices?.[0]?.message?.content
    const parsed = parseModelContent(content)
    const validated = validateParseResponse(parsed)
    if (!validated.ok) {
      return {
        statusCode: 200,
        body: {
          status: validated.status || 'invalid',
          rule: null,
          message: validated.message,
        },
      }
    }
    return {
      statusCode: 200,
      body: {
        status: 'parsed',
        rule: validated.rule,
        message: validated.message,
      },
    }
  } catch {
    return errorResult(502, 'The rule parser returned a response that could not be read.')
  }
}

export async function handleParseRule(method, body, options) {
  if (method !== 'POST') {
    return errorResult(405, 'Method not allowed. Use POST.')
  }
  return parseRuleRequest(body, options)
}
