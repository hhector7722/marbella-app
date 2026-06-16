'use client'

import { useCallback, useRef } from 'react'
import { Pencil, Printer, X } from 'lucide-react'

import type { EventOrderItem } from '@/app/dashboard/eventos/[eventId]/pedidos/PedidosEventoClient'
import { cn } from '@/lib/utils'
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking'

function formatEncargoPrintDate(ymd: string) {
  const parts = ymd.slice(0, 10).split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return ymd
  const [y, m, d] = parts
  return `${d}/${String(m).padStart(2, '0')}/${String(y % 100).padStart(2, '0')}`
}

type EncargoPrintMeta = {
  encargoDate: string
  encargoTime: string
  encargoName: string
  contactPhone: string | null
}

function buildPrintHtml(meta: EncargoPrintMeta, items: EventOrderItem[]) {
  const contactValue = meta.contactPhone?.trim() ? escapeHtml(meta.contactPhone.trim()) : '&nbsp;'
  const rows = items
    .map((it) => {
      const note = it.notes?.trim()
      const noteCell = note
        ? escapeHtml(note)
        : '&nbsp;'
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
    body {
      font-family: system-ui, sans-serif;
      margin: 0;
      padding: 2mm 3mm;
      color: #000000;
      background: #ffffff;
    }
    .doc-header { margin: 0 0 20px; }
    h1 { font-size: 16px; margin: 0; text-align: left; font-weight: 800; color: #000000; }
    .doc-meta { margin: 0 0 24px; }
    .meta-row {
      display: table;
      width: 100%;
      table-layout: auto;
      margin: 0;
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
    .meta-item:last-child { padding-right: 0; }
    .meta-label { font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #52525b; margin-right: 4px; }
    .meta-value { font-weight: 800; color: #000000; }
    .doc-table { margin: 0; }
    table { width: 100%; border-collapse: collapse; border: none; color: #000000; table-layout: auto; }
    th {
      background: #fafafa;
      font-size: 8px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #52525b;
      padding: 8px 8px;
      text-align: left;
      white-space: nowrap;
    }
    th.col-qty { text-align: center; width: 1%; }
    th.col-note { width: 1%; }
    td {
      padding: 12px 8px;
      color: #000000;
      vertical-align: middle;
      white-space: nowrap;
    }
    td.col-product { font-weight: 700; text-align: left; }
    td.col-note {
      text-align: left;
      font-size: 12px;
      font-weight: 600;
      text-transform: lowercase;
      padding-left: 8px;
      padding-right: 8px;
    }
    td.col-qty { text-align: center; font-weight: 700; font-family: monospace; width: 1%; }
    tr + tr { border-top: 1px solid #e4e4e7; }
    @media print {
      html, body {
        margin: 0;
        padding: 2mm 3mm;
        background: #ffffff !important;
        color: #000000 !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      h1, .meta-value, td, th, span { color: #000000 !important; }
      .meta-label { color: #52525b !important; }
    }
  </style>
</head>
<body>
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
    <table>
      <thead>
        <tr><th>Producto</th><th class="col-note" aria-hidden="true">&nbsp;</th><th class="col-qty">Cantidad</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </section>
</body>
</html>`
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
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

function printHtmlDocument(html: string) {
  const runPrint = (target: Window, onDone?: () => void) => {
    window.setTimeout(() => {
      try {
        target.focus()
        target.print()
      } finally {
        window.setTimeout(() => onDone?.(), 500)
      }
    }, 200)
  }

  const writeAndPrint = (target: Window, onDone?: () => void) => {
    target.document.open()
    target.document.write(html)
    target.document.close()
    runPrint(target, onDone)
  }

  // iOS: blob/iframe suele imprimir la página padre en blanco; ventana aislada con el HTML.
  if (isIosDevice()) {
    const popup = window.open('about:blank', '_blank')
    if (popup) {
      writeAndPrint(popup)
      return
    }
  }

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  const win = iframe.contentWindow
  const doc = win?.document
  if (!doc || !win) {
    iframe.remove()
    return
  }

  writeAndPrint(win, () => {
    try {
      iframe.remove()
    } catch {
      /* iframe ya eliminado */
    }
  })
}

export function EncargoOrderViewModal({
  encargoName,
  encargoDate,
  encargoTime,
  contactPhone,
  items,
  onClose,
  onEdit,
}: {
  encargoName: string
  encargoDate: string
  encargoTime: string
  contactPhone?: string | null
  items: EventOrderItem[]
  onClose: () => void
  onEdit: () => void
}) {
  const tableRef = useRef<HTMLDivElement>(null)

  useModalUsageTracking({
    open: true,
    usageId: 'encargo-order-view',
    usageLabel: 'Ver pedido encargo',
  })

  const handlePrint = useCallback(() => {
    const html = buildPrintHtml(
      {
        encargoDate: formatEncargoPrintDate(encargoDate),
        encargoTime,
        encargoName,
        contactPhone: contactPhone ?? null,
      },
      items
    )
    printHtmlDocument(html)
  }, [encargoName, encargoDate, encargoTime, contactPhone, items])

  return (
    <div
      className="fixed inset-0 z-[10060] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="presentation"
    >
      <div
        className={cn(
          'bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden',
          'w-[min(26rem,calc(100vw-3rem))]',
          'max-h-[min(30rem,calc(100dvh-4rem))]',
          'animate-in zoom-in-95 duration-200'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#36606F] px-4 py-3 text-white shrink-0 flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/80">Pedido</p>
            <h3 className="text-base font-black truncate">
              {encargoTime} · {encargoName}
            </h3>
          </div>
          <button
            type="button"
            onClick={handlePrint}
            disabled={items.length === 0}
            className="shrink-0 min-h-12 min-w-12 flex items-center justify-center rounded-xl hover:bg-white/10 disabled:opacity-40"
            aria-label="Imprimir pedido"
          >
            <Printer size={18} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="shrink-0 min-h-12 min-w-12 flex items-center justify-center rounded-xl hover:bg-white/10"
            aria-label="Editar encargo"
          >
            <Pencil size={18} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 min-h-12 min-w-12 flex items-center justify-center rounded-xl hover:bg-white/10"
            aria-label="Cerrar"
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        <div ref={tableRef} className="flex-1 overflow-y-auto min-h-0 px-4 py-3">
          {items.length === 0 ? (
            <p className="py-10 text-center text-xs font-semibold text-zinc-500">
              Sin productos en el pedido.
            </p>
          ) : (
            <div className="overflow-x-auto border border-zinc-100 rounded-xl">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50">
                    <th className="px-3 py-2.5 font-black uppercase text-[9px] tracking-wider text-zinc-500">
                      Producto
                    </th>
                    <th className="px-3 py-2.5 text-left" aria-hidden="true">
                      &nbsp;
                    </th>
                    <th className="px-3 py-2.5 font-black uppercase text-[9px] tracking-wider text-zinc-500 w-20 text-center">
                      Cantidad
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, index) => {
                    const note = it.notes?.trim()
                    return (
                      <tr key={`${it.product_id}-${index}`} className="border-t border-zinc-100">
                        <td className="px-3 py-2.5 font-bold text-zinc-800 align-middle whitespace-nowrap">
                          {it.name}
                        </td>
                        <td className="px-3 py-2.5 text-left align-middle text-[14px] font-semibold text-zinc-600 lowercase whitespace-nowrap">
                          {note || ' '}
                        </td>
                        <td className="px-3 py-2.5 font-mono font-bold text-zinc-700 text-center tabular-nums align-middle">
                          {it.quantity > 0 ? it.quantity : ' '}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
