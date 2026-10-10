import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = readFileSync(
  fileURLToPath(new URL('./EncargoOrderViewModal.tsx', import.meta.url)),
  'utf8',
)

function section(start: string, end: string): string {
  const from = source.indexOf(start)
  const to = source.indexOf(end, from)
  assert.ok(from >= 0 && to > from, 'Sección no encontrada: ' + start)
  return source.slice(from, to)
}

test('generar factura usa la misma apertura de pestaña que presupuesto y comanda', () => {
  const quote = section(
    'const handlePrintLanguage = useCallback(',
    'const closeInvoiceFlow = useCallback(',
  )
  const invoice = section(
    'const handleGenerateInvoice = useCallback(',
    'const handleGenerateComanda = useCallback(',
  )
  assert.match(quote, /createEncargoPdfPreviewWindow\(\)/)
  assert.match(quote, /handlePrint\(language, previewWindow\)/)
  assert.match(invoice, /const previewWindow = createEncargoPdfPreviewWindow\(\)/)
  assert.match(invoice, /handlePrintInvoice\(language, number, customer, previewWindow\)/)
  assert.doesNotMatch(invoice, /closeInvoiceFlow\(\)/)
})

test('factura con y sin datos de cliente usan el MISMO circuito', () => {
  const generate = section(
    'const handleGenerateInvoice = useCallback(',
    'const handleGenerateComanda = useCallback(',
  )
  assert.match(generate, /invoiceStep === 'customer' \? \{ \.\.\.invoiceCustomer \} : null/)
  assert.equal(
    generate.match(/handlePrintInvoice\(/g)?.length,
    1,
    'No crear caminos de apertura diferentes según datos del cliente',
  )
})

test('cuando se abre la pestaña, el PDF se entrega con la misma función que el presupuesto', () => {
  const print = section(
    'const handlePrintInvoice = useCallback(',
    'const handlePrintComanda = useCallback(',
  )
  assert.match(print, /previewWindow\?: Window \| null/)
  assert.match(print, /if \(previewWindow && !previewWindow\.closed\)/)
  assert.match(print, /openEncargoPdf\(pdf, previewWindow\)/)
  assert.match(print, /setInvoiceLanguage\(null\)/)
  assert.match(print, /previewWindow\?\.close\(\)/)
})

test('si el popup está bloqueado, el PDF sigue accesible en un visor con descarga', () => {
  const print = section(
    'const handlePrintInvoice = useCallback(',
    'const handlePrintComanda = useCallback(',
  )
  assert.match(print, /URL\.createObjectURL\(pdf\.blob\)/)
  assert.match(print, /setInvoicePreview\(\{ url, filename: pdf\.filename \}\)/)
  assert.match(source, /instance="encargo-invoice-pdf-preview"/)
  assert.match(source, /src=\{invoicePreview\.url\}/)
  assert.match(source, /Descargar PDF/)
  assert.match(source, /Abrir en otra pestaña/)
  assert.match(source, /closeInvoiceFlow\(\)/)
})
