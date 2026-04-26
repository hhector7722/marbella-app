'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import { createPortal } from 'react-dom'
import { ExternalLink, FileText, Filter, Loader2, RefreshCw, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IngredientWizard } from '@/components/ingredients/IngredientWizard'
import type { PurchaseInvoiceDetail, PurchaseInvoiceListItem, SupplierListItem } from './actions'
import {
  applyInvoiceLineStockAction,
  confirmInvoiceLineMappingAction,
  getInvoiceStockStatusesAction,
  getPurchaseInvoiceDetailAction,
  listPurchaseInvoicesAction,
  rectifyInvoiceLineStockAction,
  searchSuppliersForInvoiceAction,
  searchIngredientsForMappingAction,
  setPurchaseInvoiceSupplierAction,
  suggestIngredientsForLineAction,
  updatePurchaseInvoiceLineAction,
} from './actions'

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

function numOrNull(v: any): number | null {
  const n = v == null ? null : Number(v)
  return typeof n === 'number' && Number.isFinite(n) ? n : null
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
  const [modalContainer, setModalContainer] = useState<HTMLElement | null>(null)
  const detailReqRef = useRef(0)
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false)
  const [supplierQuery, setSupplierQuery] = useState('')
  const [supplierResults, setSupplierResults] = useState<SupplierListItem[]>([])
  const [supplierLoading, setSupplierLoading] = useState(false)
  const [supplierError, setSupplierError] = useState<string | null>(null)
  const [supplierSaving, setSupplierSaving] = useState(false)

  const [stockStatusByLineId, setStockStatusByLineId] = useState<
    Record<string, { stockApplied: boolean; stockAppliedQty: number | null; rectifiedCount: number }>
  >({})
  const [mappingOpenLineId, setMappingOpenLineId] = useState<string | null>(null)
  const [mappingError, setMappingError] = useState<string | null>(null)
  const [mappingLoading, setMappingLoading] = useState(false)
  const [suggestedByLineId, setSuggestedByLineId] = useState<Record<string, { suggestedIngredientId: string | null; candidates: any[] }>>({})
  const [ingredientSearchQuery, setIngredientSearchQuery] = useState('')
  const [ingredientSearchResults, setIngredientSearchResults] = useState<Array<{ id: string; name: string; purchase_unit: string; current_price: number }>>([])
  const [ingredientSearchLoading, setIngredientSearchLoading] = useState(false)
  const [selectedIngredientByLineId, setSelectedIngredientByLineId] = useState<Record<string, string | null>>({})
  const [factorByLineId, setFactorByLineId] = useState<Record<string, string>>({})
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardIngredientId, setWizardIngredientId] = useState<string | null>(null)
  const [wizardInitialName, setWizardInitialName] = useState<string | null>(null)
  const [wizardTargetLineId, setWizardTargetLineId] = useState<string | null>(null)
  const [expandedLineIds, setExpandedLineIds] = useState<Record<string, boolean>>({})
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [filterSupplier, setFilterSupplier] = useState('')

  useEffect(() => {
    setModalContainer(typeof document !== 'undefined' ? document.body : null)
  }, [])

  useEffect(() => {
    if (!selectedId) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [selectedId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const supplierQ = filterSupplier.trim().toLowerCase()
    const from = filterFrom.trim()
    const to = filterTo.trim()

    return items.filter((it) => {
      const hay = [it.supplier_name, it.invoice_number, it.invoice_date, it.source, it.status, String(it.id)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      if (q && !hay.includes(q)) return false

      if (supplierQ) {
        const s = String(it.supplier_name ?? '').toLowerCase()
        if (!s.includes(supplierQ)) return false
      }

      const d = String(it.invoice_date ?? '').trim()
      if (from && d && d < from) return false
      if (to && d && d > to) return false
      if ((from || to) && !d) return false

      return true
    })
  }, [items, query])

  function isLineDirty(l: PurchaseInvoiceDetail['lines'][number]) {
    const d = draftLines[l.id]
    if (!d) return false
    const nameDirty = String(d.original_name ?? '') !== String(l.original_name ?? '')
    const qtyDirty = numOrNull(d.quantity?.trim?.() === '' ? null : d.quantity) !== numOrNull(l.quantity)
    const unitDirty = numOrNull(d.unit_price?.trim?.() === '' ? null : d.unit_price) !== numOrNull(l.unit_price)
    const totalDirty = numOrNull(d.total_price?.trim?.() === '' ? null : d.total_price) !== numOrNull(l.total_price)
    return nameDirty || qtyDirty || unitDirty || totalDirty
  }

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
    const reqId = ++detailReqRef.current
    setSelectedId(id)
    setDetail(null)
    setDetailError(null)
    setIsLoadingDetail(true)
    setSaveError(null)
    setSaveWarning(null)
    setDraftLines({})
    setStockStatusByLineId({})
    setMappingOpenLineId(null)
    setMappingError(null)
    setSuggestedByLineId({})
    setIngredientSearchQuery('')
    setIngredientSearchResults([])
    setIngredientSearchLoading(false)
    setSelectedIngredientByLineId({})
    setFactorByLineId({})
    try {
      const res = await getPurchaseInvoiceDetailAction(id)
      if (detailReqRef.current !== reqId) return
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

      const lineIds = res.detail.lines.map((l) => l.id)
      const st = await getInvoiceStockStatusesAction({ lineIds })
      if (st.success) {
        const map: Record<string, { stockApplied: boolean; stockAppliedQty: number | null; rectifiedCount: number }> = {}
        for (const s of st.statuses) {
          map[s.lineId] = { stockApplied: s.stockApplied, stockAppliedQty: s.stockAppliedQty, rectifiedCount: s.rectifiedCount }
        }
        setStockStatusByLineId(map)
      }
    } finally {
      if (detailReqRef.current !== reqId) return
      setIsLoadingDetail(false)
    }
  }

  function closeModal() {
    detailReqRef.current++
    setSelectedId(null)
    setDetail(null)
    setDetailError(null)
    setIsLoadingDetail(false)
    setSaveError(null)
    setSaveWarning(null)
    setDraftLines({})
    setSupplierPickerOpen(false)
    setSupplierQuery('')
    setSupplierResults([])
    setSupplierLoading(false)
    setSupplierError(null)
    setSupplierSaving(false)
    setStockStatusByLineId({})
    setMappingOpenLineId(null)
    setMappingError(null)
    setMappingLoading(false)
    setSuggestedByLineId({})
    setIngredientSearchQuery('')
    setIngredientSearchResults([])
    setIngredientSearchLoading(false)
    setSelectedIngredientByLineId({})
    setFactorByLineId({})
    setWizardOpen(false)
    setWizardIngredientId(null)
    setWizardInitialName(null)
    setWizardTargetLineId(null)
    setExpandedLineIds({})
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

  const activeItem = useMemo(() => items.find((it) => it.id === selectedId) ?? null, [items, selectedId])

  async function runSupplierSearch(nextQuery: string) {
    setSupplierError(null)
    const q = nextQuery.trim()
    if (q.length < 2) {
      setSupplierResults([])
      return
    }
    setSupplierLoading(true)
    try {
      const res = await searchSuppliersForInvoiceAction({ query: q, limit: 60 })
      if (!res.success) {
        setSupplierError(res.message)
        return
      }
      setSupplierResults(res.suppliers)
    } finally {
      setSupplierLoading(false)
    }
  }

  async function assignSupplier(supplierId: number) {
    if (!detail) return
    setSupplierError(null)
    setSupplierSaving(true)
    try {
      const res = await setPurchaseInvoiceSupplierAction({ invoiceId: detail.id, supplierId })
      if (!res.success) {
        setSupplierError(res.message)
        return
      }

      // Refrescar detalle y lista para que título/logo se actualicen al instante
      const [dRes, lRes] = await Promise.all([getPurchaseInvoiceDetailAction(detail.id), listPurchaseInvoicesAction({ limit: 60 })])
      if (dRes.success) setDetail(dRes.detail)
      if (lRes.success) setItems(lRes.items)

      if (dRes.success) {
        const st = await getInvoiceStockStatusesAction({ lineIds: dRes.detail.lines.map((l) => l.id) })
        if (st.success) {
          const map: Record<string, { stockApplied: boolean; stockAppliedQty: number | null; rectifiedCount: number }> = {}
          for (const s of st.statuses) map[s.lineId] = { stockApplied: s.stockApplied, stockAppliedQty: s.stockAppliedQty, rectifiedCount: s.rectifiedCount }
          setStockStatusByLineId(map)
        }
      }

      setSupplierPickerOpen(false)
      setSupplierQuery('')
      setSupplierResults([])
    } finally {
      setSupplierSaving(false)
    }
  }

  async function openMapping(lineId: string) {
    if (!detail) return
    setMappingError(null)
    setMappingOpenLineId(lineId)
    setMappingLoading(true)
    try {
      const line = detail.lines.find((x) => x.id === lineId)
      const extractedName = line?.original_name ?? ''
      const sug = await suggestIngredientsForLineAction({ extractedName })
      if (!sug.success) {
        setMappingError(sug.message)
        return
      }
      setSuggestedByLineId((p) => ({ ...p, [lineId]: { suggestedIngredientId: sug.suggestedIngredientId, candidates: sug.candidates } }))
      setSelectedIngredientByLineId((p) => ({ ...p, [lineId]: sug.suggestedIngredientId ?? null }))
      setFactorByLineId((p) => ({ ...p, [lineId]: p[lineId] ?? '1' }))
      setIngredientSearchQuery('')
      setIngredientSearchResults([])
    } finally {
      setMappingLoading(false)
    }
  }

  async function runIngredientSearch(q: string) {
    const query = q.trim()
    setIngredientSearchQuery(q)
    setMappingError(null)
    if (query.length < 2) {
      setIngredientSearchResults([])
      return
    }
    setIngredientSearchLoading(true)
    try {
      const res = await searchIngredientsForMappingAction({ query, limit: 40 })
      if (!res.success) {
        setMappingError(res.message)
        return
      }
      setIngredientSearchResults(res.items)
    } finally {
      setIngredientSearchLoading(false)
    }
  }

  async function confirmMapping(lineId: string) {
    if (!detail) return
    setMappingError(null)
    const ingredientId = selectedIngredientByLineId[lineId]
    const factorRaw = factorByLineId[lineId] ?? '1'
    const factor = Number(String(factorRaw).replace(',', '.'))
    if (!ingredientId) return setMappingError('Selecciona un ingrediente.')
    if (!Number.isFinite(factor) || factor <= 0) return setMappingError('Factor inválido.')

    setMappingLoading(true)
    try {
      const res = await confirmInvoiceLineMappingAction({ lineId, invoiceId: detail.id, ingredientId, conversionFactor: factor })
      if (!res.success) {
        setMappingError(res.message)
        return
      }
      const refreshed = await getPurchaseInvoiceDetailAction(detail.id)
      if (!refreshed.success) {
        setMappingError(`Mapeo OK, pero no se pudo recargar: ${refreshed.message}`)
        return
      }
      setDetail(refreshed.detail)
      const st = await getInvoiceStockStatusesAction({ lineIds: refreshed.detail.lines.map((l) => l.id) })
      if (st.success) {
        const map: Record<string, { stockApplied: boolean; stockAppliedQty: number | null; rectifiedCount: number }> = {}
        for (const s of st.statuses) map[s.lineId] = { stockApplied: s.stockApplied, stockAppliedQty: s.stockAppliedQty, rectifiedCount: s.rectifiedCount }
        setStockStatusByLineId(map)
      }
      setMappingOpenLineId(null)
    } finally {
      setMappingLoading(false)
    }
  }

  async function rectifyLine(lineId: string) {
    if (!detail) return
    setMappingError(null)
    const line = detail.lines.find((l) => l.id === lineId)
    const ingredientId = line?.ingredient_id ?? null
    if (!ingredientId) return setMappingError('Esta línea no tiene ingrediente asignado.')
    const status = stockStatusByLineId[lineId]
    if (!status?.stockApplied || status.stockAppliedQty == null) return setMappingError('No hay stock aplicado previo para rectificar.')

    const next = window.prompt(`Cantidad correcta a aplicar en stock (unidad base). Antes: ${status.stockAppliedQty}`, String(status.stockAppliedQty))
    if (next == null) return
    const newQty = Number(String(next).replace(',', '.'))
    if (!Number.isFinite(newQty) || newQty <= 0) return setMappingError('Cantidad inválida.')

    setMappingLoading(true)
    try {
      const res = await rectifyInvoiceLineStockAction({ lineId, ingredientId, newQtyApplied: newQty })
      if (!res.success) return setMappingError(res.message)
      const st = await getInvoiceStockStatusesAction({ lineIds: detail.lines.map((l) => l.id) })
      if (st.success) {
        const map: Record<string, { stockApplied: boolean; stockAppliedQty: number | null; rectifiedCount: number }> = {}
        for (const s of st.statuses) map[s.lineId] = { stockApplied: s.stockApplied, stockAppliedQty: s.stockAppliedQty, rectifiedCount: s.rectifiedCount }
        setStockStatusByLineId(map)
      }
    } finally {
      setMappingLoading(false)
    }
  }

  async function applyStock(lineId: string) {
    if (!detail) return
    setMappingError(null)
    setMappingLoading(true)
    try {
      const res = await applyInvoiceLineStockAction({ invoiceId: detail.id, lineId })
      if (!res.success) {
        setMappingError(res.message)
        return
      }
      const st = await getInvoiceStockStatusesAction({ lineIds: detail.lines.map((l) => l.id) })
      if (st.success) {
        const map: Record<string, { stockApplied: boolean; stockAppliedQty: number | null; rectifiedCount: number }> = {}
        for (const s of st.statuses) map[s.lineId] = { stockApplied: s.stockApplied, stockAppliedQty: s.stockAppliedQty, rectifiedCount: s.rectifiedCount }
        setStockStatusByLineId(map)
      }
    } finally {
      setMappingLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-xl border border-zinc-100 shadow-sm px-3 py-2 flex items-center gap-2">
          <Search className="h-5 w-5 text-zinc-400 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por proveedor, número, fecha, estado…"
            className="w-full outline-none text-sm font-semibold text-zinc-800 placeholder:text-zinc-400 min-h-[40px]"
          />
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            aria-label="Filtrar"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center text-[#36606F] hover:opacity-80 active:scale-[0.99] transition shrink-0"
          >
            <Filter className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={refresh}
            disabled={isPending}
            aria-label="Recargar"
            className={cn(
              'min-h-[40px] min-w-[40px] inline-flex items-center justify-center text-[#36606F] hover:opacity-80 active:scale-[0.99] transition shrink-0',
              isPending && 'opacity-60 pointer-events-none'
            )}
          >
            {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}
          </button>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm font-bold text-red-700">
          {error}
        </div>
      ) : null}

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
                  const supplier = it.supplier_name ? it.supplier_name : 'Proveedor pendiente'
                  const title = `${supplier} · ${formatDateTitle(it.invoice_date)}`
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => openDetail(it.id)}
                      className={cn(
                        'w-full text-left rounded-xl border p-3 transition min-h-[72px] active:scale-[0.995]',
                        'border-zinc-100 hover:border-zinc-200 hover:bg-zinc-50'
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex items-start gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-black text-zinc-900 truncate">{title}</p>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-black text-zinc-900">{formatMaybeMoney(it.total_amount)}</p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
      </div>

      {selectedId && modalContainer
        ? createPortal(
            <div
              className="fixed inset-0 z-[10050] bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center animate-in fade-in duration-150"
              onClick={(e) => {
                if (e.target === e.currentTarget) closeModal()
              }}
            >
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[88vh] overflow-hidden flex flex-col">
                <div className="bg-[#36606F] px-5 py-4 flex items-center justify-between gap-3 text-white shrink-0">
                  <div className="min-w-0 flex items-center gap-3">
                    <div className="min-w-0">
                      {detail?.supplier_name ? (
                        <p className="text-sm font-black uppercase tracking-wider truncate">{detail.supplier_name}</p>
                      ) : isManager && detail && !detail.supplier_id ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSupplierPickerOpen(true)
                            setSupplierQuery('')
                            setSupplierResults([])
                            setSupplierError(null)
                          }}
                          className="text-sm font-black uppercase tracking-wider underline underline-offset-4 hover:opacity-80"
                        >
                          Añadir proveedor
                        </button>
                      ) : (
                        <p className="text-sm font-black uppercase tracking-wider truncate">Proveedor pendiente</p>
                      )}
                      <p className="text-[11px] font-bold text-white/70 truncate mt-1">
                        {formatDateTitle(detail?.invoice_date ?? activeItem?.invoice_date)}
                        {detail?.invoice_number ? ` · ${detail.invoice_number}` : activeItem?.invoice_number ? ` · ${activeItem.invoice_number}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {detail?.signed_url ? (
                      <a
                        href={detail.signed_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-white min-h-[48px] px-2 rounded-xl hover:opacity-80 transition"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Abrir
                      </a>
                    ) : null}
                    <button
                      type="button"
                      onClick={closeModal}
                      className="min-h-[48px] min-w-[48px] inline-flex items-center justify-center rounded-xl hover:opacity-80 transition active:scale-[0.99]"
                      aria-label="Cerrar"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
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

                  {isLoadingDetail ? (
                    <div className="flex items-center gap-3 text-sm font-bold text-zinc-600">
                      <Loader2 className="h-5 w-5 animate-spin text-[#36606F]" />
                      Cargando detalle…
                    </div>
                  ) : detailError ? (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm font-bold text-red-700">{detailError}</div>
                  ) : detail ? (
                    <div className="flex flex-col gap-4">
                      <div className="divide-y divide-zinc-100">
                          {detail.lines.length === 0 ? (
                            <div className="p-3 text-sm font-bold text-zinc-500">No hay líneas guardadas.</div>
                          ) : (
                            detail.lines.map((l) => {
                              const d = draftLines[l.id]
                              const canEdit = isManager
                              const isExpanded = Boolean(expandedLineIds[l.id])
                              const stock = stockStatusByLineId[l.id]
                              const stockApplied = Boolean(stock?.stockApplied)
                              const rectified = (stock?.rectifiedCount ?? 0) > 0
                              return (
                                <div key={l.id} className="p-3">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedLineIds((p) => ({ ...p, [l.id]: !Boolean(p[l.id]) }))}
                                    className="w-full text-left"
                                  >
                                    <p className="text-sm font-black text-zinc-900 truncate">
                                      {l.ingredient_name ? l.ingredient_name : l.original_name || 'Sin nombre'}
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-x-2 gap-y-2 text-xs font-bold text-zinc-600">
                                      {l.ingredient_name ? null : (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            void openMapping(l.id)
                                          }}
                                          className="text-rose-700 underline underline-offset-4"
                                        >
                                          Sin match
                                        </button>
                                      )}
                                      {stockApplied ? (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700">
                                          Stock aplicado
                                        </span>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            if (!l.ingredient_id || !detail.supplier_id) return
                                            void applyStock(l.id)
                                          }}
                                          className={cn(
                                            'px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider underline underline-offset-4',
                                            l.ingredient_id && detail.supplier_id ? 'text-zinc-700' : 'text-zinc-400'
                                          )}
                                          title={!l.ingredient_id ? 'Asigna ingrediente primero' : !detail.supplier_id ? 'Asigna proveedor primero' : 'Aplicar a stock'}
                                        >
                                          Stock pendiente
                                        </button>
                                      )}
                                      {rectified ? (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-800">
                                          Rectificado (REV{stock?.rectifiedCount})
                                        </span>
                                      ) : null}
                                    </div>
                                  </button>

                                  {isExpanded ? (
                                    <div className="mt-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                                      <div className="min-w-0 flex-1">
                                        {canEdit ? (
                                          <input
                                            value={d?.original_name ?? ''}
                                            onChange={(e) => setDraft(l.id, { original_name: e.target.value })}
                                            className="w-full min-h-[48px] px-3 rounded-xl border border-zinc-200 bg-white text-sm font-black text-zinc-900 outline-none focus:border-[#36606F]/50"
                                            placeholder="Nombre línea"
                                          />
                                        ) : null}

                                        <div className="mt-2 grid grid-cols-3 gap-2">
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

                                      {!detail.supplier_id ? (
                                        <div className="mt-3 bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs font-black text-rose-700">
                                          Falta proveedor. Asigna el proveedor para poder mapear líneas y aplicar stock.
                                        </div>
                                      ) : null}

                                      {mappingOpenLineId === l.id ? (
                                        <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 space-y-3">
                                          <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                              <p className="text-xs font-black uppercase tracking-wider text-zinc-600">Match</p>
                                              <p className="text-[11px] font-bold text-zinc-500 mt-1">
                                                Confirma ingrediente + factor. Se guardará para el futuro.
                                              </p>
                                            </div>
                                            <button
                                              type="button"
                                              onClick={() => setMappingOpenLineId(null)}
                                              className="min-h-[48px] px-3 rounded-xl bg-white border border-zinc-200 text-xs font-black uppercase tracking-wider text-zinc-700 shrink-0"
                                            >
                                              Cerrar
                                            </button>
                                          </div>

                                          {mappingError ? (
                                            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs font-black text-rose-700">{mappingError}</div>
                                          ) : null}

                                          {mappingLoading ? (
                                            <div className="flex items-center gap-2 text-xs font-black text-zinc-600">
                                              <Loader2 className="h-4 w-4 animate-spin" />
                                              Cargando…
                                            </div>
                                          ) : (
                                            <>
                                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                                <div className="sm:col-span-2">
                                                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Buscar ingrediente</p>
                                                  <input
                                                    value={ingredientSearchQuery}
                                                    onChange={(e) => void runIngredientSearch(e.target.value)}
                                                    placeholder="Escribe para buscar…"
                                                    className="mt-1 w-full min-h-[48px] px-3 rounded-xl border border-zinc-200 bg-white text-sm font-bold text-zinc-800 outline-none"
                                                  />
                                                  {ingredientSearchLoading ? (
                                                    <div className="mt-2 text-xs font-bold text-zinc-500">Buscando…</div>
                                                  ) : ingredientSearchResults.length ? (
                                                    <div className="mt-2 grid grid-cols-1 gap-2 max-h-[220px] overflow-auto">
                                                      {ingredientSearchResults.map((it) => (
                                                        <button
                                                          key={it.id}
                                                          type="button"
                                                          onClick={() => setSelectedIngredientByLineId((p) => ({ ...p, [l.id]: it.id }))}
                                                          className={cn(
                                                            'min-h-[48px] rounded-xl border px-3 py-2 text-left',
                                                            selectedIngredientByLineId[l.id] === it.id
                                                              ? 'border-[#36606F] bg-[#36606F]/5'
                                                              : 'border-zinc-200 bg-white hover:bg-zinc-50'
                                                          )}
                                                        >
                                                          <div className="flex items-center justify-between gap-2">
                                                            <span className="text-xs font-black text-zinc-900 truncate">{it.name}</span>
                                                            <span className="text-[10px] font-black text-zinc-500 shrink-0">
                                                              {Number(it.current_price || 0).toFixed(2)}€/{it.purchase_unit || 'kg'}
                                                            </span>
                                                          </div>
                                                        </button>
                                                      ))}
                                                    </div>
                                                  ) : null}
                                                </div>

                                                <div>
                                                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Factor</p>
                                                  <input
                                                    inputMode="decimal"
                                                    value={factorByLineId[l.id] ?? '1'}
                                                    onChange={(e) => setFactorByLineId((p) => ({ ...p, [l.id]: e.target.value }))}
                                                    className="mt-1 w-full min-h-[48px] px-3 rounded-xl border border-zinc-200 bg-white text-sm font-black text-zinc-900 outline-none"
                                                    placeholder="1"
                                                  />
                                                  <p className="mt-2 text-[11px] font-bold text-zinc-500">
                                                    Ej: si el albarán dice 1 caja y son 12 uds, pon 12.
                                                  </p>
                                                </div>
                                              </div>

                                              {suggestedByLineId[l.id]?.candidates?.length ? (
                                                <div>
                                                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Sugerencias</p>
                                                  <select
                                                    value={selectedIngredientByLineId[l.id] ?? ''}
                                                    onChange={(e) => setSelectedIngredientByLineId((p) => ({ ...p, [l.id]: e.target.value || null }))}
                                                    className="mt-2 w-full min-h-[48px] px-3 rounded-xl border border-zinc-200 bg-white text-sm font-bold text-zinc-800 outline-none"
                                                  >
                                                    <option value="">Selecciona una sugerencia…</option>
                                                    {suggestedByLineId[l.id]!.candidates
                                                      .filter((c: any) => c.id !== (selectedIngredientByLineId[l.id] ?? null))
                                                      .map((c: any) => (
                                                        <option key={c.id} value={c.id}>
                                                          {c.name} ({c.score})
                                                        </option>
                                                      ))}
                                                  </select>
                                                </div>
                                              ) : null}

                                              <div className="flex flex-col sm:flex-row gap-2">
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setWizardOpen(true)
                                                    setWizardIngredientId(selectedIngredientByLineId[l.id] ?? null)
                                                    setWizardInitialName(null)
                                                    setWizardTargetLineId(l.id)
                                                  }}
                                                  disabled={!selectedIngredientByLineId[l.id]}
                                                  className={cn(
                                                    'min-h-[48px] px-4 rounded-xl border border-zinc-200 bg-white text-xs font-black uppercase tracking-wider text-[#36606F] shrink-0',
                                                    !selectedIngredientByLineId[l.id] && 'opacity-50 pointer-events-none'
                                                  )}
                                                >
                                                  Editar precio
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setWizardOpen(true)
                                                    setWizardIngredientId(null)
                                                    setWizardInitialName(l.original_name || '')
                                                    setWizardTargetLineId(l.id)
                                                  }}
                                                  className="min-h-[48px] px-4 rounded-xl border border-zinc-200 bg-white text-xs font-black uppercase tracking-wider text-zinc-700 shrink-0"
                                                >
                                                  Crear ingrediente
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => void confirmMapping(l.id)}
                                                  disabled={mappingLoading || !detail.supplier_id}
                                                  className={cn(
                                                    'min-h-[48px] px-4 rounded-xl bg-[#36606F] text-white text-xs font-black uppercase tracking-wider flex-1',
                                                    (mappingLoading || !detail.supplier_id) && 'opacity-60 pointer-events-none'
                                                  )}
                                                >
                                                  Confirmar match
                                                </button>
                                              </div>
                                            </>
                                          )}
                                        </div>
                                      ) : null}
                                    </div>

                                    {canEdit ? (
                                      <div className="shrink-0 w-full sm:w-auto flex flex-col gap-2">
                                        {isLineDirty(l) ? (
                                          <button
                                            type="button"
                                            onClick={() => saveLine(l.id)}
                                            disabled={savingLineId === l.id}
                                            className={cn(
                                              'w-full min-h-[48px] px-4 rounded-xl bg-[#36606F] text-white text-xs font-black uppercase tracking-wider active:scale-[0.99] transition',
                                              savingLineId === l.id && 'opacity-60 pointer-events-none'
                                            )}
                                          >
                                            {savingLineId === l.id ? 'Guardando…' : 'Guardar cambios'}
                                          </button>
                                        ) : null}

                                        {stockApplied ? (
                                          <button
                                            type="button"
                                            onClick={() => void rectifyLine(l.id)}
                                            disabled={mappingLoading}
                                            className={cn(
                                              'w-full min-h-[48px] px-4 rounded-xl border border-amber-200 bg-amber-50 text-xs font-black uppercase tracking-wider text-amber-800 active:scale-[0.99] transition',
                                              mappingLoading && 'opacity-60 pointer-events-none'
                                            )}
                                          >
                                            Rectificar stock
                                          </button>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </div>
                                  ) : null}
                                </div>
                              )
                            })
                          )}
                        </div>
                    </div>
                  ) : (
                    <div className="text-sm font-bold text-zinc-500">Sin datos.</div>
                  )}
                </div>

                {supplierPickerOpen ? (
                  <div
                    className="fixed inset-0 z-[10060] bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center animate-in fade-in duration-150"
                    onClick={(e) => {
                      if (e.target === e.currentTarget && !supplierSaving) setSupplierPickerOpen(false)
                    }}
                  >
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
                      <div className="bg-[#36606F] px-5 py-4 flex items-center justify-between gap-3 text-white shrink-0">
                        <div className="min-w-0">
                          <p className="text-sm font-black uppercase tracking-wider truncate">Asignar proveedor</p>
                          <p className="text-[11px] font-bold text-white/70 truncate mt-1">Busca y selecciona el proveedor correcto</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSupplierPickerOpen(false)}
                          disabled={supplierSaving}
                          className={cn(
                            'min-h-[48px] min-w-[48px] inline-flex items-center justify-center rounded-xl bg-white/10 hover:bg-rose-500/70 transition active:scale-[0.99]',
                            supplierSaving && 'opacity-60 pointer-events-none'
                          )}
                          aria-label="Cerrar"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </div>

                      <div className="p-4 flex flex-col gap-3 overflow-auto flex-1 min-h-0">
                        {supplierError ? (
                          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm font-bold text-red-700">{supplierError}</div>
                        ) : null}

                        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-3 flex items-center gap-2 min-h-[56px]">
                          <Search className="h-5 w-5 text-zinc-400 shrink-0" />
                          <input
                            value={supplierQuery}
                            onChange={(e) => {
                              const next = e.target.value
                              setSupplierQuery(next)
                              void runSupplierSearch(next)
                            }}
                            placeholder="Escribe el nombre del proveedor…"
                            className="w-full outline-none text-sm font-semibold text-zinc-800 placeholder:text-zinc-400 min-h-[48px]"
                          />
                        </div>

                        <div className="flex flex-col gap-2">
                          {supplierLoading ? (
                            <div className="flex items-center gap-3 text-sm font-bold text-zinc-600 px-1">
                              <Loader2 className="h-5 w-5 animate-spin text-[#36606F]" />
                              Buscando…
                            </div>
                          ) : supplierQuery.trim().length < 2 ? (
                            <div className="text-sm font-bold text-zinc-500 px-1">Escribe al menos 2 letras.</div>
                          ) : supplierResults.length === 0 ? (
                            <div className="text-sm font-bold text-zinc-500 px-1">Sin resultados.</div>
                          ) : (
                            supplierResults.map((s) => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => assignSupplier(s.id)}
                                disabled={supplierSaving}
                                className={cn(
                                  'w-full text-left rounded-xl border border-zinc-100 hover:border-zinc-200 hover:bg-zinc-50 p-3 min-h-[64px] active:scale-[0.995] transition flex items-center gap-3',
                                  supplierSaving && 'opacity-60 pointer-events-none'
                                )}
                              >
                                <div className="h-10 w-10 rounded-xl border border-zinc-100 bg-zinc-50 overflow-hidden flex items-center justify-center shrink-0">
                                  {s.image_url ? <img src={s.image_url} alt="" className="h-full w-full object-contain" /> : null}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-black text-zinc-900 truncate">{s.name}</p>
                                  <p className="text-xs font-bold text-zinc-500 mt-1">ID {s.id}</p>
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {wizardOpen ? (
                  <div
                    className="fixed inset-0 z-[10070] bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center animate-in fade-in duration-150"
                    onClick={(e) => {
                      if (e.target === e.currentTarget) setWizardOpen(false)
                    }}
                  >
                    <div
                      className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[86vh] overflow-auto p-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <IngredientWizard
                        ingredientId={wizardIngredientId}
                        initialName={wizardInitialName ?? undefined}
                        mode={wizardIngredientId ? 'editPricing' : 'create'}
                        onSaved={(id) => {
                          if (wizardTargetLineId) {
                            setSelectedIngredientByLineId((p) => ({ ...p, [wizardTargetLineId]: id }))
                          }
                        }}
                        onClose={() => {
                          setWizardOpen(false)
                          setWizardIngredientId(null)
                          setWizardInitialName(null)
                          setWizardTargetLineId(null)
                        }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>,
            modalContainer
          )
        : null}

      {filterOpen ? (
        <div
          className="fixed inset-0 z-[10040] bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setFilterOpen(false)
          }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-[#36606F] px-5 py-4 flex items-center justify-between gap-3 text-white">
              <p className="text-sm font-black uppercase tracking-wider">Filtrar</p>
              <button
                type="button"
                onClick={() => setFilterOpen(false)}
                className="min-h-[48px] min-w-[48px] inline-flex items-center justify-center rounded-xl hover:opacity-80 transition"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Desde</p>
                  <input
                    type="date"
                    value={filterFrom}
                    onChange={(e) => setFilterFrom(e.target.value)}
                    className="mt-1 w-full min-h-[48px] px-3 rounded-xl border border-zinc-200 bg-white text-sm font-bold"
                  />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Hasta</p>
                  <input
                    type="date"
                    value={filterTo}
                    onChange={(e) => setFilterTo(e.target.value)}
                    className="mt-1 w-full min-h-[48px] px-3 rounded-xl border border-zinc-200 bg-white text-sm font-bold"
                  />
                </div>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Proveedor</p>
                <input
                  value={filterSupplier}
                  onChange={(e) => setFilterSupplier(e.target.value)}
                  placeholder="Ej: Santa Teresa"
                  className="mt-1 w-full min-h-[48px] px-3 rounded-xl border border-zinc-200 bg-white text-sm font-bold"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFilterFrom('')
                    setFilterTo('')
                    setFilterSupplier('')
                  }}
                  className="min-h-[48px] flex-1 rounded-xl border border-zinc-200 bg-white text-xs font-black uppercase tracking-wider text-zinc-700"
                >
                  Limpiar
                </button>
                <button
                  type="button"
                  onClick={() => setFilterOpen(false)}
                  className="min-h-[48px] flex-1 rounded-xl bg-[#36606F] text-white text-xs font-black uppercase tracking-wider"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

