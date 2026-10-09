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
    'FACTURA', 'FACT-127', 'Cliente Fiscal SL', 'B12345678',
    'Calle Ejemplo', '08005 Barcelona', 'España',
  ]) {
    assert.ok(content.includes(value), 'Falta en PDF: ' + value)
  }
  assert.doesNotMatch(content, /DATOS DEL CLIENTE|RAZÓN SOCIAL|DIRECCIÓN|CÓDIGO POSTAL|PROVINCIA|PAÍS|COMENSALES|FECHA RESERVA|HORA RESERVA/)
})

test('Los encabezados fiscales respetan el idioma elegido', async () => {
  const customer = {
    businessName: 'Company Test', nif: 'X1234', address: 'Test Street',
    postalCode: '12345', province: 'London', country: 'UK',
  }
  const textEn = await pdfText({ ...baseline, language: 'en', invoiceCustomer: customer })
  assert.match(textEn, /INVOICE/)
  assert.match(textEn, /Company Test/)
  assert.doesNotMatch(textEn, /CUSTOMER DETAILS|LEGAL NAME|COUNTRY/)

  const textCa = await pdfText({ ...baseline, language: 'ca', invoiceCustomer: customer })
  assert.match(textCa, /FACTURA/)
  assert.match(textCa, /Company Test/)
  assert.doesNotMatch(textCa, /DADES DEL CLIENT|RAÓ SOCIAL/)
})

test('Título y número de factura aparecen juntos arriba a la derecha, no en el bloque fiscal', async () => {
  const result = await generateEncargoPdf('invoice', {
    ...baseline,
    invoiceCustomer: {
      businessName: 'Cliente Fiscal SL',
      nif: 'B12345678',
      address: 'Calle de prueba 1',
      postalCode: '08005',
      province: 'Barcelona',
      country: 'España',
    },
  }, items)
  const doc = await getDocument({
    data: new Uint8Array(await result.blob.arrayBuffer()), useSystemFonts: true,
  }).promise
  try {
    const page = await doc.getPage(1)
    const content = await page.getTextContent()
    const textItems = content.items.filter((item) => 'str' in item)
    const title = textItems.find((item) => item.str === 'FACTURA')
    const number = textItems.find((item) => item.str === 'FACT-127')
    const client = textItems.find((item) => item.str === 'Cliente Fiscal SL')
    assert.ok(title && number && client)
    assert.ok(title.transform[4] > 440, 'Factura debería estar en la parte derecha')
    assert.ok(number.transform[4] > 440, 'El número debería estar en la parte derecha')
    assert.ok(title.transform[5] > client.transform[5], 'Factura arriba del cliente')
    assert.ok(number.transform[5] > client.transform[5], 'Número arriba del cliente')
  } finally {
    await doc.destroy()
  }
})

test('Factura sin notas de productos, presupuesto conservando sus notas', async () => {
  const products = [{ ...items[0], notes: 'SIN CEBOLLA', quantity: 3, unit_price: 7 }]
  const invoice = await generateEncargoPdf('invoice', baseline, products)
  const quote = await generateEncargoPdf('quote', baseline, products)
  const extract = async (data: Blob) => {
    const doc = await getDocument({
      data: new Uint8Array(await data.arrayBuffer()), useSystemFonts: true,
    }).promise
    try {
      const content = await (await doc.getPage(1)).getTextContent()
      return content.items.map((item) => ('str' in item ? item.str : '')).join(' ')
    } finally {
      await doc.destroy()
    }
  }
  const invoiceText = await extract(invoice.blob)
  const quoteText = await extract(quote.blob)
  assert.doesNotMatch(invoiceText, /SIN CEBOLLA/)
  assert.match(quoteText, /SIN CEBOLLA/)
  assert.match(invoiceText, /21[.]00/)
})
