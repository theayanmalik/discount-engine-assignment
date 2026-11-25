/**
 * ErrorBanner.jsx
 * Displays parse or validation errors. Text is rendered as text, never HTML.
 */

export default function ErrorBanner({ errors, title }) {
  if (!errors || errors.length === 0) return null
  const heading = title || `${errors.length} issue${errors.length > 1 ? 's' : ''} found`
  return (
    <div className="banner banner-error" role="alert">
      <div className="banner-title">{heading}</div>
      {errors.map((error, index) => (
        <div key={`${index}-${error}`} className="banner-line">{error}</div>
      ))}
    </div>
  )
}
