/**
 * pdfCartParser.js
 *
 * Turns a text-based cart PDF into CartItem objects.
 * Row grouping is pure and tested without a PDF runtime.
 * File reading uses PDF.js in the browser (or Node, when available).
 *
 * Expected columns: Product, Brand, Platform, Base Price.
 * Item ids are generated because the sample PDF does not include them.
 */

export const PDF_TABLE_ERROR =
  'Unable to extract a readable product table. Please upload a text-based PDF with Product, Brand, Platform and Base Price columns.'

export const MAX_PDF_BYTES = 5 * 1024 * 1024
export const MAX_PDF_PAGES = 15
export const MAX_TEXT_ITEMS = 5000

const COLUMN_KEYS = ['product', 'brand', 'platform', 'price']

/**
 * Groups positioned text items into visual rows.
 * PDF y grows upward, so rows are returned top-to-bottom.
 */
export function groupTextItemsIntoRows(items, yTolerance = 3) {
  const usable = (items || [])
    .filter((item) => item && String(item.str ?? '').trim() !== '')
    .map((item) => ({
      str: String(item.str).trim(),
      x: Number(item.x) || 0,
      y: Number(item.y) || 0,
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x)

  const rows = []
  for (const item of usable) {
    const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= yTolerance)
    if (row) {
      row.items.push(item)
      row.y = (row.y * (row.items.length - 1) + item.y) / row.items.length
    } else {
      rows.push({ y: item.y, items: [item] })
    }
  }

  return rows.map((row) => {
    const itemsInRow = [...row.items].sort((a, b) => a.x - b.x)
    return {
      y: row.y,
      items: itemsInRow,
      text: itemsInRow.map((item) => item.str).join(' ').replace(/\s+/g, ' ').trim(),
    }
  })
}

function findHeaderAnchors(row) {
  const text = row.text.toLowerCase()
  if (!text.includes('product') || !text.includes('brand') || !text.includes('platform') || !text.includes('price')) {
    return null
  }

  const anchors = { product: null, brand: null, platform: null, price: null }
  for (const item of row.items) {
    const token = item.str.toLowerCase()
    if (token.includes('product') && anchors.product === null) anchors.product = item.x
    else if (token.includes('brand') && anchors.brand === null) anchors.brand = item.x
    else if (token.includes('platform') && anchors.platform === null) anchors.platform = item.x
    else if ((token.includes('price') || token === 'base') && anchors.price === null) anchors.price = item.x
  }

  if (COLUMN_KEYS.some((key) => anchors[key] === null)) return null
  return anchors
}

function assignColumn(x, anchors) {
  const ordered = COLUMN_KEYS
    .map((key) => ({ key, x: anchors[key] }))
    .sort((a, b) => a.x - b.x)

  let chosen = ordered[0].key
  for (const column of ordered) {
    if (x + 2 >= column.x) chosen = column.key
  }
  return chosen
}

function cellsFromRow(row, anchors) {
  const cells = { product: [], brand: [], platform: [], price: [] }
  for (const item of row.items) {
    cells[assignColumn(item.x, anchors)].push(item.str)
  }
  return {
    product: cells.product.join(' ').replace(/\s+/g, ' ').trim(),
    brand: cells.brand.join(' ').replace(/\s+/g, ' ').trim(),
    platform: cells.platform.join(' ').replace(/\s+/g, ' ').trim(),
    price: cells.price.join(' ').replace(/\s+/g, ' ').trim(),
  }
}

/**
 * Parses a price such as "Rs.1,299", "₹849", or "2499.00".
 * Returns a positive whole-rupee number, or null.
 */
export function parsePrice(raw) {
  if (raw === undefined || raw === null) return null
  const cleaned = String(raw)
    .replace(/rs\.?/gi, '')
    .replace(/₹/g, '')
    .replace(/,/g, '')
    .replace(/\s+/g, '')
    .replace(/[^\d.]/g, '')

  if (!cleaned || cleaned === '.') return null
  const value = Number(cleaned)
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.round(value)
}

function itemId(index) {
  return `PDF-${String(index).padStart(3, '0')}`
}

/**
 * Maps grouped text rows into cart items.
 * Any malformed product row fails the whole extraction (data is emptied).
 */
export function cartItemsFromRows(rows) {
  const list = rows || []
  let headerIndex = -1
  let anchors = null

  for (let i = 0; i < list.length; i += 1) {
    anchors = findHeaderAnchors(list[i])
    if (anchors) {
      headerIndex = i
      break
    }
  }

  if (!anchors) {
    return { data: [], errors: [PDF_TABLE_ERROR] }
  }

  const data = []
  const errors = []

  for (let i = headerIndex + 1; i < list.length; i += 1) {
    const row = list[i]
    if (!row.text) continue

    const cells = cellsFromRow(row, anchors)
    const populated = [cells.product, cells.brand, cells.platform, cells.price].filter(Boolean)
    if (populated.length === 0) continue
    if (populated.length < 2 && !/\d/.test(cells.price || cells.product)) continue

    const rowLabel = `Line ${i + 1}`
    const missing = []
    if (!cells.product) missing.push('product')
    if (!cells.brand) missing.push('brand')
    if (!cells.platform) missing.push('platform')
    if (!cells.price) missing.push('base price')

    if (missing.length > 0) {
      errors.push(`${rowLabel}: missing ${missing.join(', ')} ("${row.text}")`)
      continue
    }

    const basePrice = parsePrice(cells.price)
    if (basePrice === null) {
      errors.push(`${rowLabel}: invalid price "${cells.price}"`)
      continue
    }

    data.push({
      itemId: itemId(data.length + 1),
      product: cells.product,
      brand: cells.brand,
      platform: cells.platform,
      basePrice,
    })
  }

  if (errors.length > 0) {
    return { data: [], errors }
  }

  if (data.length === 0) {
    return { data: [], errors: [PDF_TABLE_ERROR] }
  }

  return { data, errors: [] }
}

/**
 * Keeps the current cart unless the PDF parse is complete and valid.
 */
export function replaceCartIfValid(currentItems, parseResult) {
  const errors = parseResult?.errors?.length
    ? parseResult.errors
    : parseResult?.data?.length
      ? []
      : [PDF_TABLE_ERROR]

  if (errors.length > 0 || !parseResult?.data?.length) {
    return {
      items: currentItems || [],
      replaced: false,
      errors: errors.length > 0 ? errors : [PDF_TABLE_ERROR],
    }
  }

  return { items: parseResult.data, replaced: true, errors: [] }
}

function textContentToItems(textContent, pageOffset) {
  return (textContent.items || [])
    .filter((item) => item.str && item.str.trim())
    .map((item) => ({
      str: item.str,
      x: item.transform ? item.transform[4] : 0,
      y: (item.transform ? item.transform[5] : 0) - pageOffset,
    }))
}

/**
 * Extracts cart rows from PDF.js text content across pages.
 * `pages` is an array of getTextContent() results, in order.
 */
export function cartItemsFromTextContents(pages) {
  if (!pages || pages.length === 0) {
    return { data: [], errors: [PDF_TABLE_ERROR] }
  }

  const items = []
  pages.forEach((page, index) => {
    items.push(...textContentToItems(page, index * 10000))
  })

  if (items.length === 0) {
    return { data: [], errors: [PDF_TABLE_ERROR] }
  }
  if (items.length > MAX_TEXT_ITEMS) {
    return { data: [], errors: ['This PDF has too much text to extract safely.'] }
  }

  return cartItemsFromRows(groupTextItemsIntoRows(items))
}

function isPdfFile(file) {
  const name = String(file?.name || '').toLowerCase()
  const type = String(file?.type || '').toLowerCase()
  return name.endsWith('.pdf') || type === 'application/pdf'
}

/**
 * Reads an uploaded PDF File (or Blob) into cart items.
 * Does not mutate any existing cart — the caller decides replacement.
 */
export async function parsePdfCart(file) {
  if (!file) {
    return { data: [], errors: ['Choose a PDF cart to upload.'] }
  }
  if (!isPdfFile(file)) {
    return { data: [], errors: ['Please upload a .pdf file.'] }
  }
  if (typeof file.size === 'number' && file.size > MAX_PDF_BYTES) {
    return { data: [], errors: ['PDF must be 5 MB or smaller.'] }
  }
  if (typeof file.size === 'number' && file.size === 0) {
    return { data: [], errors: [PDF_TABLE_ERROR] }
  }

  let bytes
  try {
    const buffer = await file.arrayBuffer()
    bytes = new Uint8Array(buffer)
  } catch {
    return { data: [], errors: ['The PDF could not be read.'] }
  }

  if (!bytes.length || bytes[0] !== 0x25) {
    return { data: [], errors: ['This file is not a valid PDF.'] }
  }

  try {
    const pdfjs = await import('pdfjs-dist')
    const workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

    const loadingTask = pdfjs.getDocument({
      data: bytes,
      disableWorker: false,
      isEvalSupported: false,
      useSystemFonts: true,
    })
    const document = await loadingTask.promise

    if (!document.numPages) {
      return { data: [], errors: [PDF_TABLE_ERROR] }
    }
    if (document.numPages > MAX_PDF_PAGES) {
      return { data: [], errors: [`PDF has ${document.numPages} pages. Please upload a cart of ${MAX_PDF_PAGES} pages or fewer.`] }
    }

    const pages = []
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      pages.push(await page.getTextContent())
    }

    return cartItemsFromTextContents(pages)
  } catch {
    return { data: [], errors: [PDF_TABLE_ERROR] }
  }
}
