/**
 * App.jsx
 *
 * Customer-facing discount workspace.
 * CSV, PDF, and confirmed natural-language rules all become the same
 * CartItem and DiscountRule objects the engine already understands.
 */

import { useMemo, useRef, useState } from 'react'
import CsvUploader from './components/CsvUploader.jsx'
import PdfUploader from './components/PdfUploader.jsx'
import DataTable from './components/DataTable.jsx'
import ErrorBanner from './components/ErrorBanner.jsx'
import Notice from './components/Notice.jsx'
import RuleInput from './components/RuleInput.jsx'
import RuleConfirmation from './components/RuleConfirmation.jsx'
import ResultsTable from './components/ResultsTable.jsx'
import CartSummary from './components/CartSummary.jsx'
import { parseRulesCSV, parseCartCSV } from './engine/csvParser.js'
import { parsePdfCart, replaceCartIfValid } from './engine/pdfCartParser.js'
import { calculateCartSummary } from './engine/discountEngine.js'
import { assignRuleId, validateCandidateRule, validateParseResponse } from './engine/ruleValidator.js'
import { formatRupees } from './formatMoney.js'
import sampleRulesCsv from '../sample-data/rules.csv?raw'
import sampleCartCsv from '../sample-data/cart.csv?raw'

const RULES_COLUMNS = [
  { key: 'ruleId', label: 'Rule ID' },
  {
    key: 'scope',
    label: 'Scope',
    render: (value) => <span className={`pill pill-${value}`}>{value}</span>,
  },
  {
    key: 'appliesTo',
    label: 'Applies To',
    render: (value, row) => (row.scope === 'cart' ? 'Entire cart' : value),
  },
  {
    key: 'type',
    label: 'Type',
    render: (value) => value.charAt(0).toUpperCase() + value.slice(1),
  },
  {
    key: 'value',
    label: 'Value',
    render: (value, row) => (row.type === 'percentage' ? `${value}% off` : `${formatRupees(value)} off`),
  },
  { key: 'stackable', label: 'Stackable', render: (value) => (value ? 'Yes' : 'No') },
  {
    key: 'minCartValue',
    label: 'Minimum Cart Value',
    render: (value) => (value == null ? '—' : formatRupees(value)),
  },
]

const CART_COLUMNS = [
  { key: 'itemId', label: 'Item' },
  { key: 'product', label: 'Product' },
  { key: 'brand', label: 'Brand' },
  { key: 'platform', label: 'Platform' },
  { key: 'basePrice', label: 'Base Price', render: (value) => formatRupees(value) },
]

