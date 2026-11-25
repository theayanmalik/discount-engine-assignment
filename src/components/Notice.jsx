export default function Notice({ tone = 'success', children }) {
  if (!children) return null
  return (
    <div className={`banner banner-${tone}`} role="status">
      {children}
    </div>
  )
}
