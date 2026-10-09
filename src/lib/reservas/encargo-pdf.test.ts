import test from 'node:test'
import assert from 'node:assert/strict'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { generateEncargoPdf, type EncargoPdfMeta } from './encargo-pdf.ts'

const baseline: EncargoPdfMeta = {
  encargoDate: '09/10/26',
  encargoTime: '20:30',
  encargoName: 'Reserva Ejemplo',
  contactPhone: '600000000',
  guestCount: 12,
  logoUrl: '',
  language: 'es',
  invoiceNumber: 'FACT-127',
}

const items = [{
  product_id: 'ejemplo', name: 'Bocadillo', notes: null, quantity: 2, unit_price: 5,
}]

async function pdfText(meta: EncargoPdfMeta): Promise<string> {
  const result = await generateEncargoPdf('invoice', meta, items)
  const document = await getDocument({
    data: new Uint8Array(await result.blob.arrayBuffer()),
    useSystemFonts: true,
  }).promise
  try {
    const page = await document.getPage(1)
    const content = await page.getTextContent()
    return content.items.map((item) => ('str' in item ? item.str : '')).join(' ')
  } finally {
    await document.destroy()
  }
}

test('Facturas sin datos fiscales conservan el resumen previo de la reserva', async () => {
  const content = await pdfText(baseline)
  assert.match(content, /CLIENTE/)
  assert.match(content, /COMENSALES/)
  assert.match(content, /HORA RESERVA/)
  assert.match(content, /FACT-127/)
  assert.doesNotMatch(content, /RAZÓN SOCIAL/)
})

test('Facturas con datos fiscales sustituyen el resumen y muestran las siete entradas', async () => {
  const content = await pdfText({
    ...baseline,
    invoiceCustomer: {
      businessName: 'Cliente Fiscal SL',
      nif: 'B12345678',
      address: 'Calle Ejemplo 12, planta cuarta, puerta cinco',
      postalCode: '08005',
      province: 'Barcelona',
      country: 'España',
    },
  })
  for (const value of [
    'DATOS DEL CLIENTE', 'FACTURA Nº', 'FACT-127',
    'RAZÓN SOCIAL', 'Cliente Fiscal SL', 'NIF', 'B12345678',
    'DIRECCIÓN', 'Calle Ejemplo', 'CÓDIGO POSTAL', '08005',
    'PROVINCIA', 'Barcelona', 'PAÍS', 'España',
  ]) {
    assert.ok(content.includes(value), 'Falta en PDF: ' + value)
  }
  assert.doesNotMatch(content, /COMENSALES|FECHA RESERVA|HORA RESERVA/)
})

test('Los encabezados fiscales respetan el idioma elegido', async () => {
  const customer = {
    businessName: 'Company Test', nif: 'X1234', address: 'Test Street',
    postalCode: '12345', province: 'London', country: 'UK',
  }
  const textEn = await pdfText({ ...baseline, language: 'en', invoiceCustomer: customer })
  assert.match(textEn, /CUSTOMER DETAILS/)
  assert.match(textEn, /LEGAL NAME/)
  assert.match(textEn, /COUNTRY/)

  const textCa = await pdfText({ ...baseline, language: 'ca', invoiceCustomer: customer })
  assert.match(textCa, /DADES DEL CLIENT/)
  assert.match(textCa, /RAÓ SOCIAL/)
})
