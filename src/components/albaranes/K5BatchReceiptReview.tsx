'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Notice } from '@/components/ui/Notice'
import { Surface } from '@/components/ui/Surface'
import {
  applyK5BatchReceiptsAction,
  listK5BatchReviewAction,
  previewK5BatchReceiptsAction,
  type K5BatchPreviewItem,
  type K5BatchReviewRow,
  type K5BatchReviewSummary,
} from '@/app/dashboard/albaranes/k5/batch-actions'

type Props = { invoiceId: string; onResolveLine?: (lineId: string) => void }

type Context = {
  rows: K5BatchReviewRow[]
  summary: K5BatchReviewSummary
}

function qty(value: number | null | undefined, unit: string | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 }).format(value)}${unit ? ` ${unit}` : ''}`
}

function money(value: number | null | undefined, unit?: string | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value)} €${unit ? `/${unit}` : ''}`
}

const exceptionLabel: Record<string, string> = {
  needs_mapping: 'Producto o presentación nuevos: necesita una decisión una sola vez.',
  needs_review: 'La evidencia tiene una ambigüedad real y requiere revisión.',
  order_review: 'Hay pedidos pendientes para este ingrediente; revisa la conciliación individualmente.',
  unavailable: 'Faltan datos para una confirmación segura.',
}

