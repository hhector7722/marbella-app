import type { EventOrderItem } from '@/app/dashboard/eventos/[eventId]/pedidos/PedidosEventoClient'

export type EncargoPrintMeta = {
  encargoDate: string
  encargoTime: string
  encargoName: string
  contactPhone: string | null
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function isIosDevice() {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

function isMobileDevice() {
  if (typeof navigator === 'undefined') return false
  return isIosDevice() || /Android/i.test(navigator.userAgent)
}

export function buildEncargoPrintHtml(meta: EncargoPrintMeta, items: EventOrderItem[]) {
  const contactValue = meta.contactPhone?.trim() ? escapeHtml(meta.contactPhone.trim()) : '&nbsp;'
  const rows = items
    .map((it) => {
      const note = it.notes?.trim() ?? ''
      const isHalfNote = /^(1\/2|½|medio|mitad|half)$/i.test(note)
      let productLabel = String(it.name ?? '').trim()
      productLabel = productLabel
        .replace(/^1\/2\s*·\s*/i, '1/2 ')
        .replace(/^½\s*·\s*/i, '1/2 ')
      if (isHalfNote && !/^(1\/2|½)\b/i.test(productLabel)) {
        productLabel = `1/2 ${productLabel}`
      }
      const noteCell = note && !isHalfNote ? escapeHtml(note) : '&nbsp;'
      const qty = it.quantity > 0 ? String(it.quantity) : ''
      return `<tr>
        <td class="col-product">${escapeHtml(productLabel)}</td>
        <td class="col-note">${noteCell}</td>
        <td class="col-qty">${qty}</td>
      </tr>`
    })
    .join('')

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pedido por encargo</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: auto; margin: 4mm; }
    html, body {
      margin: 0;
      padding: 0;
      height: auto;
      min-height: 0;
      color: #000000;
      background: #ffffff;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .print-doc { padding: 2mm 3mm; }
    .doc-header { margin: 0 0 16px; }
    h1 { font-size: 16px; margin: 0; font-weight: 800; color: #000000; }
    .doc-meta { margin: 0 0 20px; }
    .meta-row {
      display: table;
      width: 100%;
      table-layout: auto;
      font-size: 10px;
      line-height: 1.2;
      white-space: nowrap;
    }
    .meta-item {
      display: table-cell;
      padding-right: 10px;
      vertical-align: baseline;
      white-space: nowrap;
    }
    .meta-label {
      font-size: 8px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #52525b;
      margin-right: 4px;
    }
    .meta-value { font-weight: 800; color: #000000; }
    table.order-table {
      width: 100%;
      border-collapse: collapse;
      color: #000000;
      table-layout: auto;
    }
    th {
      background: #fafafa;
      font-size: 8px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #52525b;
      padding: 8px;
      text-align: left;
      white-space: nowrap;
    }
    th.col-product, td.col-product {
      width: auto;
      font-weight: 700;
      text-align: left;
      white-space: nowrap;
    }
    th.col-note, td.col-note {
      width: auto;
      text-align: left;
      white-space: nowrap;
      font-size: 12px;
      font-weight: 600;
      text-transform: lowercase;
      padding-left: 10px;
      padding-right: 10px;
    }
    th.col-qty, td.col-qty {
      width: 1%;
      text-align: center;
      font-weight: 700;
      font-family: monospace;
      white-space: nowrap;
    }
    td {
      padding: 12px 8px;
      color: #000000;
      vertical-align: middle;
    }
    tr + tr { border-top: 1px solid #e4e4e7; }
    @media print {
      html, body {
        height: auto !important;
        min-height: 0 !important;
        overflow: visible !important;
        background: #ffffff !important;
        color: #000000 !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .print-doc {
        padding: 0;
        page-break-after: avoid;
      }
      table.order-table { page-break-inside: avoid; }
      h1, .meta-value, td, th, span { color: #000000 !important; }
      .meta-label { color: #52525b !important; }
    }
  </style>
</head>
<body>
  <div class="print-doc">
    <header class="doc-header">
      <h1>Pedido por encargo</h1>
    </header>
    <section class="doc-meta">
      <div class="meta-row">
        <div class="meta-item">
          <span class="meta-label">Fecha</span><span class="meta-value">${escapeHtml(meta.encargoDate)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Hora</span><span class="meta-value">${escapeHtml(meta.encargoTime)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Nombre</span><span class="meta-value">${escapeHtml(meta.encargoName)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Contacto</span><span class="meta-value">${contactValue}</span>
        </div>
      </div>
    </section>
    <section class="doc-table">
      <table class="order-table">
        <colgroup>
          <col class="col-product" />
          <col class="col-note" />
          <col class="col-qty" />
        </colgroup>
        <thead>
          <tr>
            <th class="col-product">Producto</th>
            <th class="col-note" aria-hidden="true">&nbsp;</th>
            <th class="col-qty">Cantidad</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  </div>
</body>
</html>`
}

const IVA_RATE = 0.1

const INVOICE_COMPANY = {
  tradeName: 'Bar La Marbella',
  legalName: 'Fogo Torrat S.L.',
  cif: 'B-09761628',
  address: 'Av. Litoral 86, 08005 Barcelona',
  phone: '647 229 309',
  email: 'fogotorrat@gmail.com',
} as const

function formatEuro(amount: number): string {
  if (!Number.isFinite(amount)) return '0.00€'
  return `${amount.toFixed(2)}€`
}

function productLabelForPrint(it: EventOrderItem): string {
  const note = it.notes?.trim() ?? ''
  const isHalfNote = /^(1\/2|½|medio|mitad|half)$/i.test(note)
  let productLabel = String(it.name ?? '').trim()
  productLabel = productLabel
    .replace(/^1\/2\s*·\s*/i, '1/2 ')
    .replace(/^½\s*·\s*/i, '1/2 ')
  if (isHalfNote && !/^(1\/2|½)\b/i.test(productLabel)) {
    productLabel = `1/2 ${productLabel}`
  }
  return productLabel
}

export type EncargoInvoiceMeta = EncargoPrintMeta & {
  /** URL absoluta del logo (necesaria en el iframe de impresión). */
  logoUrl: string
  guestCount?: number | null
  /** Número / referencia visible en la factura. */
  invoiceRef?: string | null
}

/**
 * Factura simplificada para el cliente del pedido (IVA hostelería 10%, precios con IVA incluido).
 */
export function buildEncargoInvoiceHtml(meta: EncargoInvoiceMeta, items: EventOrderItem[]) {
  const contactValue = meta.contactPhone?.trim() ? escapeHtml(meta.contactPhone.trim()) : '&nbsp;'
  const guestValue =
    meta.guestCount != null && meta.guestCount > 0 ? String(meta.guestCount) : '&nbsp;'

  let totalGross = 0
  const rows = items
    .map((it) => {
      const qty = Math.max(0, Number(it.quantity) || 0)
      const unit = Math.max(0, Number(it.unit_price) || 0)
      const line = unit * qty
      totalGross += line
      const note = it.notes?.trim() ?? ''
      const isHalfNote = /^(1\/2|½|medio|mitad|half)$/i.test(note)
      const noteCell = note && !isHalfNote ? escapeHtml(note) : '&nbsp;'
      return `<tr>
        <td class="col-product">${escapeHtml(productLabelForPrint(it))}</td>
        <td class="col-note">${noteCell}</td>
        <td class="col-qty">${qty > 0 ? String(qty) : ''}</td>
        <td class="col-unit">${formatEuro(unit)}</td>
        <td class="col-amount">${formatEuro(line)}</td>
      </tr>`
    })
    .join('')

  // Precios de carta = PVP con IVA incluido → desglose inverso al 10%.
  const baseImponible = totalGross / (1 + IVA_RATE)
  const ivaAmount = totalGross - baseImponible
  const invoiceRef =
    meta.invoiceRef?.trim() ||
    `ENC-${meta.encargoDate.replace(/\D/g, '')}-${meta.encargoTime.replace(/\D/g, '')}`

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Factura — ${escapeHtml(INVOICE_COMPANY.tradeName)}</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: auto; margin: 8mm; }
    html, body {
      margin: 0;
      padding: 0;
      height: auto;
      min-height: 0;
      color: #18181b;
      background: #ffffff;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    .print-doc { padding: 4mm 3mm; max-width: 180mm; margin: 0 auto; }
    .brand {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 14px;
      border-bottom: 2px solid #36606F;
      padding-bottom: 12px;
    }
    .brand-logo {
      width: 48px;
      height: 48px;
      object-fit: contain;
      flex-shrink: 0;
    }
    .brand-text { min-width: 0; flex: 1; }
    .brand-name {
      margin: 0;
      font-size: 18px;
      font-weight: 800;
      color: #36606F;
      letter-spacing: -0.02em;
    }
    .brand-legal {
      margin: 2px 0 0;
      font-size: 10px;
      font-weight: 600;
      color: #52525b;
    }
    .brand-details {
      margin: 6px 0 0;
      font-size: 9px;
      line-height: 1.45;
      color: #3f3f46;
    }
    .doc-title-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
      margin: 0 0 12px;
    }
    .doc-title {
      margin: 0;
      font-size: 15px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #18181b;
    }
    .doc-ref {
      font-size: 10px;
      font-weight: 700;
      color: #52525b;
      white-space: nowrap;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px 16px;
      margin: 0 0 16px;
      font-size: 11px;
    }
    .meta-block label {
      display: block;
      font-size: 8px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #71717a;
      margin-bottom: 2px;
    }
    .meta-block .value { font-weight: 700; color: #18181b; }
    table.invoice-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: auto;
      margin-bottom: 14px;
    }
    th {
      background: #f4f4f5;
      font-size: 8px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #52525b;
      padding: 7px 6px;
      text-align: left;
      border-bottom: 1px solid #e4e4e7;
    }
    td {
      padding: 8px 6px;
      font-size: 11px;
      vertical-align: middle;
      border-bottom: 1px solid #f4f4f5;
    }
    th.col-product, td.col-product { font-weight: 700; text-align: left; }
    th.col-note, td.col-note {
      font-size: 10px;
      font-weight: 600;
      color: #52525b;
      text-transform: lowercase;
    }
    th.col-qty, td.col-qty,
    th.col-unit, td.col-unit,
    th.col-amount, td.col-amount {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      width: 1%;
    }
    td.col-qty, td.col-unit, td.col-amount { font-weight: 700; font-family: ui-monospace, monospace; }
    .totals {
      width: 100%;
      max-width: 220px;
      margin-left: auto;
      margin-bottom: 18px;
      font-size: 11px;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 4px 0;
      color: #3f3f46;
    }
    .totals-row span:last-child {
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      font-family: ui-monospace, monospace;
    }
    .totals-row.iva-rate { font-size: 10px; color: #71717a; }
    .totals-row.total {
      margin-top: 4px;
      padding-top: 8px;
      border-top: 2px solid #36606F;
      font-size: 13px;
      font-weight: 800;
      color: #18181b;
    }
    .totals-row.total span:last-child { color: #36606F; }
    .thanks {
      text-align: center;
      margin-top: 20px;
      padding-top: 14px;
      border-top: 1px dashed #d4d4d8;
    }
    .thanks p {
      margin: 0;
      font-size: 13px;
      font-weight: 800;
      color: #36606F;
    }
    .thanks .sub {
      margin-top: 4px;
      font-size: 10px;
      font-weight: 600;
      color: #71717a;
    }
    .legal-note {
      margin-top: 10px;
      font-size: 8px;
      color: #a1a1aa;
      text-align: center;
      line-height: 1.4;
    }
    @media print {
      html, body {
        height: auto !important;
        min-height: 0 !important;
        overflow: visible !important;
        background: #ffffff !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .print-doc { padding: 0; page-break-after: avoid; }
      table.invoice-table { page-break-inside: avoid; }
      th { background: #f4f4f5 !important; }
    }
  </style>
</head>
<body>
  <div class="print-doc">
    <header class="brand">
      <img class="brand-logo" src="${escapeHtml(meta.logoUrl)}" alt="${escapeHtml(INVOICE_COMPANY.tradeName)}" />
      <div class="brand-text">
        <p class="brand-name">${escapeHtml(INVOICE_COMPANY.tradeName)}</p>
        <p class="brand-legal">${escapeHtml(INVOICE_COMPANY.legalName)} · CIF ${escapeHtml(INVOICE_COMPANY.cif)}</p>
        <p class="brand-details">
          ${escapeHtml(INVOICE_COMPANY.address)}<br />
          Tel. ${escapeHtml(INVOICE_COMPANY.phone)} · ${escapeHtml(INVOICE_COMPANY.email)}
        </p>
      </div>
    </header>

    <div class="doc-title-row">
      <h1 class="doc-title">Factura</h1>
      <span class="doc-ref">Ref. ${escapeHtml(invoiceRef)}</span>
    </div>

    <section class="meta-grid">
      <div class="meta-block">
        <label>Cliente</label>
        <div class="value">${escapeHtml(meta.encargoName)}</div>
      </div>
      <div class="meta-block">
        <label>Contacto</label>
        <div class="value">${contactValue}</div>
      </div>
      <div class="meta-block">
        <label>Fecha reserva</label>
        <div class="value">${escapeHtml(meta.encargoDate)}</div>
      </div>
      <div class="meta-block">
        <label>Hora reserva</label>
        <div class="value">${escapeHtml(meta.encargoTime)}</div>
      </div>
      <div class="meta-block">
        <label>Comensales</label>
        <div class="value">${guestValue}</div>
      </div>
      <div class="meta-block">
        <label>IVA aplicado</label>
        <div class="value">10% (hostelería)</div>
      </div>
    </section>

    <table class="invoice-table">
      <thead>
        <tr>
          <th class="col-product">Producto</th>
          <th class="col-note" aria-hidden="true">&nbsp;</th>
          <th class="col-qty">Cant.</th>
          <th class="col-unit">P. unit.</th>
          <th class="col-amount">Importe</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals">
      <div class="totals-row">
        <span>Base imponible</span>
        <span>${formatEuro(baseImponible)}</span>
      </div>
      <div class="totals-row iva-rate">
        <span>IVA (10%)</span>
        <span>${formatEuro(ivaAmount)}</span>
      </div>
      <div class="totals-row total">
        <span>Total</span>
        <span>${formatEuro(totalGross)}</span>
      </div>
    </div>

    <footer class="thanks">
      <p>¡Gracias por vuestra visita!</p>
      <p class="sub">Os esperamos pronto en Bar La Marbella</p>
      <p class="legal-note">
        Factura simplificada. Precios con IVA incluido. Tipo impositivo 10% (hostelería).
      </p>
    </footer>
  </div>
</body>
</html>`
}

/**
 * Imprime HTML aislado del SPA. Safari iOS no imprime bien PDFs en iframe ni
 * window.print() sobre el documento principal (captura la UI o sale en blanco).
 */
export function printEncargoHtml(html: string): Promise<void> {
  const mobile = isMobileDevice()

  return new Promise((resolve) => {
    const iframe = document.createElement('iframe')
    iframe.setAttribute('title', 'Imprimir pedido')
    iframe.setAttribute('aria-hidden', 'true')

    if (mobile) {
      // iOS necesita viewport real para maquetar; clip-path evita el flash a pantalla completa.
      iframe.style.cssText =
        'position:fixed;left:0;top:0;width:100%;height:100%;border:0;margin:0;padding:0;z-index:2147483647;clip-path:inset(100%);pointer-events:none;'
    } else {
      iframe.style.cssText =
        'position:fixed;right:0;bottom:0;width:0;height:0;border:0;margin:0;padding:0;'
    }

    document.body.appendChild(iframe)

    let done = false
    let started = false

    const finish = () => {
      if (done) return
      done = true
      try {
        iframe.remove()
      } catch {
        /* iframe ya eliminado */
      }
      resolve()
    }

    const runPrint = () => {
      if (started || done) return
      const win = iframe.contentWindow
      if (!win) {
        finish()
        return
      }
      started = true
      window.setTimeout(() => {
        try {
          win.focus()
          win.print()
        } finally {
          win.addEventListener('afterprint', finish, { once: true })
          window.setTimeout(finish, 60_000)
        }
      }, mobile ? 600 : 80)
    }

    const doc = iframe.contentDocument
    if (!doc) {
      finish()
      return
    }

    doc.open()
    doc.write(html)
    doc.close()

    iframe.addEventListener('load', runPrint, { once: true })
    window.setTimeout(runPrint, mobile ? 2000 : 400)
  })
}
