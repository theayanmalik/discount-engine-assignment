/**
 * PdfUploader.jsx
 *
 * Separate cart input for a text-based PDF table.
 * Parsing happens in the parent so a failed file cannot replace the cart.
 */

import { useRef } from 'react'

export default function PdfUploader({ onFile, busy, fileName, itemCount }) {
  const inputRef = useRef(null)
  const ready = Boolean(fileName)

  return (
    <div className={`dropzone dropzone-pdf ${ready ? 'dropzone-ready' : ''}`}>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        aria-label="Upload a PDF cart"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) onFile(file)
        }}
      />
      <div className="dropzone-row">
        <span className="dropzone-mark" aria-hidden="true">PDF</span>
        <div>
          <div className="dropzone-label">PDF cart</div>
          <div className="dropzone-meta">
            {busy
              ? 'Reading the product table…'
              : ready
                ? `${fileName} · ${itemCount} item${itemCount === 1 ? '' : 's'}`
                : 'Text-based PDF with Product, Brand, Platform, and Base Price'}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? 'Reading…' : ready ? 'Replace' : 'Upload PDF'}
        </button>
      </div>
    </div>
  )
}
