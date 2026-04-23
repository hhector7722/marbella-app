'use client'

import { useMemo, useState, useTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ExternalLink, FileText, Loader2, RefreshCw, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PurchaseInvoiceDetail, PurchaseInvoiceListItem } from './actions'
import { getPurchaseInvoiceDetailAction, listPurchaseInvoicesAction, updatePurchaseInvoiceLineAction } from './actions'

function formatDateTitle(v: string | null | undefined) {
  const t = String(v ?? '').trim()
  if (!t) return '—'
  // `invoice_date` viene como YYYY-MM-DD (DATE). Mostrar tal cual evita líos de zona horaria.
  return t
}

function formatMaybeMoney(v: number | null | undefined) {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : null
  if (n == null || n === 0) return ' '
  return `${n.toFixed(2)}€`
}

function formatMaybeText(v: string | null | undefined) {
  const t = String(v ?? '').trim()
  return t ? t : '—'
}

function isImagePath(filePath: string | null) {
  const p = (filePath ?? '').toLowerCase()
  return p.endsWith('.jpg') || p.endsWith('.jpeg') || p.endsWith('.png') || p.endsWith('.webp')
}

export default function AlbaranesHistoricoClient({
  initialItems,
  initialError,
  isManager,
}: {
  initialItems: PurchaseInvoiceListItem[]
  initialError: string | null
  isManager: boolean
}) {
  const [items, setItems] = useState<PurchaseInvoiceListItem[]>(initialItems)
  const [error, setError] = useState<string | null>(initialError)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<PurchaseInvoiceDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [savingLineId, setSavingLineId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveWarning, setSaveWarning] = useState<string | null>(null)
  const [draftLines, setDraftLines] = useState<Record<string, { original_name: string; quantity: string; unit_price: string; total_price: string }>>({})

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) => {
      const hay = [
        it.supplier_name,
        it.invoice_number,
        it.invoice_date,
        it.source,
        it.status,
        String(it.id),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [items, query])

  function refresh() {
    setError(null)
    startTransition(async () => {
      const res = await listPurchaseInvoicesAction({ limit: 60 })
      if (!res.success) {
        setError(res.message)
        return
      }
      setItems(res.items)
    })
  }

  async function openDetail(id: string) {
    setSelectedId(id)
    setDetail(null)
    setDetailError(null)
    setIsLoadingDetail(true)
    setSaveError(null)
    setSaveWarning(null)
    setDraftLines({})
    try {
      const res = await getPurchaseInvoiceDetailAction(id)
      if (!res.success) {
        setDetailError(res.message)
        return
      }
      setDetail(res.detail)
      const nextDraft: Record<string, { original_name: string; quantity: string; unit_price: string; total_price: string }> = {}
      for (const l of res.detail.lines) {
        nextDraft[l.id] = {
          original_name: l.original_name ?? '',
          quantity: l.quantity == null ? '' : String(l.quantity),
          unit_price: l.unit_price == null ? '' : String(l.unit_price),
          total_price: l.total_price == null ? '' : String(l.total_price),
        }
      }
      setDraftLines(nextDraft)
    } finally {
      setIsLoadingDetail(false)
    }
  }

  function setDraft(lineId: string, patch: Partial<{ original_name: string; quantity: string; unit_price: string; total_price: string }>) {
    setDraftLines((prev) => ({
      ...prev,
      [lineId]: {
        original_name: prev[lineId]?.original_name ?? '',
        quantity: prev[lineId]?.quantity ?? '',
        unit_price: prev[lineId]?.unit_price ?? '',
        total_price: prev[lineId]?.total_price ?? '',
        ...patch,
      },
    }))
  }

  async function saveLine(lineId: string) {
    if (!detail) return
    setSaveError(null)
    setSaveWarning(null)
    setSavingLineId(lineId)
    try {
      const d = draftLines[lineId]
      if (!d) {
        setSaveError('No hay borrador para esta línea.')
        return
      }

      const qty = d.quantity.trim() === '' ? null : Number(d.quantity)
      const unit = d.unit_price.trim() === '' ? null : Number(d.unit_price)
      const total = d.total_price.trim() === '' ? null : Number(d.total_price)

      if (qty != null && !Number.isFinite(qty)) {
        setSaveError('Cantidad inválida.')
        return
      }
      if (unit != null && !Number.isFinite(unit)) {
        setSaveError('Precio unitario inválido.')
        return
      }
      if (total != null && !Number.isFinite(total)) {
        setSaveError('Total inválido.')
        return
      }

      const res = await updatePurchaseInvoiceLineAction({
        lineId,
        patch: {
          original_name: d.original_name,
          quantity: qty,
          unit_price: unit,
          total_price: total,
        },
      })
      if (!res.success) {
        setSaveError(res.message)
        return
      }
      if (res.warning) setSaveWarning(res.warning)

      // Refrescar detalle para ver cambios y mantener consistencia
      const refreshed = await getPurchaseInvoiceDetailAction(detail.id)
      if (!refreshed.success) {
        setSaveError(`Guardado OK, pero no se pudo recargar: ${refreshed.message}`)
        return
      }
      setDetail(refreshed.detail)
      const nextDraft: Record<string, { original_name: string; quantity: string; unit_price: string; total_price: string }> = {}
      for (const l of refreshed.detail.lines) {
        nextDraft[l.id] = {
          original_name: l.original_name ?? '',
          quantity: l.quantity == null ? '' : String(l.quantity),
          unit_price: l.unit_price == null ? '' : String(l.unit_price),
          total_price: l.total_price == null ? '' : String(l.total_price),
        }
      }
      setDraftLines(nextDraft)
    } finally {
      setSavingLineId(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-stretch">
        <div className="md:col-span-2 bg-white rounded-xl border border-zinc-100 shadow-sm p-3 flex items-center gap-2 min-h-[56px]">
          <Search className="h-5 w-5 text-zinc-400 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por proveedor, número, fecha, estado…"
            className="w-full outline-none text-sm font-semibold text-zinc-800 placeholder:text-zinc-400 min-h-[48px]"
          />
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={isPending}
          className={cn(
            'bg-[#36606F] text-white rounded-xl shadow-sm px-4 py-3 font-black uppercase tracking-wider text-xs min-h-[56px] flex items-center justify-center gap-2 active:scale-[0.99] transition',
            isPending && 'opacity-60 pointer-events-none'
          )}
        >
          {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}
          Recargar
        </button>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm font-bold text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        <div className="bg-white rounded-xl border border-zinc-100 shadow-sm overflow-hidden flex flex-col min-h-[320px]">
          <div className="px-4 py-3 border-b border-zinc-100 shrink-0">
            <p className="text-xs font-black uppercase tracking-wider text-zinc-600">
              Histórico ({filtered.length})
            </p>
          </div>
          <div className="p-2 overflow-auto flex-1 min-h-0">
            {filtered.length === 0 ? (
              <div className="p-6 text-sm font-bold text-zinc-500">No hay albaranes que coincidan.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {filtered.map((it) => {
                  const active = selectedId === it.id
                  const supplier = it.supplier_name ?? (it.supplier_id ? `Proveedor #${it.supplier_id}` : 'Proveedor (sin match)')
                  const title = it.invoice_number ? `${supplier} · ${it.invoice_number}` : supplier
                  const meta = `${formatMaybeText(it.invoice_date)} · ${formatMaybeText(it.source)} · ${formatMaybeText(it.status)}`
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => openDetail(it.id)}
                      className={cn(
                        'w-full text-left rounded-xl border p-3 transition min-h-[72px] active:scale-[0.995]',
                        active
                          ? 'border-[#36606F]/40 bg-[#36606F]/5'
                          : 'border-zinc-100 hover:border-zinc-200 hover:bg-zinc-50'
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-black text-zinc-900 truncate">{title}</p>
                          <p className="text-xs font-bold text-zinc-500 mt-1 truncate">{meta}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-black text-zinc-900">{formatMaybeMoney(it.total_amount)}</p>
                          <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400 mt-1">ID {it.id}</p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-zinc-100 shadow-sm overflow-hidden flex flex-col min-h-[320px]">
          <div className="px-4 py-3 border-b border-zinc-100 shrink-0 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-wider text-zinc-600 truncate">
                {detail?.supplier_name ? detail.supplier_name : 'Detalle'}
              </p>
              {detail ? (
                <p className="text-[11px] font-bold text-zinc-500 truncate">
                  {formatDateTitle(detail.invoice_date)}
                  {detail.invoice_number ? ` · ${detail.invoice_number}` : ''}
                </p>
              ) : null}
            </div>
            {detail?.signed_url ? (
              <a
                href={detail.signed_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[#36606F] min-h-[48px] px-3 rounded-lg hover:bg-zinc-50"
              >
                <ExternalLink className="h-4 w-4" />
                Abrir
              </a>
            ) : null}
          </div>

          <div className="p-4 overflow-auto flex-1 min-h-0">
            {saveError ? (
              <div className="mb-3 bg-red-50 border border-red-200 rounded-xl p-3 text-sm font-bold text-red-700">{saveError}</div>
            ) : null}
            {saveWarning ? (
              <div className="mb-3 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm font-bold text-amber-800">
                {saveWarning}
              </div>
            ) : null}
            {!selectedId ? (
              <div className="text-sm font-bold text-zinc-500">Selecciona un albarán para ver imagen/PDF y extracción.</div>
            ) : isLoadingDetail ? (
              <div className="flex items-center gap-3 text-sm font-bold text-zinc-600">
                <Loader2 className="h-5 w-5 animate-spin text-[#36606F]" />
                Cargando detalle…
              </div>
            ) : detailError ? (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm font-bold text-red-700">
                {detailError}
              </div>
            ) : detail ? (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-zinc-50 rounded-xl border border-zinc-100 p-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Proveedor</p>
                    <p className="text-sm font-black text-zinc-900 mt-1">{formatMaybeText(detail.supplier_name)}</p>
                  </div>
                  <div className="bg-zinc-50 rounded-xl border border-zinc-100 p-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Número</p>
                    <p className="text-sm font-black text-zinc-900 mt-1">{formatMaybeText(detail.invoice_number)}</p>
                  </div>
                  <div className="bg-zinc-50 rounded-xl border border-zinc-100 p-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Fecha</p>
                    <p className="text-sm font-black text-zinc-900 mt-1">{formatMaybeText(detail.invoice_date)}</p>
                  </div>
                  <div className="bg-zinc-50 rounded-xl border border-zinc-100 p-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Total</p>
                    <p className="text-sm font-black text-zinc-900 mt-1">{formatMaybeMoney(detail.total_amount)}</p>
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-zinc-100 shadow-sm overflow-hidden">
                  <div className="px-3 py-2 border-b border-zinc-100 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-zinc-500" />
                    <p className="text-xs font-black uppercase tracking-wider text-zinc-600">Documento</p>
                  </div>
                  <div className="p-3">
                    {!detail.signed_url ? (
                      <p className="text-sm font-bold text-zinc-500">No hay fichero asociado.</p>
                    ) : isImagePath(detail.file_path) ? (
                      <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-zinc-50 border border-zinc-100">
                        <Image
                          src={detail.signed_url}
                          alt="Albarán"
                          fill
                          className="object-contain"
                          sizes="(max-width: 1024px) 100vw, 600px"
                        />
                      </div>
                    ) : (
                      <a
                        href={detail.signed_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-2 w-full bg-zinc-50 hover:bg-zinc-100 rounded-xl border border-zinc-200 min-h-[56px] font-black uppercase tracking-wider text-xs text-zinc-700"
                      >
                        <FileText className="h-5 w-5" />
                        Abrir PDF
                      </a>
                    )}
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-zinc-100 shadow-sm overflow-hidden">
                  <div className="px-3 py-2 border-b border-zinc-100 flex items-center justify-between gap-2">
                    <p className="text-xs font-black uppercase tracking-wider text-zinc-600">Extracción (líneas)</p>
                    <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{detail.lines.length}</p>
                  </div>
                  <div className="divide-y divide-zinc-100">
                    {detail.lines.length === 0 ? (
                      <div className="p-3 text-sm font-bold text-zinc-500">No hay líneas guardadas.</div>
                    ) : (
                      detail.lines.map((l) => {
                        const d = draftLines[l.id]
                        const canEdit = isManager
                        return (
                          <div key={l.id} className="p-3">
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                {canEdit ? (
                                  <input
                                    value={d?.original_name ?? ''}
                                    onChange={(e) => setDraft(l.id, { original_name: e.target.value })}
                                    className="w-full min-h-[48px] px-3 rounded-xl border border-zinc-200 bg-white text-sm font-black text-zinc-900 outline-none focus:border-[#36606F]/50"
                                    placeholder="Nombre línea"
                                  />
                                ) : (
                                  <p className="text-sm font-black text-zinc-900">{l.original_name || 'Sin nombre'}</p>
                                )}
                                <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Cantidad</p>
                                    {canEdit ? (
                                      <input
                                        inputMode="decimal"
                                        value={d?.quantity ?? ''}
                                        onChange={(e) => setDraft(l.id, { quantity: e.target.value })}
                                        className="w-full min-h-[48px] px-3 rounded-xl border border-zinc-200 bg-white text-sm font-bold text-zinc-800 outline-none focus:border-[#36606F]/50"
                                        placeholder="—"
                                      />
                                    ) : (
                                      <p className="text-sm font-bold text-zinc-800 mt-1">{l.quantity == null ? '—' : String(l.quantity)}</p>
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">PU</p>
                                    {canEdit ? (
                                      <input
                                        inputMode="decimal"
                                        value={d?.unit_price ?? ''}
                                        onChange={(e) => setDraft(l.id, { unit_price: e.target.value })}
                                        className="w-full min-h-[48px] px-3 rounded-xl border border-zinc-200 bg-white text-sm font-bold text-zinc-800 outline-none focus:border-[#36606F]/50"
                                        placeholder="—"
                                      />
                                    ) : (
                                      <p className="text-sm font-bold text-zinc-800 mt-1">{formatMaybeMoney(l.unit_price)}</p>
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Total</p>
                                    {canEdit ? (
                                      <input
                                        inputMode="decimal"
                                        value={d?.total_price ?? ''}
                                        onChange={(e) => setDraft(l.id, { total_price: e.target.value })}
                                        className="w-full min-h-[48px] px-3 rounded-xl border border-zinc-200 bg-white text-sm font-bold text-zinc-800 outline-none focus:border-[#36606F]/50"
                                        placeholder="—"
                                      />
                                    ) : (
                                      <p className="text-sm font-bold text-zinc-800 mt-1">{formatMaybeMoney(l.total_price)}</p>
                                    )}
                                  </div>
                                </div>

                                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-bold text-zinc-600">
                                  {l.ingredient_name ? <span className="text-emerald-700">→ {l.ingredient_name}</span> : null}
                                </div>
                              </div>

                              {canEdit ? (
                                <button
                                  type="button"
                                  onClick={() => saveLine(l.id)}
                                  disabled={savingLineId === l.id}
                                  className={cn(
                                    'shrink-0 w-full sm:w-auto min-h-[48px] px-4 rounded-xl bg-[#36606F] text-white text-xs font-black uppercase tracking-wider active:scale-[0.99] transition',
                                    savingLineId === l.id && 'opacity-60 pointer-events-none'
                                  )}
                                >
                                  {savingLineId === l.id ? 'Guardando…' : 'Guardar'}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm font-bold text-zinc-500">Sin datos.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

