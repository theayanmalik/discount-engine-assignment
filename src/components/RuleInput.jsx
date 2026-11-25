const EXAMPLES = [
  '20% off for Natura Casa brand, stackable with other offers',
  'Rs.100 flat discount on all Flipkart items',
  '10% off if cart value is more than Rs.5,000',
]

export default function RuleInput({
  value,
  onChange,
  onParse,
  onExample,
  loading,
  error,
}) {
  const trimmed = value.trim()

  return (
    <div>
      <label htmlFor="rule-description" className="field-label">
        Describe a discount rule
      </label>
      <textarea
        id="rule-description"
        className="rule-text"
        rows={3}
        maxLength={500}
        placeholder="Example: 20% off for Natura Casa brand, stackable with other offers"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="example-row" aria-label="Example descriptions">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            className="chip"
            onClick={() => onExample(example)}
            disabled={loading}
          >
            {example}
          </button>
        ))}
      </div>
      <div className="action-row">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onParse}
          disabled={loading || trimmed.length === 0}
        >
          {loading ? 'Parsing rule…' : 'Parse rule'}
        </button>
        <span className="hint">{trimmed.length}/500</span>
      </div>
      {loading ? <div className="loading-line" role="status">Asking the parser to structure this rule…</div> : null}
      {error ? (
        <div className="banner banner-error" role="alert">
          <div className="banner-line">{error}</div>
        </div>
      ) : null}
    </div>
  )
}
