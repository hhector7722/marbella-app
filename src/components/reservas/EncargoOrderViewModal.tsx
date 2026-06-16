'use client'

import { Fragment, useCallback, useRef } from 'react'
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
      const qty = it.quantity > 0 ? String(it.quantity) : ''
      const noteRow = note
        ? `<tr><td colspan="2" style="padding:0 12px 10px 28px;font-size:11px;color:#52525b;text-transform:lowercase;">${escapeHtml(note)}</td></tr>`
        : ''
      return `<tr>
        <td style="padding:10px 12px;font-weight:700;color:#18181b;">${escapeHtml(it.name)}</td>
        <td style="padding:10px 12px;text-align:center;font-weight:700;font-family:monospace;">${qty}</td>
      </tr>${noteRow}`
    })
    .join('')

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pedido</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: auto; margin: 8mm 10mm 0 10mm; }
    body {
      font-family: system-ui, sans-serif;
      margin: 0;
      padding: 4mm 0 18mm;
      color: #18181b;
      background: #fff;
    }
    h1 { font-size: 18px; margin: 0 0 14px; text-align: left; font-weight: 800; }
    .meta-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 10px;
      margin: 0 0 18px;
      font-size: 11px;
      line-height: 1.35;
    }
    .meta-item {
      flex: 1 1 0;
      min-width: 0;
      display: flex;
      align-items: baseline;
      justify-content: center;
      gap: 6px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .meta-label { display: inline; font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: #71717a; }
    .meta-value { display: inline; font-weight: 800; color: #18181b; overflow: hidden; text-overflow: ellipsis; }
    table { width: 100%; border-collapse: collapse; border: none; }
    th { background: #fafafa; font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: #71717a; padding: 10px 12px; text-align: left; }
    th:last-child { text-align: center; width: 72px; }
    tr + tr { border-top: 1px solid #f4f4f5; }
    .print-chrome-mask {
      display: none;
    }
    @media print {
      html, body { margin: 0; padding: 4mm 0 18mm; background: #fff !important; }
      h1 { margin-top: 0; }
      .print-chrome-mask {
        display: block;
        position: fixed;
        left: 0;
        right: 0;
        background: #fff;
        z-index: 2147483647;
        pointer-events: none;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .print-chrome-mask--top { top: 0; height: 9mm; }
      .print-chrome-mask--bottom {
        bottom: 0;
        height: 16mm;
        color: #fff;
        font-size: 1px;
        line-height: 1;
      }
    }
  </style>
</head>
<body>
  <div class="print-chrome-mask print-chrome-mask--top" aria-hidden="true"></div>
  <div class="print-chrome-mask print-chrome-mask--bottom" aria-hidden="true">&nbsp;</div>
  <h1>Pedido encargado</h1>
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
  <table>
    <thead>
      <tr><th>Producto</th><th>Cantidad</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
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

    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    // iOS/Safari: iframe 0×0 suele imprimir en blanco; oculto pero con tamaño real.
    iframe.style.cssText =
      'position:fixed;left:0;top:0;width:100%;height:100%;border:0;opacity:0;pointer-events:none;z-index:-1;'
    document.body.appendChild(iframe)

    const win = iframe.contentWindow
    const doc = win?.document
    if (!doc || !win) {
      iframe.remove()
      return
    }

    doc.open()
    doc.write(html)
    doc.close()

    const cleanup = () => {
      try {
        iframe.remove()
      } catch {
        /* iframe ya eliminado */
      }
    }

    // Una sola llamada a print() tras maquetar (evita aviso de impresión automática en Safari).
    window.setTimeout(() => {
      try {
        win.focus()
        win.print()
      } finally {
        win.addEventListener('afterprint', cleanup, { once: true })
        window.setTimeout(cleanup, 30_000)
      }
    }, 100)
  }, [encargoName, encargoDate, encargoTime, contactPhone, items])

  return (
    <div
      className="fixed inset-0 z-[10060] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="presentation"
    >
      <div
        className={cn(
          'bg-white rounded-[2rem] shadow-2xl flex flex-col overflow-hidden',
          'w-full max-w-[min(36rem,calc(100vw-2rem))]',
          'max-h-[calc(100dvh-2rem)]',
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
                    <th className="px-3 py-2.5 font-black uppercase text-[9px] tracking-wider text-zinc-500 w-20 text-center">
                      Cantidad
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, index) => {
                    const note = it.notes?.trim()
                    return (
                      <Fragment key={`${it.product_id}-${index}`}>
                        <tr className={note ? 'border-t border-zinc-100' : 'border-t border-zinc-100'}>
                          <td className="px-3 py-2.5 font-bold text-zinc-800">{it.name}</td>
                          <td className="px-3 py-2.5 font-mono font-bold text-zinc-700 text-center tabular-nums">
                            {it.quantity > 0 ? it.quantity : ' '}
                          </td>
                        </tr>
                        {note ? (
                          <tr>
                            <td colSpan={2} className="px-3 pb-2.5 pt-0 pl-7 text-[11px] font-medium text-zinc-600 lowercase">
                              {note}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
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
