import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = readFileSync(
  fileURLToPath(new URL('./EncargoOrderViewModal.tsx', import.meta.url)),
  'utf8',
)

test('generating the invoice no longer closes the form or opens a popup before the PDF is ready', () => {
  const generate = source.slice(
    source.indexOf('const handleGenerateInvoice = useCallback('),
    source.indexOf('const handleGenerateComanda = useCallback('),
  )
  assert.match(generate, /handlePrintInvoice\(language, number, customer\)/)
  assert.doesNotMatch(generate, /createEncargoPdfPreviewWindow|window\.open|closeInvoiceFlow\(\)/)
})

test('generated invoice is shown inside an accessible in-app PDF preview', () => {
  const print = source.slice(
    source.indexOf('const handlePrintInvoice = useCallback('),
    source.indexOf('const handlePrintComanda = useCallback('),
  )
  assert.match(print, /URL\.createObjectURL\(pdf\.blob\)/)
  assert.match(print, /setInvoicePreview\(\{ url, filename: pdf\.filename \}\)/)
  assert.doesNotMatch(print, /openEncargoPdf\(|previewWindow/)
  assert.match(source, /instance="encargo-invoice-pdf-preview"/)
  assert.match(source, /layer="system"/)
  assert.match(source, /title="Factura PDF"/)
  assert.match(source, /src=\{invoicePreview\.url\}/)
  assert.match(source, /Descargar PDF/)
  assert.match(source, /Si tu navegador no muestra el PDF/)
  assert.match(source, /Abrir en otra pestaña/)
})

test('the successful preview closes only when explicitly dismissed', () => {
  const preview = source.slice(
    source.indexOf('const closeInvoicePreview = useCallback('),
    source.indexOf('const handleGenerateInvoice = useCallback('),
  )
  assert.match(preview, /setInvoicePreview\(null\)/)
  assert.match(preview, /closeInvoiceFlow\(\)/)
})
