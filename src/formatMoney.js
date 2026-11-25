export function formatRupees(value) {
  const amount = Number.isFinite(value) ? Math.round(value) : 0
  return `Rs.${amount.toLocaleString('en-IN')}`
}
