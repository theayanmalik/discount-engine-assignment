import { writeFileSync } from 'node:fs'
import { PDFDocument, StandardFonts } from 'pdf-lib'

const rows = [
  ['Cushion Cover', 'Natura Casa', 'Amazon India', 'Rs.1,299'],
  ['Bed Sheet Set', 'Natura Casa', 'Flipkart', 'Rs.849'],
  ['Wall Shelf', 'LivSpace Pro', 'Amazon India', 'Rs.599'],
  ['Ceramic Vase', 'LivSpace Pro', 'Noon', 'Rs.2,499'],
  ['Cutting Board', 'Nordic Basics', 'Amazon India', 'Rs.449'],
  ['Desk Organiser', 'Nordic Basics', 'Flipkart', 'Rs.899'],
]

const doc = await PDFDocument.create()
const page = doc.addPage([612, 792])
const font = await doc.embedFont(StandardFonts.Helvetica)
page.drawText('Order #OP-9921', { x: 40, y: 740, size: 14, font })
const headers = [['Product', 40], ['Brand', 180], ['Platform', 320], ['Base Price', 460]]
headers.forEach(([text, x]) => page.drawText(text, { x, y: 700, size: 11, font }))
rows.forEach((cells, index) => {
  const y = 670 - index * 24
  ;[40, 180, 320, 460].forEach((x, cell) => page.drawText(cells[cell], { x, y, size: 11, font }))
})

const bytes = await doc.save()
writeFileSync(new URL('../sample-data/cart.pdf', import.meta.url), bytes)
console.log(`Wrote sample-data/cart.pdf (${bytes.length} bytes)`)
