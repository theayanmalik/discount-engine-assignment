/**
 * ruleValidator.js
 *
 * Independent checks for a candidate discount rule.
 * Used for LLM output and for any rule before it becomes active.
 * This module does not trust field names or types coming from a model.
 */

const SCOPES = new Set(['brand', 'platform', 'cart'])
const TYPES = new Set(['percentage', 'flat'])

function fail(message) {
  return { ok: false, rule: null, message }
}

function isPositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/**
 * Validates a candidate rule object.
 * Returns { ok, rule, message }.
 * `rule` is a normalised DiscountRule without ruleId when ok is true.
 */
export function validateCandidateRule(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return fail('The parsed rule was malformed. Please describe the offer again.')
  }

  const scope = typeof candidate.scope === 'string' ? candidate.scope.trim().toLowerCase() : ''
  if (!SCOPES.has(scope)) {
    return fail('Scope must be brand, platform, or cart.')
  }

  const type = typeof candidate.type === 'string' ? candidate.type.trim().toLowerCase() : ''
  if (!TYPES.has(type)) {
    return fail('Discount type must be percentage or flat.')
  }

  if (scope === 'cart' && type !== 'percentage') {
    return fail('Cart offers only support a percentage discount.')
  }

  if (!isPositiveNumber(candidate.value)) {
    return fail('Please specify a discount amount or percentage greater than zero.')
  }

  if (type === 'percentage' && candidate.value > 100) {
    return fail('A percentage discount cannot exceed 100.')
  }

  if (typeof candidate.stackable !== 'boolean') {
    return fail('Stackable must be true or false.')
  }

  let appliesTo = null
  let minCartValue = null

  if (scope === 'brand' || scope === 'platform') {
    if (typeof candidate.appliesTo !== 'string' || candidate.appliesTo.trim() === '') {
      return fail(
        scope === 'brand'
          ? 'Please name the brand this offer applies to.'
          : 'Please name the platform this offer applies to.'
      )
    }
    appliesTo = candidate.appliesTo.trim()
    if (candidate.minCartValue !== null && candidate.minCartValue !== undefined) {
      return fail('Minimum cart value is only used for cart-wide offers.')
    }
  } else {
    if (candidate.appliesTo !== null && candidate.appliesTo !== undefined && String(candidate.appliesTo).trim() !== '') {
      return fail('A cart offer applies to the whole cart and cannot target a brand or platform.')
    }
    if (!isPositiveNumber(candidate.minCartValue)) {
      return fail('Please specify the discount amount or percentage and the minimum cart value required.')
    }
    minCartValue = candidate.minCartValue
  }

  return {
    ok: true,
    message: '',
    rule: {
      scope,
      appliesTo,
      type,
      value: candidate.value,
      stackable: candidate.stackable,
      minCartValue,
    },
  }
}

/**
 * Validates the full structured response from the rule parser.
 * status "parsed" still has to pass validateCandidateRule.
 */
export function validateParseResponse(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return fail('The parser returned an unreadable response. Please try again.')
  }

  const status = payload.status
  if (
    status !== 'parsed' &&
    status !== 'ambiguous' &&
    status !== 'unsupported' &&
    status !== 'invalid'
  ) {
    return fail('The parser returned an unexpected status. Please try again.')
  }

  const message = typeof payload.message === 'string' ? payload.message.trim() : ''

  if (status === 'invalid') {
    return {
      ok: false,
      rule: null,
      message: message || 'This rule could not be validated.',
      status: 'invalid',
    }
  }

  if (status === 'ambiguous' || status === 'unsupported') {
    return {
      ok: false,
      rule: null,
      message: message || 'This description needs more detail before it can become a rule.',
      status,
    }
  }

  const validated = validateCandidateRule(payload.rule)
  if (!validated.ok) {
    return { ok: false, rule: null, message: validated.message, status: 'invalid' }
  }

  return {
    ok: true,
    rule: validated.rule,
    message: message || 'Review this rule before adding it.',
    status: 'parsed',
  }
}

/**
 * Assigns the next RULE-XX id that does not collide with active rules.
 */
export function assignRuleId(existingRules, rule) {
  const used = new Set((existingRules || []).map((item) => item.ruleId))
  let max = 0
  for (const id of used) {
    const match = /^RULE-(\d+)$/.exec(id)
    if (match) max = Math.max(max, Number(match[1]))
  }

  let next = max + 1
  let ruleId = `RULE-${String(next).padStart(2, '0')}`
  while (used.has(ruleId)) {
    next += 1
    ruleId = `RULE-${String(next).padStart(2, '0')}`
  }

  return { ...rule, ruleId }
}
