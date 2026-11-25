import DataTable from './DataTable.jsx'
import { formatRupees } from '../formatMoney.js'

const COLUMNS = [
  { key: 'itemId', label: 'Item' },
  { key: 'product', label: 'Product' },
  { key: 'basePrice', label: 'Base Price', render: (value) => formatRupees(value) },
  {
    key: 'finalPrice',
    label: 'Final Price',
    render: (value, row) => (
      <span className={row.totalDiscount > 0 ? 'price-save' : 'price-plain'}>{formatRupees(value)}</span>
    ),
  },
  {
    key: 'totalDiscount',
    label: 'You Save',
    render: (value) => (value > 0 ? <span className="price-save">{formatRupees(value)}</span> : <span className="muted">—</span>),
  },
  {
    key: 'reasoning',
    label: 'Offer Applied',
    render: (value) => (
      <span className={value === 'No offers available' ? 'muted italic' : ''}>{value}</span>
    ),
  },
]

export default function ResultsTable({ rows }) {
  return <DataTable columns={COLUMNS} rows={rows} caption="Item prices after brand and platform offers" />
}
