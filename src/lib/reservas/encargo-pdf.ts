import type { EventOrderItem } from '@/app/dashboard/eventos/[eventId]/pedidos/PedidosEventoClient'

export type EncargoDocumentLanguage = 'ca' | 'es' | 'en'
export type EncargoPdfKind = 'quote' | 'invoice' | 'comanda'

export type EncargoPdfMeta = {
  encargoDate: string
  encargoTime: string
  encargoName: string
  contactPhone: string | null
  logoUrl: string
  guestCount?: number | null
  language?: EncargoDocumentLanguage
  invoiceNumber?: string | null
  observations?: string | null
}

export type EncargoPdfResult = {
  blob: Blob
  filename: string
}

type PdfDoc = import('jspdf').jsPDF

const IVA_RATE = 0.1
const BRAND: [number, number, number] = [54, 96, 111]
const BRAND_DARK: [number, number, number] = [42, 74, 86]
const TEXT: [number, number, number] = [47, 58, 69]
const MUTED: [number, number, number] = [107, 114, 128]
const LINE: [number, number, number] = [217, 226, 236]
const SOFT: [number, number, number] = [248, 250, 252]
const SOFT_BRAND: [number, number, number] = [245, 248, 249]
const WHITE: [number, number, number] = [255, 255, 255]

const COMPANY = {
  tradeName: 'Bar La Marbella',
  legalName: 'Fogo Torrat S.L.',
  cif: 'B-09761628',
  address: 'Av. Litoral 86, 08005 Barcelona',
  phone: '647 229 309',
  email: 'fogotorrat@gmail.com',
} as const

const COPY = {
  es: {
    invoice: 'Factura',
    quote: 'Presupuesto',
    client: 'Cliente',
    contact: 'Contacto',
    date: 'Fecha reserva',
    time: 'Hora reserva',
    guests: 'Comensales',
    vatApplied: 'IVA aplicado',
    product: 'Producto',
    qty: 'Cant.',
    unitPrice: 'P. unit.',
    amount: 'Importe',
    taxableBase: 'Base imponible',
    total: 'Total',
    perPerson: 'Presupuesto por persona',
    perPersonNote: (count: number) => `Importe medio calculado sobre ${count} comensales.`,
    base: 'Base',
    thanks: '¡Gracias por vuestra visita!',
    quoteLegal: 'Precios con IVA incluido. Tipo impositivo 10%.',
    comanda: 'Comanda',
    note: 'Observación',
    observations: 'Observaciones',
    dateShort: 'Fecha',
    timeShort: 'Hora',
  },
  ca: {
    invoice: 'Factura',
    quote: 'Pressupost',
    client: 'Client',
    contact: 'Contacte',
    date: 'Data reserva',
    time: 'Hora reserva',
    guests: 'Comensals',
    vatApplied: 'IVA aplicat',
    product: 'Producte',
    qty: 'Quant.',
    unitPrice: 'P. unit.',
    amount: 'Import',
    taxableBase: 'Base imposable',
    total: 'Total',
    perPerson: 'Pressupost per persona',
    perPersonNote: (count: number) => `Import mitjà calculat sobre ${count} comensals.`,
    base: 'Base',
    thanks: 'Gràcies per la vostra visita!',
    quoteLegal: 'Preus amb IVA inclòs. Tipus impositiu 10%.',
    comanda: 'Comanda',
    note: 'Observació',
    observations: 'Observacions',
    dateShort: 'Data',
    timeShort: 'Hora',
  },
  en: {
    invoice: 'Invoice',
    quote: 'Quote',
    client: 'Client',
    contact: 'Contact',
    date: 'Booking date',
    time: 'Booking time',
    guests: 'Guests',
    vatApplied: 'VAT applied',
    product: 'Product',
    qty: 'Qty.',
    unitPrice: 'Unit price',
    amount: 'Amount',
    taxableBase: 'Taxable base',
    total: 'Total',
    perPerson: 'Quote per person',
    perPersonNote: (count: number) => `Average amount calculated for ${count} guests.`,
    base: 'Base',
    thanks: 'Thank you for your visit!',
    quoteLegal: 'Prices include VAT. Tax rate 10%.',
    comanda: 'Kitchen order',
    note: 'Note',
    observations: 'Observations',
    dateShort: 'Date',
    timeShort: 'Time',
  },
} as const

