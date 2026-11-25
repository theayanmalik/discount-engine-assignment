/**
 * CsvUploader.jsx
 *
 * File picker for a single CSV. Calls onLoad(rawText, fileName)
 * after basic type and size checks.
 */

import { useRef } from 'react'

const MAX_CSV_BYTES = 2 * 1024 * 1024

export default function CsvUploader({ label, description, onLoad, onError, hasData, fileName }) {
  const inputRef = useRef(null)
  const inputId = `csv-${label.replace(/\s+/g, '-').toLowerCase()}`

  function handleFile(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.csv')) {
      onError?.([`"${file.name}" is not a CSV file.`])
      return
    }
    if (file.size > MAX_CSV_BYTES) {
      onError?.(['CSV must be 2 MB or smaller.'])
      return
    }

    const reader = new FileReader()
    reader.onload = (evt) => onLoad(evt.target.result, file.name)
    reader.onerror = () => onError?.(['That CSV could not be read.'])
    reader.readAsText(file)
  }

  return (
    <div
      className={`dropzone ${hasData ? 'dropzone-ready' : ''}`}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          inputRef.current?.click()
        }
      }}
      role="button"
      tabIndex={0}
    >
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        aria-label={description}
        onChange={handleFile}
      />
      <div className="dropzone-row">
        <span className="dropzone-mark" aria-hidden="true">{hasData ? 'OK' : 'CSV'}</span>
        <div>
          <div className="dropzone-label">{label}</div>
          <div className="dropzone-meta">{hasData ? fileName : description}</div>
        </div>
        <span className={`dropzone-action ${hasData ? 'is-ready' : ''}`}>
          {hasData ? 'Change' : 'Upload'}
        </span>
      </div>
    </div>
  )
}