export function K5BatchReceiptReview({ invoiceId, onResolveLine }: Props) {
  const [context, setContext] = useState<Context | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [preview, setPreview] = useState<K5BatchPreviewItem[]>([])
  const [loading, setLoading] = useState(true)
  const [previewing, setPreviewing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await listK5BatchReviewAction({ invoiceId })
      if (!result.success) {
        setError(result.message)
        return
      }
      setContext({ rows: result.rows, summary: result.summary })
      const ready = result.rows.filter((row) => row.disposition === 'ready').map((row) => row.proposalId)
      setSelected(new Set(ready))
      setPreview([])
    } finally {
      setLoading(false)
    }
  }, [invoiceId])

  useEffect(() => {
    void load()
  }, [load])

  const readyRows = useMemo(
    () => context?.rows.filter((row) => row.disposition === 'ready') ?? [],
    [context]
  )
  const exceptionRows = useMemo(
    () => context?.rows.filter((row) => ['needs_mapping', 'needs_review', 'order_review', 'unavailable'].includes(row.disposition)) ?? [],
    [context]
  )

  function toggle(proposalId: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(proposalId)) next.delete(proposalId)
      else next.add(proposalId)
      return next
    })
    setPreview([])
  }

  async function handlePreview() {
    const proposalIds = readyRows.filter((row) => selected.has(row.proposalId)).map((row) => row.proposalId)
    if (proposalIds.length === 0) {
      toast.error('Selecciona al menos una línea lista.')
      return
    }
    setPreviewing(true)
    setError(null)
    try {
      const result = await previewK5BatchReceiptsAction({ invoiceId, proposalIds })
      if (!result.success) {
        setError(result.message)
        toast.error(result.message)
        return
      }
      setPreview(result.items)
      toast.success(`Vista previa preparada para ${result.items.length} línea(s).`)
    } finally {
      setPreviewing(false)
    }
  }

  async function handleConfirm() {
    if (preview.length === 0) return
    setConfirming(true)
    setError(null)
    try {
      const result = await applyK5BatchReceiptsAction({
        invoiceId,
        items: preview.map((item) => ({ proposalId: item.proposalId, fingerprint: item.fingerprint })),
        idempotencyKey: crypto.randomUUID(),
      })
      if (!result.success) {
        setError(result.message)
        toast.error(result.message)
        await load()
        return
      }
      toast.success(`${result.applied} recepción(es) confirmada(s).`)
      await load()
    } finally {
      setConfirming(false)
    }
  }

  if (loading) {
    return (
      <Surface variant="block" instance="k5-batch-review-loading" className="p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-zinc-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Preparando revisión automática…
        </div>
      </Surface>
    )
  }

  if (!context) {
    return (
      <Notice instance="k5-batch-review-error" variant="negative" title="No se pudo preparar la revisión">
        {error || 'No hay información disponible.'}
      </Notice>
    )
  }

  return (
    <Surface variant="block" instance="k5-batch-review" className="min-w-0 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-base font-black text-zinc-900">2 · Revisar y confirmar productos reconocidos</div>
          <p className="mt-1 max-w-2xl text-xs font-medium leading-relaxed text-zinc-600">
            Estas líneas ya tienen producto y presentación resueltos. Revísalas juntas, mira el efecto real y confirma solo si todo cuadra.
          </p>
        </div>
        <Button
          type="button"
          variant="tertiary"
          instance="k5-batch-refresh"
          onClick={() => void load()}
          disabled={previewing || confirming}
        >
          <RefreshCw className="h-4 w-4" />
          Recargar
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
          <div className="text-[9px] font-black uppercase tracking-wider text-emerald-700">Listas en lote</div>
          <div className="mt-1 text-xl font-black tabular-nums text-emerald-950">{context.summary.ready}</div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
          <div className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Confirmadas</div>
          <div className="mt-1 text-xl font-black tabular-nums text-zinc-900">{context.summary.confirmed}</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
          <div className="text-[9px] font-black uppercase tracking-wider text-amber-700">Excepciones</div>
          <div className="mt-1 text-xl font-black tabular-nums text-amber-950">{context.summary.exceptions}</div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
          <div className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Excluidas</div>
          <div className="mt-1 text-xl font-black tabular-nums text-zinc-900">{context.summary.excluded}</div>
        </div>
      </div>

      {error ? (
        <div className="mt-3">
          <Notice instance="k5-batch-inline-error" variant="negative" title="Revisión detenida">
            {error}
          </Notice>
        </div>
      ) : null}

      {readyRows.length > 0 ? (
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
              Seleccionadas para confirmar
            </div>
            <button
              type="button"
              className="text-[10px] font-black text-zinc-600 underline underline-offset-2"
              onClick={() => {
                const allSelected = readyRows.every((row) => selected.has(row.proposalId))
                setSelected(new Set(allSelected ? [] : readyRows.map((row) => row.proposalId)))
                setPreview([])
              }}
            >
              {readyRows.every((row) => selected.has(row.proposalId)) ? 'Deseleccionar todas' : 'Seleccionar todas'}
            </button>
          </div>

          <div className="space-y-1.5">
            {readyRows.map((row) => (
              <label key={row.proposalId} className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={selected.has(row.proposalId)}
                  onChange={() => toggle(row.proposalId)}
                  className="h-4 w-4 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-black text-zinc-900">{row.sourceItemName}</div>
                  <div className="mt-0.5 truncate text-[10px] font-semibold text-zinc-500">
                    → {row.ingredientName || 'Ingrediente'} · {qty(row.lineQuantity, row.lineUnit)} · {money(row.observedUnitPrice, row.lineUnit)}
                  </div>
                </div>
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              </label>
            ))}
          </div>

          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              variant="primary"
              instance="k5-batch-preview"
              onClick={() => void handlePreview()}
              disabled={selected.size === 0 || previewing || confirming}
              loading={previewing}
              loadingLabel="Validando…"
            >
              Ver efecto de {selected.size} línea{selected.size === 1 ? '' : 's'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <Notice instance="k5-batch-none-ready" variant="info" title="No hay líneas nuevas listas para lote">
            Las líneas ya confirmadas quedan fuera. Los productos nuevos o ambiguos aparecen abajo como excepciones y solo hay que resolverlos cuando cambie su mapping o presentación.
          </Notice>
        </div>
      )}

      {preview.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-[#9bb5bf] bg-[#eef5f7] p-3">
          <div className="text-[10px] font-black uppercase tracking-wider text-[#365967]">Efecto a confirmar · {preview.length} líneas</div>
          <div className="mt-2 space-y-2">
            {preview.map((item) => (
              <div key={item.proposalId} className="rounded-xl border border-white/80 bg-white/80 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-black text-zinc-900">{item.lineName}</div>
                    <div className="mt-0.5 text-[10px] font-semibold text-zinc-600">→ {item.ingredientName}</div>
                  </div>
                  <div className="text-right text-[10px] font-bold text-zinc-700">
                    {qty(item.preview.physical_quantity, item.preview.base_unit)} · {qty(item.preview.purchase_quantity, item.preview.purchase_unit)}
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-semibold text-zinc-600">
                  <span>Precio: {money(item.preview.price_before, item.preview.purchase_unit)} → {money(item.preview.price_after, item.preview.purchase_unit)}</span>
                  <span>{item.preview.price_changed ? 'Actualiza precio' : 'Precio ya coincide'}</span>
                  <span>Pedidos vinculados: {item.preview.allocation_count}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[10px] font-semibold text-zinc-600">
              K4 vuelve a revalidar todas las líneas antes de aplicar la primera.
            </div>
            <Button
              type="button"
              variant="primary"
              instance="k5-batch-confirm"
              onClick={() => void handleConfirm()}
              disabled={confirming || previewing}
              loading={confirming}
              loadingLabel="Confirmando…"
            >
              Confirmar {preview.length} línea{preview.length === 1 ? '' : 's'}
            </Button>
          </div>
        </div>
      ) : null}

      {exceptionRows.length > 0 ? (
        <div className="mt-4 border-t border-zinc-200 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-amber-700">
              <AlertTriangle className="h-4 w-4" />
              Excepciones · {exceptionRows.length}
            </div>
            <Link href={`/dashboard/albaranes?id=${encodeURIComponent(invoiceId)}`} className="text-[10px] font-black text-zinc-700 underline underline-offset-2">
              Abrir albarán para resolverlas
            </Link>
          </div>
          <div className="mt-2 space-y-1.5">
            {exceptionRows.map((row) => (
              <div key={row.proposalId} className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-black text-zinc-900">{row.sourceItemName}</div>
                  <div className="mt-0.5 text-[10px] font-semibold leading-relaxed text-amber-900">
                    {exceptionLabel[row.disposition] || 'Requiere revisión.'}
                    {row.reviewReasons.length ? ` ${row.reviewReasons.join(' · ')}` : ''}
                    {row.pendingOrderCount > 0 ? ` Pedidos pendientes: ${row.pendingOrderCount}.` : ''}
                  </div>
                </div>
                {onResolveLine && row.lineId ? (
                  <Button
                    type="button"
                    variant="primary"
                    instance="k5-review-exception"
                    onClick={() => onResolveLine(row.lineId!)}
                  >
                    {row.disposition === 'needs_mapping' ? 'Mapear producto' : 'Revisar línea'}
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Surface>
  )
}