function copyFor(language: EncargoDocumentLanguage | undefined) {
  return COPY[language ?? 'es']
}

function formatDocumentPhone(value: string | null | undefined): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  const local = /^0034\d{9}$/.test(digits)
    ? digits.slice(4)
    : /^34\d{9}$/.test(digits)
      ? digits.slice(2)
      : digits
  if (/^[6789]\d{8}$/.test(local)) {
    return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`
  }
  return raw
}

function formatEuro(amount: number): string {
  if (!Number.isFinite(amount)) return '0.00 €'
  return `${amount.toFixed(2)} €`
}

function productLabel(it: EventOrderItem): string {
  const note = it.notes?.trim() ?? ''
  const isHalf = /^(1\/2|½|medio|mitad|half)$/i.test(note)
  let name = String(it.name ?? '').trim()
  name = name.replace(/^1\/2\s*·\s*/i, '1/2 ').replace(/^½\s*·\s*/i, '1/2 ')
  if (isHalf && !/^(1\/2|½)\b/i.test(name)) name = `1/2 ${name}`
  return name
}

function productNote(it: EventOrderItem): string {
  const note = it.notes?.trim() ?? ''
  return /^(1\/2|½|medio|mitad|half)$/i.test(note) ? '' : note
}

function safeFilenamePart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'cliente'
}

function documentLabel(kind: EncargoPdfKind, language: EncargoDocumentLanguage | undefined): string {
  const copy = copyFor(language)
  if (kind === 'invoice') return copy.invoice
  if (kind === 'comanda') return copy.comanda
  return copy.quote
}

function filenameFor(kind: EncargoPdfKind, meta: EncargoPdfMeta): string {
  const label = documentLabel(kind, meta.language)
  const date = meta.encargoDate.replace(/\D/g, '')
  return `${safeFilenamePart(label)}-${safeFilenamePart(meta.encargoName)}-${date}.pdf`
}

function referenceFor(kind: EncargoPdfKind, meta: EncargoPdfMeta): string {
  if (kind === 'comanda') return ''
  if (kind === 'invoice') return meta.invoiceNumber?.trim() ?? ''
  const date = meta.encargoDate.replace(/\D/g, '')
  const time = meta.encargoTime.replace(/\D/g, '')
  return `PRES-${date}-${time}`
}

async function loadImageAsDataUrl(url: string): Promise<string | null> {
  if (!url || typeof window === 'undefined') return null
  try {
    const response = await fetch(url, { cache: 'force-cache' })
    if (!response.ok) return null
    const blob = await response.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function drawCompanyHeader(doc: PdfDoc, logoDataUrl: string | null) {
  const left = 14
  const top = 12
  const logoSize = 17

  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', left, top, logoSize, logoSize)
    } catch {
      // El documento sigue siendo válido aunque el logo no cargue.
    }
  }

  const textX = left + logoSize + 6
  doc.setTextColor(...TEXT)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(COMPANY.tradeName, textX, top + 4.5)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.3)
  doc.setTextColor(...MUTED)
  const detailY = top + 10
  const step = 4
  doc.text(`${COMPANY.legalName} · CIF ${COMPANY.cif}`, textX, detailY)
  doc.text(COMPANY.address, textX, detailY + step)
  doc.text(`Tel. ${COMPANY.phone} · ${COMPANY.email}`, textX, detailY + step * 2)

  doc.setDrawColor(...LINE)
  doc.setLineWidth(0.2)
  doc.line(left, top + logoSize + 5, 196, top + logoSize + 5)
}

function drawTitle(doc: PdfDoc, kind: EncargoPdfKind, meta: EncargoPdfMeta, y: number) {
  const copy = copyFor(meta.language)
  doc.setTextColor(...TEXT)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text((kind === 'invoice' ? copy.invoice : copy.quote).toUpperCase(), 14, y)

  const reference = referenceFor(kind, meta)
  if (reference) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...MUTED)
    doc.text(kind === 'invoice' ? `N.º ${reference}` : `Ref. ${reference}`, 196, y, { align: 'right' })
  }
}

function drawMetaInline(
  doc: PdfDoc,
  label: string,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
) {
  const normalizedLabel = label.toUpperCase()
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.8)
  doc.setTextColor(...MUTED)
  doc.text(normalizedLabel, x, y)

  const labelWidth = doc.getTextWidth(normalizedLabel)
  const valueRight = x + maxWidth
  const available = Math.max(8, maxWidth - labelWidth - 3)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...TEXT)

  let shown = value
  while (shown.length > 1 && doc.getTextWidth(shown) > available) {
    shown = shown.slice(0, -1)
  }
  if (shown !== value && shown.length > 2) shown = `${shown.slice(0, -1)}…`
  doc.text(shown, valueRight, y, { align: 'right' })
}

function drawMeta(doc: PdfDoc, meta: EncargoPdfMeta, y: number) {
  const copy = copyFor(meta.language)
  const colW = 44
  const xs = [14, 82, 150]
  const rowGap = 9
  const phone = formatDocumentPhone(meta.contactPhone) || '—'
  const guests = meta.guestCount != null && meta.guestCount > 0 ? String(meta.guestCount) : '—'

  drawMetaInline(doc, copy.client, meta.encargoName, xs[0], y, colW)
  drawMetaInline(doc, copy.contact, phone, xs[1], y, colW)
  drawMetaInline(doc, copy.date, meta.encargoDate, xs[2], y, colW)

  drawMetaInline(doc, copy.time, meta.encargoTime, xs[0], y + rowGap, colW)
  drawMetaInline(doc, copy.guests, guests, xs[1], y + rowGap, colW)
  drawMetaInline(doc, copy.vatApplied, '10%', xs[2], y + rowGap, colW)
}

function drawTotals(
  doc: PdfDoc,
  copy: ReturnType<typeof copyFor>,
  totalGross: number,
  startY: number,
) {
  const base = totalGross / (1 + IVA_RATE)
  const vat = totalGross - base
  const left = 140
  const right = 196
  const rowGap = 6

  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MUTED)
  doc.text(copy.taxableBase, left, startY)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...TEXT)
  doc.text(formatEuro(base), right, startY, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MUTED)
  doc.text('IVA (10%)', left, startY + rowGap)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...TEXT)
  doc.text(formatEuro(vat), right, startY + rowGap, { align: 'right' })

  const lineY = startY + rowGap + 3
  doc.setDrawColor(...BRAND)
  doc.setLineWidth(0.55)
  doc.line(left, lineY, right, lineY)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(...TEXT)
  doc.text(copy.total, left, startY + rowGap * 2 + 3)
  doc.setTextColor(...BRAND)
  doc.text(formatEuro(totalGross), right, startY + rowGap * 2 + 3, { align: 'right' })

  return startY + rowGap * 2 + 8
}

function drawPerPerson(
  doc: PdfDoc,
  copy: ReturnType<typeof copyFor>,
  totalGross: number,
  guestCount: number,
  y: number,
) {
  const base = totalGross / (1 + IVA_RATE) / guestCount
  const total = totalGross / guestCount
  const vat = total - base
  const x = 14
  const w = 182
  const h = 23

  doc.setFillColor(...SOFT_BRAND)
  doc.setDrawColor(203, 213, 216)
  doc.setLineWidth(0.2)
  doc.roundedRect(x, y, w, h, 3, 3, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...BRAND_DARK)
  doc.text(copy.perPerson.toUpperCase(), x + 5, y + 7)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.3)
  doc.setTextColor(...MUTED)
  doc.text(copy.perPersonNote(guestCount), x + 5, y + 13)

  const labels = [copy.base, 'IVA 10%', copy.total]
  const values = [formatEuro(base), formatEuro(vat), formatEuro(total)]
  const rightXs = [132, 160, 192]

  for (let i = 0; i < labels.length; i += 1) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.2)
    doc.setTextColor(...MUTED)
    doc.text(labels[i].toUpperCase(), rightXs[i], y + 7, { align: 'right' })

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(i === 2 ? 11 : 8.5)
    doc.setTextColor(...(i === 2 ? BRAND_DARK : TEXT))
    doc.text(values[i], rightXs[i], y + 14.5, { align: 'right' })
  }

  return y + h
}

function ensureSpace(doc: PdfDoc, y: number, needed: number): number {
  if (y + needed <= 282) return y
  doc.addPage()
  return 18
}

function drawKitchenHeader(doc: PdfDoc, logoDataUrl: string | null) {
  const left = 14
  const top = 12
  const logoSize = 17

  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', left, top, logoSize, logoSize)
    } catch {
      // El documento sigue siendo válido aunque el logo no cargue.
    }
  }

  const textX = left + logoSize + 6
  doc.setTextColor(...TEXT)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(COMPANY.tradeName, textX, top + logoSize / 2, { baseline: 'middle' })

  doc.setDrawColor(...LINE)
  doc.setLineWidth(0.2)
  doc.line(left, top + logoSize + 5, 196, top + logoSize + 5)
}

function drawKitchenMeta(doc: PdfDoc, meta: EncargoPdfMeta, y: number) {
  const copy = copyFor(meta.language)
  const guests = meta.guestCount != null && meta.guestCount > 0 ? String(meta.guestCount) : '—'
  const client = meta.encargoName.trim() || '—'
  const fields: Array<[string, string]> = [
    [copy.dateShort, meta.encargoDate],
    [copy.timeShort, meta.encargoTime],
    [copy.guests, guests],
    [copy.client, client],
  ]

  const labelSize = 6.8
  const valueSize = 9
  const gap = 2
  const between = 8
  const startX = 14
  const totalWidth = 182
  const columnWidth = (totalWidth - between * (fields.length - 1)) / fields.length

  fields.forEach(([label, value], index) => {
    const x = startX + index * (columnWidth + between)
    const labelText = label.toUpperCase()

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(labelSize)
    doc.setTextColor(...MUTED)
    const labelWidth = doc.getTextWidth(labelText)
    doc.text(labelText, x, y)

    // Trunca el valor si supera el ancho de su columna.
    const available = Math.max(4, columnWidth - labelWidth - gap)
    doc.setFontSize(valueSize)
    let shownValue = value
    while (shownValue.length > 1 && doc.getTextWidth(shownValue) > available) {
      shownValue = shownValue.slice(0, -1)
    }
    if (shownValue !== value && shownValue.length > 3) {
      shownValue = `${shownValue.slice(0, -1)}…`
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(valueSize)
    doc.setTextColor(...TEXT)
    doc.text(shownValue, x + labelWidth + gap, y)
  })
}

function drawObservations(
  doc: PdfDoc,
  copy: ReturnType<typeof copyFor>,
  observations: string | null | undefined,
  y: number,
): number {
  const text = String(observations ?? '').trim()
  if (!text) return y

  const x = 14
  const w = 182
  const lines = doc.splitTextToSize(text, w - 10) as string[]
  const lineHeight = 4.8
  const h = 13 + lines.length * lineHeight
  const top = ensureSpace(doc, y, h + 4)

  doc.setFillColor(...SOFT_BRAND)
  doc.setDrawColor(203, 213, 216)
  doc.setLineWidth(0.2)
  doc.roundedRect(x, top, w, h, 3, 3, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...BRAND_DARK)
  doc.text(copy.observations.toUpperCase(), x + 5, top + 7)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...TEXT)
  doc.text(lines, x + 5, top + 13)

  return top + h
}

export function createEncargoPdfPreviewWindow(): Window | null {
  if (typeof window === 'undefined') return null
  const preview = window.open('', '_blank')
  if (!preview) return null

  try {
    preview.document.open()
    preview.document.write(
      '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Generando PDF…</title></head><body style="margin:0;display:grid;place-items:center;min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#475569;background:#fff"><div style="font-size:15px;font-weight:600">Generando PDF…</div></body></html>'
    )
    preview.document.close()
  } catch {
    // Algunos navegadores no permiten escribir en la pestaña recién abierta.
  }

  return preview
}

export function openEncargoPdf(result: EncargoPdfResult, previewWindow?: Window | null): void {
  if (typeof window === 'undefined') return
  const url = URL.createObjectURL(result.blob)

  if (previewWindow && !previewWindow.closed) {
    try {
      previewWindow.location.href = url
      window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000)
      return
    } catch {
      // Fallback a descarga/apertura directa.
    }
  }

  const anchor = document.createElement('a')
  anchor.href = url
  anchor.target = '_blank'
  anchor.rel = 'noopener'
  anchor.download = result.filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000)
}

export async function generateEncargoPdf(
  kind: EncargoPdfKind,
  meta: EncargoPdfMeta,
  items: EventOrderItem[],
): Promise<EncargoPdfResult> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])

  const copy = copyFor(meta.language)
  const logoDataUrl = await loadImageAsDataUrl(meta.logoUrl)
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const margin = 14
  const contentWidth = 182

  if (kind === 'comanda') {
    drawKitchenHeader(doc, logoDataUrl)
    drawKitchenMeta(doc, meta, 40)

    const body = items.map((item) => {
      const quantity = Math.max(0, Number(item.quantity) || 0)
      return [
        productLabel(item),
        productNote(item),
        quantity > 0 ? String(quantity) : '',
      ]
    })

    const tableStartY = 60
    let headerDrawnOnPage = -1

    autoTable(doc, {
      startY: tableStartY,
      margin: { left: margin, right: margin, top: 15, bottom: 15 },
      head: [[copy.product, copy.note, copy.qty]],
      body,
      theme: 'plain',
      styles: {
        font: 'helvetica',
        fontSize: 9,
        textColor: TEXT,
        cellPadding: { top: 3.6, bottom: 3.6, left: 3, right: 3 },
        valign: 'middle',
        lineWidth: 0,
      },
      headStyles: {
        fillColor: false as unknown as [number, number, number],
        textColor: WHITE,
        fontStyle: 'bold',
        fontSize: 6.8,
        cellPadding: { top: 3.1, bottom: 3.1, left: 3, right: 3 },
        lineWidth: 0,
      },
      alternateRowStyles: { fillColor: SOFT },
      columnStyles: {
        0: { cellWidth: 'auto', fontStyle: 'bold' },
        1: { cellWidth: 72, textColor: MUTED, fontSize: 8 },
        2: { cellWidth: 20, halign: 'right', fontStyle: 'bold' },
      },
      willDrawCell: (data) => {
        if (data.section !== 'head' || data.column.index !== 0) return
        const pageNumber = data.pageNumber
        if (headerDrawnOnPage === pageNumber) return
        headerDrawnOnPage = pageNumber

        const x = data.cell.x
        const y = data.cell.y
        const h = data.cell.height
        doc.setFillColor(...BRAND)
        doc.roundedRect(x, y, contentWidth, h, 2.8, 2.8, 'F')
        doc.rect(x, y + h / 2, contentWidth, h / 2, 'F')
      },
    })

    const kitchenDoc = doc as PdfDoc & { lastAutoTable?: { finalY?: number } }
    const cursorY = Number(kitchenDoc.lastAutoTable?.finalY ?? tableStartY) + 10
    drawObservations(doc, copy, meta.observations, cursorY)

    doc.setProperties({
      title: `${copy.comanda} - ${meta.encargoName}`,
      subject: copy.comanda,
      author: COMPANY.tradeName,
      creator: 'Marbella App',
    })

    return {
      blob: doc.output('blob'),
      filename: filenameFor(kind, meta),
    }
  }

  drawCompanyHeader(doc, logoDataUrl)
  drawTitle(doc, kind, meta, 39)
  drawMeta(doc, meta, 49)

  let totalGross = 0
  const body = items.map((item) => {
    const quantity = Math.max(0, Number(item.quantity) || 0)
    const unit = Math.max(0, Number(item.unit_price) || 0)
    const line = quantity * unit
    totalGross += line
    return [
      productLabel(item),
      productNote(item),
      quantity > 0 ? String(quantity) : '',
      formatEuro(unit),
      formatEuro(line),
    ]
  })

  const tableStartY = 67
  let headerDrawnOnPage = -1

  autoTable(doc, {
    startY: tableStartY,
    margin: { left: margin, right: margin, top: 15, bottom: 15 },
    head: [[copy.product, '', copy.qty, copy.unitPrice, copy.amount]],
    body,
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      textColor: TEXT,
      cellPadding: { top: 3.2, bottom: 3.2, left: 3, right: 3 },
      valign: 'middle',
      lineWidth: 0,
    },
    headStyles: {
      fillColor: false as unknown as [number, number, number],
      textColor: WHITE,
      fontStyle: 'bold',
      fontSize: 6.8,
      cellPadding: { top: 3.1, bottom: 3.1, left: 3, right: 3 },
      lineWidth: 0,
    },
    alternateRowStyles: { fillColor: SOFT },
    columnStyles: {
      0: { cellWidth: 'auto', fontStyle: 'bold' },
      1: { cellWidth: 34, textColor: MUTED, fontSize: 8 },
      2: { cellWidth: 17, halign: 'right', fontStyle: 'bold' },
      3: { cellWidth: 25, halign: 'right', fontStyle: 'bold' },
      4: { cellWidth: 27, halign: 'right', fontStyle: 'bold' },
    },
    willDrawCell: (data) => {
      if (data.section !== 'head' || data.column.index !== 0) return
      const pageNumber = data.pageNumber
      if (headerDrawnOnPage === pageNumber) return
      headerDrawnOnPage = pageNumber

      const x = data.cell.x
      const y = data.cell.y
      const h = data.cell.height
      doc.setFillColor(...BRAND)
      doc.roundedRect(x, y, contentWidth, h, 2.8, 2.8, 'F')
      doc.rect(x, y + h / 2, contentWidth, h / 2, 'F')
    },
  })

  const autoTableDoc = doc as PdfDoc & { lastAutoTable?: { finalY?: number } }
  let cursorY = Number(autoTableDoc.lastAutoTable?.finalY ?? tableStartY) + 8
  cursorY = ensureSpace(doc, cursorY, kind === 'quote' ? 56 : 34)
  cursorY = drawTotals(doc, copy, totalGross, cursorY)

  if (kind === 'quote' && meta.guestCount != null && meta.guestCount > 0) {
    cursorY += 5
    cursorY = ensureSpace(doc, cursorY, 32)
    cursorY = drawPerPerson(doc, copy, totalGross, meta.guestCount, cursorY)
    cursorY += 7
    doc.setDrawColor(...LINE)
    doc.setLineWidth(0.2)
    doc.line(14, cursorY, 196, cursorY)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.8)
    doc.setTextColor(...MUTED)
    doc.text(copy.quoteLegal, 105, cursorY + 5, { align: 'center' })
  } else if (kind === 'invoice') {
    cursorY += 6
    cursorY = ensureSpace(doc, cursorY, 18)
    doc.setDrawColor(...LINE)
    doc.setLineWidth(0.2)
    doc.line(14, cursorY, 196, cursorY)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...BRAND)
    doc.text(copy.thanks, 105, cursorY + 8, { align: 'center' })
  }

  doc.setProperties({
    title: `${kind === 'invoice' ? copy.invoice : copy.quote} - ${meta.encargoName}`,
    subject: kind === 'invoice' ? copy.invoice : copy.quote,
    author: COMPANY.tradeName,
    creator: 'Marbella App',
  })

  return {
    blob: doc.output('blob'),
    filename: filenameFor(kind, meta),
  }
}
