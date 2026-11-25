import { formatRupees } from '../formatMoney.js'

function labelScope(scope) {
  if (scope === 'brand') return 'Brand'
  if (scope === 'platform') return 'Platform'
  return 'Cart'
}

function labelType(type) {
  return type === 'percentage' ? 'Percentage' : 'Flat'
}

function labelValue(rule) {
  return rule.type === 'percentage' ? `${rule.value}%` : formatRupees(rule.value)
}

export default function RuleConfirmation({ rule, onConfirm, onDiscard }) {
  if (!rule) return null

  const rows = [
    ['Rule scope', labelScope(rule.scope)],
    ['Applies to', rule.scope === 'cart' ? 'Entire cart' : rule.appliesTo],
    ['Discount type', labelType(rule.type)],
    ['Discount value', labelValue(rule)],
    ['Stackable', rule.stackable ? 'Yes' : 'No'],
    ['Minimum cart value', rule.minCartValue == null ? 'Not applicable' : formatRupees(rule.minCartValue)],
  ]

  return (
    <div className="preview" aria-live="polite">
      <div className="preview-kicker">Confirm before this rule goes live</div>
      <p className="preview-copy">
        Nothing is added to the active rules until you confirm. Discard leaves the current cart and prices unchanged.
      </p>
      <dl className="preview-grid">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="action-row">
        <button type="button" className="btn btn-primary" onClick={onConfirm}>
          Confirm & add rule
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDiscard}>
          Discard
        </button>
      </div>
    </div>
  )
}
