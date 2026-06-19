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
      const note = it.notes?.trim()
      const noteCell = note ? escapeHtml(note) : '&nbsp;'
      const qty = it.quantity > 0 ? String(it.quantity) : ''
      return `<tr>
        <td class="col-product">${escapeHtml(it.name)}</td>
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