export default function App() {
  const [rules, setRules] = useState([])
  const [rulesErrors, setRulesErrors] = useState([])
  const [rulesFileName, setRulesFileName] = useState('')
  const [rulesNotice, setRulesNotice] = useState('')

  const [cartItems, setCartItems] = useState([])
  const [cartErrors, setCartErrors] = useState([])
  const [cartFileName, setCartFileName] = useState('')
  const [cartSource, setCartSource] = useState('')
  const [cartNotice, setCartNotice] = useState('')

  const [pdfBusy, setPdfBusy] = useState(false)
  const [showResults, setShowResults] = useState(false)

  const [description, setDescription] = useState('')
  const [parseLoading, setParseLoading] = useState(false)
  const [parseError, setParseError] = useState('')
  const [preview, setPreview] = useState(null)
  const [ruleNotice, setRuleNotice] = useState('')
  const confirmedPreview = useRef(null)

  const summary = useMemo(() => {
    if (!showResults || cartItems.length === 0) return null
    return calculateCartSummary(cartItems, rules)
  }, [showResults, cartItems, rules])

  function handleRulesLoad(csvText, fileName) {
    const { data, errors } = parseRulesCSV(csvText)
    setRulesErrors(errors)
    if (data.length === 0) {
      setRulesNotice('')
      return
    }
    setRules(data)
    setRulesFileName(fileName)
    setRulesNotice(
      errors.length
        ? `${data.length} valid rule${data.length === 1 ? '' : 's'} loaded. Invalid rows were left out.`
        : `${data.length} rule${data.length === 1 ? '' : 's'} loaded from ${fileName}.`
    )
  }

  function handleCartLoad(csvText, fileName) {
    const { data, errors } = parseCartCSV(csvText)
    setCartErrors(errors)
    if (data.length === 0) {
      setCartNotice('')
      return
    }
    setCartItems(data)
    setCartFileName(fileName)
    setCartSource('csv')
    setCartNotice(
      errors.length
        ? `${data.length} valid product${data.length === 1 ? '' : 's'} loaded. Invalid rows were left out.`
        : `${data.length} product${data.length === 1 ? '' : 's'} loaded from ${fileName}.`
    )
  }

  function loadSample() {
    handleRulesLoad(sampleRulesCsv, 'rules.csv')
    handleCartLoad(sampleCartCsv, 'cart.csv')
    setShowResults(true)
    setRuleNotice('')
  }

  async function handlePdf(file) {
    setPdfBusy(true)
    setCartErrors([])
    try {
      const parsed = await parsePdfCart(file)
      const next = replaceCartIfValid(cartItems, parsed)
      if (!next.replaced) {
        setCartErrors(next.errors)
        setCartNotice('')
        return
      }
      setCartItems(next.items)
      setCartFileName(file.name)
      setCartSource('pdf')
      setCartNotice(`${file.name}: ${next.items.length} products extracted. Prices were recalculated.`)
      setShowResults(true)
    } finally {
      setPdfBusy(false)
    }
  }

  async function handleParse() {
    if (parseLoading) return
    setParseLoading(true)
    setParseError('')
    setRuleNotice('')
    setPreview(null)
    try {
      const response = await fetch('/api/parse-rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim() }),
      })
      const payload = await response.json().catch(() => null)
      if (!payload) {
        setParseError('The rule parser did not respond. Please try again.')
        return
      }
      if (!response.ok || payload.status === 'error') {
        setParseError(payload.message || 'The rule parser is unavailable.')
        return
      }
      const validated = validateParseResponse(payload)
      if (!validated.ok) {
        setParseError(validated.message)
        return
      }
      setPreview(validated.rule)
    } catch {
      setParseError('The rule parser could not be reached. Start the app with npm run dev and try again.')
    } finally {
      setParseLoading(false)
    }
  }

  function handleConfirm() {
    if (!preview || confirmedPreview.current === preview) return
    confirmedPreview.current = preview
    const validated = validateCandidateRule(preview)
    if (!validated.ok) {
      confirmedPreview.current = null
      setParseError(validated.message)
      setPreview(null)
      return
    }
    const rule = assignRuleId(rules, validated.rule)
    setRules((current) => [...current, rule])
    setPreview(null)
    setDescription('')
    setParseError('')
    setRuleNotice(`${rule.ruleId} is active. The cart was recalculated.`)
    if (cartItems.length > 0) setShowResults(true)
  }

  function handleDiscard() {
    confirmedPreview.current = null
    setPreview(null)
    setParseError('')
    setRuleNotice('Draft discarded. Active rules and the cart are unchanged.')
  }

  const canCalculate = cartItems.length > 0

  return (
    <div className="page">
      <header className="site-header">
        <div className="brand">
          O<span>pp</span>tra
        </div>
        <div className="header-copy">
          <div className="header-kicker">Marketplace pricing</div>
          <div className="header-title">Discount Engine</div>
        </div>
      </header>

      <main className="main">
        <section className="hero">
          <div>
            <h1>See what a shopper actually pays</h1>
            <p>
              Load brand and platform offers, then let a cart-wide offer apply only after those item prices are known.
              New rules can be written in plain English, and a PDF order can replace the cart.
            </p>
          </div>
          <button type="button" className="btn btn-secondary" onClick={loadSample}>
            Load sample data
          </button>
        </section>

        <div className="layout">
          <section className="card" aria-labelledby="rules-heading">
            <h2 id="rules-heading">Discount rules</h2>
            <CsvUploader
              label="rules.csv"
              description="Upload discount rules"
              onLoad={handleRulesLoad}
              onError={setRulesErrors}
              hasData={rules.length > 0}
              fileName={rulesFileName}
            />
            <ErrorBanner errors={rulesErrors} />
            {rulesNotice ? <Notice tone={rulesErrors.length ? 'warning' : 'success'}>{rulesNotice}</Notice> : null}
            {rules.length > 0 ? (
              <div className="table-block">
                <div className="meta-line">{rules.length} active rule{rules.length === 1 ? '' : 's'}</div>
                <DataTable
                  columns={RULES_COLUMNS}
                  rows={rules}
                  caption="Active discount rules"
                  rowClassName={(row) => (row.scope === 'cart' ? 'row-cart' : '')}
                />
              </div>
            ) : (
              <div className="empty-state">No rules yet. Upload rules.csv or confirm a natural-language rule.</div>
            )}
          </section>

          <section className="card" aria-labelledby="cart-heading">
            <h2 id="cart-heading">Cart</h2>
            <CsvUploader
              label="cart.csv"
              description="Upload cart items as CSV"
              onLoad={handleCartLoad}
              onError={setCartErrors}
              hasData={cartSource === 'csv' && cartItems.length > 0}
              fileName={cartSource === 'csv' ? cartFileName : ''}
            />
            <div className="or-split"><span>or replace the cart from a PDF</span></div>
            <PdfUploader
              onFile={handlePdf}
              busy={pdfBusy}
              fileName={cartSource === 'pdf' ? cartFileName : ''}
              itemCount={cartSource === 'pdf' ? cartItems.length : 0}
            />
            <ErrorBanner errors={cartErrors} />
            {cartNotice ? <Notice tone="success">{cartNotice}</Notice> : null}
            {cartItems.length > 0 ? (
              <div className="table-block">
                <div className="meta-line">
                  {cartItems.length} product{cartItems.length === 1 ? '' : 's'}
                  {cartFileName ? ` · ${cartFileName}` : ''}
                </div>
                <DataTable columns={CART_COLUMNS} rows={cartItems} caption="Current cart" />
              </div>
            ) : (
              <div className="empty-state">No cart yet. Upload cart.csv, a PDF order, or load the sample.</div>
            )}
          </section>
        </div>

        <section className="card" aria-labelledby="nl-heading">
          <h2 id="nl-heading">Create a rule in plain English</h2>
          <p className="section-copy">
            The description is parsed on the server. You still confirm the structured rule before it can change any price.
          </p>
          <RuleInput
            value={description}
            onChange={(next) => {
              setDescription(next)
              setParseError('')
              setPreview(null)
              confirmedPreview.current = null
            }}
            onExample={(example) => {
              setDescription(example)
              setPreview(null)
              setParseError('')
              setRuleNotice('')
            }}
            onParse={handleParse}
            loading={parseLoading}
            error={parseError}
          />
          <RuleConfirmation rule={preview} onConfirm={handleConfirm} onDiscard={handleDiscard} />
          {ruleNotice ? <Notice>{ruleNotice}</Notice> : null}
        </section>

        <div className="calculate-row">
          <button
            type="button"
            className="btn btn-primary btn-large"
            onClick={() => setShowResults(true)}
            disabled={!canCalculate}
          >
            Calculate discounts
          </button>
          {!canCalculate ? <div className="hint">Add a cart to calculate prices.</div> : null}
        </div>

        {summary ? (
          <section className="card" aria-labelledby="results-heading">
            <h2 id="results-heading">What the customer pays</h2>
            <ResultsTable rows={summary.itemResults} />
            <CartSummary summary={summary} />
          </section>
        ) : null}
      </main>
    </div>
  )
}
