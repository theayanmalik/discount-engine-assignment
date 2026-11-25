import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import {
  PDF_TABLE_ERROR,
  cartItemsFromRows,
  groupTextItemsIntoRows,
  parsePrice,
  replaceCartIfValid,
} from '../src/engine/pdfCartParser.js'

const header = [
  { str: 'Product', x: 40, y: 700 },
  { str: 'Brand', x: 190, y: 700 },
  { str: 'Platform', x: 330, y: 700 },
  { str: 'Base', x: 470, y: 700 },
  { str: 'Price', x: 505, y: 698 },
]

function row(y, product, brand, platform, price) {
  const cells = [
    [product, 40],
    [brand, 190],
    [platform, 330],
    [price, 470],
  ]
  return cells.flatMap(([text, x]) => (
    String(text).split(' ').map((word, index) => ({ str: word, x: x + index * 42, y }))
  ))
}

const sampleRows = [
  ['Cushion Cover', 'Natura Casa', 'Amazon India', 'Rs.1,299'],
  ['Bed Sheet Set', 'Natura Casa', 'Flipkart', 'Rs.849'],
  ['Wall Shelf', 'LivSpace Pro', 'Amazon India', 'Rs.599'],
  ['Ceramic Vase', 'LivSpace Pro', 'Noon', 'Rs.2,499'],
  ['Cutting Board', 'Nordic Basics', 'Amazon India', 'Rs.449'],
  ['Desk Organiser', 'Nordic Basics', 'Flipkart', 'Rs.899'],
]

function sampleItems() {
  const items = [{ str: 'Order #OP-9921', x: 40, y: 740 }, ...header]
  sampleRows.forEach((cells, index) => {
    items.push(...row(660 - index * 22, ...cells))
  })
  return items
}

test('price strings lose currency marks and thousands separators', () => {
  assert.equal(parsePrice('Rs.1,299'), 1299)
  assert.equal(parsePrice('₹849'), 849)
  assert.equal(parsePrice('2,499.40'), 2499)
  assert.equal(parsePrice('free'), null)
  assert.equal(parsePrice('Rs.0'), null)
})

test('a positioned product table maps to cart items with generated ids', () => {
  const rows = groupTextItemsIntoRows(sampleItems())
  const { data, errors } = cartItemsFromRows(rows)
  assert.deepEqual(errors, [])
  assert.equal(data.length, 6)
  assert.deepEqual(data[0], {
    itemId: 'PDF-001',
    product: 'Cushion Cover',
    brand: 'Natura Casa',
    platform: 'Amazon India',
    basePrice: 1299,
  })
  assert.equal(data[5].itemId, 'PDF-006')
  assert.equal(data[5].basePrice, 899)
})

test('duplicate product names still receive distinct ids', () => {
  const items = [
    ...header,
    ...row(640, 'Cushion Cover', 'Natura Casa', 'Amazon India', '1299'),
    ...row(610, 'Cushion Cover', 'Natura Casa', 'Amazon India', '1299'),
  ]
  const { data, errors } = cartItemsFromRows(groupTextItemsIntoRows(items))
  assert.deepEqual(errors, [])
  assert.deepEqual(data.map((item) => item.itemId), ['PDF-001', 'PDF-002'])
})

test('a missing column header fails the document', () => {
  const { errors, data } = cartItemsFromRows(groupTextItemsIntoRows([
    { str: 'Product', x: 40, y: 700 },
    { str: 'Brand', x: 180, y: 700 },
    ...row(660, 'Vase', 'LivSpace Pro', 'Noon', '2499'),
  ]))
  assert.equal(data.length, 0)
  assert.equal(errors[0], PDF_TABLE_ERROR)
})

test('a missing or invalid price fails the whole extract', () => {
  const missing = cartItemsFromRows(groupTextItemsIntoRows([
    ...header,
    ...row(640, 'Cushion Cover', 'Natura Casa', 'Amazon India', '1299'),
    { str: 'Mystery', x: 40, y: 610 },
    { str: 'Bowl', x: 80, y: 610 },
    { str: 'Natura', x: 190, y: 610 },
    { str: 'Casa', x: 232, y: 610 },
  ]))
  assert.equal(missing.data.length, 0)
  assert.match(missing.errors[0], /missing/)

  const invalid = cartItemsFromRows(groupTextItemsIntoRows([
    ...header,
    ...row(640, 'Cushion Cover', 'Natura Casa', 'Amazon India', 'free'),
  ]))
  assert.equal(invalid.data.length, 0)
  assert.match(invalid.errors[0], /invalid price/)
})

test('an empty document explains that no table was found', () => {
  const { data, errors } = cartItemsFromRows([])
  assert.equal(data.length, 0)
  assert.equal(errors[0], PDF_TABLE_ERROR)
})

test('a failed parse keeps the original cart object', () => {
  const current = [{ itemId: 'ITEM-01', product: 'Keep me', brand: 'A', platform: 'B', basePrice: 10 }]
  const next = replaceCartIfValid(current, { data: [], errors: ['Line 3: invalid price "free"'] })
  assert.equal(next.replaced, false)
  assert.strictEqual(next.items, current)
  assert.match(next.errors[0], /invalid price/)
})

test('a real text PDF extracts the same six sample products', async () => {
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  page.drawText('Order #OP-9921', { x: 40, y: 740, size: 12, font })
  const headers = [['Product', 40], ['Brand', 180], ['Platform', 320], ['Base Price', 460]]
  headers.forEach(([text, x]) => page.drawText(text, { x, y: 700, size: 11, font }))
  sampleRows.forEach((cells, index) => {
    const y = 670 - index * 24
    ;[40, 180, 320, 460].forEach((x, cell) => {
      page.drawText(cells[cell], { x, y, size: 11, font })
    })
  })
  const bytes = await doc.save()

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const { pathToFileURL } = await import('node:url')
  const { createRequire } = await import('node:module')
  const require = createRequire(import.meta.url)
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')
  ).href

  const document = await pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise
  const text = await (await document.getPage(1)).getTextContent()
  const { cartItemsFromTextContents } = await import('../src/engine/pdfCartParser.js')
  const parsed = cartItemsFromTextContents([text])
  assert.deepEqual(parsed.errors, [])
  assert.equal(parsed.data.length, 6)
  assert.equal(parsed.data[0].product, 'Cushion Cover')
  assert.equal(parsed.data[0].basePrice, 1299)
  assert.equal(parsed.data[3].product, 'Ceramic Vase')
  assert.equal(parsed.data[3].basePrice, 2499)

  const saved = readFileSync(new URL('../sample-data/cart.pdf', import.meta.url))
  assert.ok(saved.length > 500)
})
