import { formatRupees } from '../formatMoney.js'

export default function CartSummary({ summary }) {
  if (!summary) return null
  const offer = summary.cartOffer

  return (
    <div className="summary-block">
      <div className="summary-line">
        <span>Cart total before offer</span>
        <strong>{formatRupees(summary.cartSubtotal)}</strong>
      </div>
      {offer ? (
        <div className="summary-line summary-offer">
          <span>{offer.reasoning}</span>
          <strong>-{formatRupees(offer.amount)}</strong>
        </div>
      ) : null}
      <div className="payable">
        <div>
          <div className="payable-kicker">Final cart total</div>
          <div className="payable-note">
            {offer ? 'Item offers applied, then the cart offer.' : 'Item offers applied. No cart offer on this total.'}
          </div>
        </div>
        <div className="payable-amount">{formatRupees(summary.finalCartTotal)}</div>
      </div>
    </div>
  )
}
