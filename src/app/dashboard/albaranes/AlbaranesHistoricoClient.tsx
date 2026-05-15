'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Filter,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Truck,
  X,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { assessScannerImageReadability } from '@/lib/scanner-image-quality'
import { compressImageFileToDataUri } from '@/lib/scanner-image-compress'
import { cn } from '@/lib/utils'
import { getSupplierLogo } from '@/lib/supplier-logos'
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout'
import { IngredientWizard, type IngredientWizardInvoiceContext } from '@/components/ingredients/IngredientWizard'
import type { PurchaseInvoiceDetail, PurchaseInvoiceListItem, SupplierListItem } from './actions'
import { appendScannerPageToInvoiceAction } from '../scanner/actions'
import { ScannerClient } from '../scanner/ScannerClient'
import {
  autoMapKnownLinesAction,
  confirmInvoiceLineMappingAction,
  deletePurchaseInvoiceAction,
  getInvoiceStockStatusesAction,
  getPurchaseInvoiceDetailAction,
  listPurchaseInvoicesAction,
  listSuppliersForFilterAction,
  rectifyInvoiceLineStockAction,
  repairOrphanLineStockAction,
  repairOrphanLinesInInvoiceAction,
  resolveLineMappingAction,
  updateMappedLineConversionFactorAction,
  searchSuppliersForInvoiceAction,
  searchIngredientsForMappingAction,
  setPurchaseInvoiceSupplierAction,
  unmapInvoiceLineAction,
  updatePurchaseInvoiceLineAction,
} from './actions'
import type { AutoMapReport } from './actions'

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
  /** Línea en edición completa (datos + vínculo). Solo una a la vez. */
  const [activeEditLineId, setActiveEditLineId] = useState<string | null>(null)
  const [mappingError, setMappingError] = useState<string | null>(null)
  const [mappingLoading, setMappingLoading] = useState(false)
  /** Nombre legible del ingrediente elegido (preselección o búsqueda). */
  const [ingredientPickLabelByLineId, setIngredientPickLabelByLineId] = useState<Record<string, string | null>>({})
  const [ingredientSearchQuery, setIngredientSearchQuery] = useState('')
  const [ingredientSearchResults, setIngredientSearchResults] = useState<Array<{ id: string; name: string; purchase_unit: string; current_price: number }>>([])
  const [ingredientSearchLoading, setIngredientSearchLoading] = useState(false)
  const [selectedIngredientByLineId, setSelectedIngredientByLineId] = useState<Record<string, string | null>>({})
  const [factorByLineId, setFactorByLineId] = useState<Record<string, string>>({})
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardIngredientId, setWizardIngredientId] = useState<string | null>(null)
  const [wizardInitialName, setWizardInitialName] = useState<string | null>(null)
  const [wizardTargetLineId, setWizardTargetLineId] = useState<string | null>(null)
  const [wizardInvoiceContext, setWizardInvoiceContext] = useState<IngredientWizardInvoiceContext | null>(null)
  const [repairingStockLineId, setRepairingStockLineId] = useState<string | null>(null)
  const [repairingInvoiceStockBatch, setRepairingInvoiceStockBatch] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [filterSupplierId, setFilterSupplierId] = useState<string>('') // '' = todos
  const [filterSuppliers, setFilterSuppliers] = useState<Array<{ id: number; name: string }>>([])
  const [filterSuppliersLoading, setFilterSuppliersLoading] = useState(false)
  const [autoMapLoading, setAutoMapLoading] = useState(false)
  const [autoMapReport, setAutoMapReport] = useState<AutoMapReport | null>(null)
  const [autoMapError, setAutoMapError] = useState<string | null>(null)
  const [deletingInvoice, setDeletingInvoice] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const appendSheetInputRef = useRef<HTMLInputElement>(null)
  const [appendSheetBusy, setAppendSheetBusy] = useState(false)
  /** Visor carrusel (varias hojas), mismo patrón que el borrador del escáner. */
  const [invoiceImageViewerOpen, setInvoiceImageViewerOpen] = useState(false)
  const [invoiceCarouselIndex, setInvoiceCarouselIndex] = useState(0)
  const invoiceCarouselRef = useRef<HTMLDivElement>(null)
  const invoiceCarouselIndexRef = useRef(0)
  const invoiceImageViewerOpenRef = useRef(false)

  useEffect(() => {
    invoiceCarouselIndexRef.current = invoiceCarouselIndex
  }, [invoiceCarouselIndex])

  useEffect(() => {
    invoiceImageViewerOpenRef.current = invoiceImageViewerOpen
  }, [invoiceImageViewerOpen])

  useEffect(() => {
    setModalContainer(typeof document !== 'undefined' ? document.body : null)
  }, [])

  useEffect(() => {
    setInvoiceImageViewerOpen(false)
    setInvoiceCarouselIndex(0)
  }, [detail?.id])

  const invoiceImageSheetOptions = useMemo(() => {
    if (!detail) return [] as { key: string; label: string; url: string }[]
    const out: { key: string; label: string; url: string }[] = []
    if (detail.signed_url) {
      out.push({ key: 'main', label: 'Hoja 1 (principal)', url: detail.signed_url })
    }
    const extras = [...(detail.extra_document_sheets ?? [])].sort(
      (a, b) => Number(a.page_order) - Number(b.page_order)
    )
    for (const s of extras) {
      out.push({
        key: `p-${s.page_order}-${s.signed_url.slice(0, 24)}`,
        label: `Hoja ${s.page_order}`,
        url: s.signed_url,
      })
    }
    return out
  }, [detail])

  const scrollInvoiceCarouselToIndex = (index: number, behavior: ScrollBehavior = 'smooth') => {
    const el = invoiceCarouselRef.current
    const n = invoiceImageSheetOptions.length
    if (!el || n <= 1) return
    const w = el.clientWidth
    if (w <= 0) return
    const i = Math.min(Math.max(0, index), n - 1)
    el.scrollTo({ left: i * w, behavior })
    setInvoiceCarouselIndex(i)
  }

  const onInvoiceCarouselScroll = () => {
    const el = invoiceCarouselRef.current
    const n = invoiceImageSheetOptions.length
    if (!el || n <= 1) return
    const w = el.clientWidth
    if (w <= 0) return
    const i = Math.min(Math.max(0, Math.round(el.scrollLeft / w)), n - 1)
    setInvoiceCarouselIndex(i)
  }

  useEffect(() => {
    if (!invoiceImageViewerOpen) return
    if (invoiceImageSheetOptions.length <= 1) return
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const node = invoiceCarouselRef.current
        if (!node) return
        const w = node.clientWidth
        if (w <= 0) return
        const maxI = invoiceImageSheetOptions.length - 1
        const i = Math.min(Math.max(0, invoiceCarouselIndexRef.current), maxI)
        node.scrollTo({ left: i * w, behavior: 'auto' })
      })
    })
  }, [invoiceImageViewerOpen, invoiceImageSheetOptions.length, detail?.id])

  useEffect(() => {
    if (!selectedId) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (invoiceImageViewerOpenRef.current) {
        e.preventDefault()
        setInvoiceImageViewerOpen(false)
        return
      }
      closeModal()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [selectedId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const supplierId = filterSupplierId.trim() ? Number(filterSupplierId) : null
    const from = filterFrom.trim()
    const to = filterTo.trim()

    return items.filter((it) => {
      const hay = [it.supplier_name, it.invoice_number, it.invoice_date, it.source, it.status, String(it.id)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      if (q && !hay.includes(q)) return false

      if (supplierId != null) {
        const sid = it.supplier_id == null ? null : Number(it.supplier_id)
        if (sid !== supplierId) return false
      }

      const d = String(it.invoice_date ?? '').trim()
      if (from && d && d < from) return false
      if (to && d && d > to) return false
      if ((from || to) && !d) return false

      return true
    })
  }, [items, query, filterSupplierId, filterFrom, filterTo])

  const mappedLinesWithoutStockCount = useMemo(() => {
    if (!detail) return 0
    return detail.lines.filter((l) => {
      if (!l.ingredient_id || String(l.status ?? '') !== 'mapped') return false
      const st = stockStatusByLineId[l.id]
      return !st?.stockApplied
    }).length
  }, [detail, stockStatusByLineId])

  // Mantiene el tick verde de la fila del albarán (lista) sincronizado con el
  // estado real del detalle: necesita todas las líneas mapeadas Y con stock
  // aplicado. Si solo refrescábamos `detail`/`stockStatusByLineId`, la lista
  // se quedaba con `is_fully_processed=false` hasta el siguiente refresh global.
  useEffect(() => {
    if (!detail) return
    const lines = detail.lines
    if (lines.length === 0) return
    const allMapped = lines.every((l) => Boolean(l.ingredient_id) && String(l.status ?? '') === 'mapped')
    const allApplied = lines.every((l) => stockStatusByLineId[l.id]?.stockApplied === true)
    const fully = allMapped && allApplied
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.id === detail.id)
      if (idx < 0) return prev
      if (prev[idx]!.is_fully_processed === fully) return prev
      const next = prev.slice()
      next[idx] = { ...prev[idx]!, is_fully_processed: fully }
      return next
    })
  }, [detail, stockStatusByLineId])

  function lineNeedsStockRepair(l: PurchaseInvoiceDetail['lines'][number]) {
    if (!l.ingredient_id || String(l.status ?? '') !== 'mapped') return false
    const st = stockStatusByLineId[l.id]
    return !st?.stockApplied
  }

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
    setActiveEditLineId(null)
    setMappingError(null)
    setIngredientPickLabelByLineId({})
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

  async function handleAppendSheetFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (appendSheetInputRef.current) appendSheetInputRef.current.value = ''
    if (!file || !detail?.id || detail.supplier_id == null) return

    setAppendSheetBusy(true)
    try {
      const dataUri = await compressImageFileToDataUri(file)
      const q = await assessScannerImageReadability(dataUri)
      if (!q.ok) {
        toast.error(q.message)
        return
      }
      const fname = file.name.replace(/\.[^/.]+$/, '') + '.jpg'
      const res = await appendScannerPageToInvoiceAction({
        base64DataUri: dataUri,
        filename: fname,
        supplierId: Number(detail.supplier_id),
        invoiceId: detail.id,
      })
      if (!res.success) {
        toast.error(res.message)
        return
      }
      toast.success('Hoja añadida al albarán.')
      const refreshed = await getPurchaseInvoiceDetailAction(detail.id)
      if (!refreshed.success) {
        toast.error(`Hoja guardada pero no se pudo recargar: ${refreshed.message}`)
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
      const lineIds = refreshed.detail.lines.map((l) => l.id)
      const st = await getInvoiceStockStatusesAction({ lineIds })
      if (st.success) {
        const map: Record<string, { stockApplied: boolean; stockAppliedQty: number | null; rectifiedCount: number }> = {}
        for (const s of st.statuses) {
          map[s.lineId] = {
            stockApplied: s.stockApplied,
            stockAppliedQty: s.stockAppliedQty,
            rectifiedCount: s.rectifiedCount,
          }
        }
        setStockStatusByLineId(map)
      }
      startTransition(async () => {
        const listRes = await listPurchaseInvoicesAction({ limit: 60 })
        if (listRes.success) setItems(listRes.items)
      })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al subir la hoja')
    } finally {
      setAppendSheetBusy(false)
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
    setActiveEditLineId(null)
    setMappingError(null)
    setMappingLoading(false)
    setIngredientPickLabelByLineId({})
    setIngredientSearchQuery('')
    setIngredientSearchResults([])
    setIngredientSearchLoading(false)
    setSelectedIngredientByLineId({})
    setFactorByLineId({})
    setWizardOpen(false)
    setWizardIngredientId(null)
    setWizardInitialName(null)
    setWizardTargetLineId(null)
    setWizardInvoiceContext(null)
    setActiveEditLineId(null)
    setAppendSheetBusy(false)
    if (appendSheetInputRef.current) appendSheetInputRef.current.value = ''
    setInvoiceImageViewerOpen(false)
    setInvoiceCarouselIndex(0)
    invoiceCarouselIndexRef.current = 0
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
      if (activeEditLineId === lineId) closeLineEdit()
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

  function closeLineEdit() {
    setActiveEditLineId(null)
    setMappingError(null)
    setIngredientSearchQuery('')
    setIngredientSearchResults([])
  }

  async function openLineEdit(lineId: string) {
    if (!detail) return
    setActiveEditLineId(lineId)
    setMappingError(null)
    setMappingLoading(true)
    try {
      // Resolver con cascada (diccionario exacto -> alias del proveedor -> fuzzy ingrediente)
      const res = await resolveLineMappingAction({ invoiceId: detail.id, lineId })
      if (!res.success) {
        setMappingError(res.message)
        return
      }
      const { suggestedIngredientId, suggestedFactor, candidates } = res.result
      const lineRow = detail.lines.find((x) => x.id === lineId)
      const mappedIngredientId = lineRow?.ingredient_id ? String(lineRow.ingredient_id) : null
      const storedFactor = lineRow?.conversion_factor

      let pickLabel: string | null = lineRow?.ingredient_name?.trim() || null
      if (!pickLabel && suggestedIngredientId && Array.isArray(candidates) && candidates.length > 0) {
        const c = candidates.find((x: { id: string }) => String(x.id) === String(suggestedIngredientId))
        pickLabel = c?.name ? String(c.name) : null
      }
      setIngredientPickLabelByLineId((p) => ({ ...p, [lineId]: pickLabel }))

      // Preselección silenciosa (sin UI de «sugerencia»): resolver + línea ya mapeada.
      setSelectedIngredientByLineId((p) => ({
        ...p,
        [lineId]: suggestedIngredientId ?? mappedIngredientId ?? p[lineId] ?? null,
      }))
      // Factor: resolver (diccionario/alias) > factor ya guardado en esta línea > estado previo > 1.
      setFactorByLineId((p) => {
        let next = '1'
        if (suggestedFactor != null && Number.isFinite(suggestedFactor) && suggestedFactor > 0) {
          next = String(suggestedFactor)
        } else if (storedFactor != null && Number.isFinite(Number(storedFactor)) && Number(storedFactor) > 0) {
          next = String(storedFactor)
        } else if (p[lineId] != null && String(p[lineId]).trim() !== '') {
          next = String(p[lineId])
        }
        return { ...p, [lineId]: next }
      })
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

    const lineRow = detail.lines.find((x) => x.id === lineId)
    const alreadyMapped =
      String(lineRow?.status ?? '') === 'mapped' &&
      Boolean(lineRow?.ingredient_id) &&
      String(lineRow?.ingredient_id) === String(ingredientId)

    setMappingLoading(true)
    try {
      const res = alreadyMapped
        ? await updateMappedLineConversionFactorAction({
            invoiceId: detail.id,
            lineId,
            conversionFactor: factor,
          })
        : await confirmInvoiceLineMappingAction({ lineId, invoiceId: detail.id, ingredientId, conversionFactor: factor })

      if (!res.success) {
        setMappingError(res.message)
        return
      }
      if (alreadyMapped && 'stockRectified' in res && res.stockRectified) {
        toast.success('Factor guardado y stock rectificado.')
      } else if (alreadyMapped) {
        toast.success('Factor guardado en el diccionario.')
      }
      if (alreadyMapped && 'warning' in res) {
        const w = res.warning
        if (typeof w === 'string' && w.trim()) toast.info(w)
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
      closeLineEdit()
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

  // Refresca detalle + estado de stock de un albarán. Se usa tras
  // operaciones que pueden cambiar mapped_ingredient_id / status / stock.
  async function refreshDetailAndStock() {
    if (!detail) return
    const dRes = await getPurchaseInvoiceDetailAction(detail.id)
    if (!dRes.success) return
    setDetail(dRes.detail)
    const st = await getInvoiceStockStatusesAction({ lineIds: dRes.detail.lines.map((l) => l.id) })
    if (st.success) {
      const map: Record<string, { stockApplied: boolean; stockAppliedQty: number | null; rectifiedCount: number }> = {}
      for (const s of st.statuses)
        map[s.lineId] = { stockApplied: s.stockApplied, stockAppliedQty: s.stockAppliedQty, rectifiedCount: s.rectifiedCount }
      setStockStatusByLineId(map)
    }
  }

  async function repairStockForLine(lineId: string) {
    setRepairingStockLineId(lineId)
    try {
      const res = await repairOrphanLineStockAction({ lineId })
      if (!res.success) {
        toast.error(res.message)
        return
      }
      if (res.alreadyApplied) {
        toast.success('Ya estaba registrado en stock.')
      } else {
        let msg = `Stock aplicado: ${res.appliedQty}`
        if (res.createdDictionaryEntry) {
          msg += '. Se guardó factor 1 en el diccionario; revísalo si hace falta.'
        }
        toast.success(msg)
      }
      if (res.priceWarning) toast.info(res.priceWarning)
      await refreshDetailAndStock()
    } finally {
      setRepairingStockLineId(null)
    }
  }

  async function repairAllMappedLinesWithoutStock() {
    if (!detail) return
    setRepairingInvoiceStockBatch(true)
    try {
      const res = await repairOrphanLinesInInvoiceAction({ invoiceId: detail.id })
      if (!res.success) {
        toast.error(res.message)
        return
      }
      const { repaired, alreadyOk, failed, firstErrors } = res.report
      if (failed === 0) {
        toast.success(`Stock: ${repaired} aplicada(s), ${alreadyOk} ya estaban OK.`)
      } else {
        if (repaired > 0) toast.success(`${repaired} línea(s) reparada(s).`)
        toast.error(`Fallaron ${failed}. ${firstErrors.join(' · ')}`)
      }
      if (repaired > 0 || alreadyOk > 0) await refreshDetailAndStock()
    } finally {
      setRepairingInvoiceStockBatch(false)
    }
  }

  // "Editar match": deshace el mapeo actual (revierte stock) y abre el modal
  // para volver a mapear. Mantiene el aprendizaje en el diccionario porque el
  // usuario va a re-mapear (si lo cambia, el upsert lo sobrescribe).
  async function editMapping(lineId: string) {
    setMappingError(null)
    setMappingLoading(true)
    try {
      const res = await unmapInvoiceLineAction({ lineId })
      if (!res.success) {
        setMappingError(res.message)
        return
      }
      await refreshDetailAndStock()
      await openLineEdit(lineId)
    } finally {
      setMappingLoading(false)
    }
  }

  // "Eliminar match": deshace el mapeo y borra también la entrada del
  // diccionario para que el sistema no vuelva a aplicar el mismo error.
  async function removeMapping(lineId: string) {
    const ok = typeof window === 'undefined'
      ? false
      : window.confirm(
          'Vas a eliminar este match: se revertirá el stock aplicado de esta línea y se borrará el aprendizaje. ¿Continuar?'
        )
    if (!ok) return
    setMappingError(null)
    setMappingLoading(true)
    try {
      const res = await unmapInvoiceLineAction({ lineId, removeFromDictionary: true })
      if (!res.success) {
        setMappingError(res.message)
        return
      }
      await refreshDetailAndStock()
    } finally {
      setMappingLoading(false)
    }
  }

  // Auto-mapeo masivo de líneas ya aprendidas (matches exactos en supplier_item_mappings).
  // - Sin invoiceId  : limpieza global del backlog.
  // - Con invoiceId  : solo ese albarán (botón dentro del modal).
  async function runAutoMap(invoiceId?: string) {
    setAutoMapError(null)
    setAutoMapReport(null)
    setAutoMapLoading(true)
    try {
      const res = await autoMapKnownLinesAction(invoiceId ? { invoiceId } : undefined)
      if (!res.success) {
        setAutoMapError(res.message)
        return
      }
      setAutoMapReport(res.report)

      // Refrescar la lista y, si hay un detalle abierto, también su contenido + estado de stock.
      const lRes = await listPurchaseInvoicesAction({ limit: 60 })
      if (lRes.success) setItems(lRes.items)
      if (detail) {
        const dRes = await getPurchaseInvoiceDetailAction(detail.id)
        if (dRes.success) {
          setDetail(dRes.detail)
          const st = await getInvoiceStockStatusesAction({ lineIds: dRes.detail.lines.map((l) => l.id) })
          if (st.success) {
            const map: Record<string, { stockApplied: boolean; stockAppliedQty: number | null; rectifiedCount: number }> = {}
            for (const s of st.statuses)
              map[s.lineId] = { stockApplied: s.stockApplied, stockAppliedQty: s.stockAppliedQty, rectifiedCount: s.rectifiedCount }
            setStockStatusByLineId(map)
          }
        }
      }
    } finally {
      setAutoMapLoading(false)
    }
  }

  // Elimina el albarán y revierte sus efectos en stock.
  // Confirmación explícita: es una operación destructiva (DELETE en
  // stock_movements + Storage). Se permite solo a manager/admin.
  async function deleteInvoice(invoiceId: string) {
    if (!isManager) return
    if (deletingInvoice) return
    const ok = typeof window === 'undefined'
      ? false
      : window.confirm(
          'Vas a eliminar este albarán y revertir todo el stock que aplicó (también las rectificaciones). Esta acción no se puede deshacer. ¿Continuar?'
        )
    if (!ok) return
    setDeleteError(null)
    setDeletingInvoice(true)
    try {
      const res = await deletePurchaseInvoiceAction({ invoiceId })
      if (!res.success) {
        setDeleteError(res.message)
        return
      }
      // Limpiamos modal y recargamos lista.
      setSelectedId(null)
      setDetail(null)
      setDraftLines({})
      setStockStatusByLineId({})
    setActiveEditLineId(null)
      const lRes = await listPurchaseInvoicesAction({ limit: 60 })
      if (lRes.success) setItems(lRes.items)
    } finally {
      setDeletingInvoice(false)
    }
  }

  // Acciones de la cabecera "Albaranes" (rightSlot del layout): visibles a
  // TODOS los authenticated. Sin contorno ni relleno; sobre fondo petróleo
  // → iconos blancos.
  const headerActions = (
    <>
      <button
        type="button"
        onClick={() => void runAutoMap()}
        disabled={autoMapLoading}
        aria-label="Auto-mapear aprendidos"
        title="Auto-mapear líneas cuyo texto ya está en el diccionario del proveedor"
        className={cn(
          'min-h-[40px] min-w-[40px] inline-flex items-center justify-center text-white hover:opacity-70 active:scale-[0.99] transition shrink-0',
          autoMapLoading && 'opacity-60 pointer-events-none'
        )}
      >
        {autoMapLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
      </button>
      <button
        type="button"
        onClick={refresh}
        disabled={isPending}
        aria-label="Recargar"
        className={cn(
          'min-h-[40px] min-w-[40px] inline-flex items-center justify-center text-white hover:opacity-70 active:scale-[0.99] transition shrink-0',
          isPending && 'opacity-60 pointer-events-none'
        )}
      >
        {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}
      </button>
    </>
  )

  return (
    <DashboardDetailLayout title="Albaranes" backHref="/dashboard" maxWidthClass="max-w-5xl" showBackButton={false} rightSlot={headerActions}>
    <div className="flex flex-col gap-4">
      <ScannerClient onSuccess={refresh} />

      <div className="bg-white rounded-xl border border-zinc-100 shadow-sm px-3 py-2 flex items-center gap-2">
        <Search className="h-5 w-5 text-zinc-400 shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full outline-none text-sm font-semibold text-zinc-800 placeholder:text-zinc-400 min-h-[40px]"
        />
        <button
          type="button"
          onClick={async () => {
            setFilterOpen(true)
            if (filterSuppliers.length === 0 && !filterSuppliersLoading) {
              setFilterSuppliersLoading(true)
              try {
                const res = await listSuppliersForFilterAction()
                if (res.success) setFilterSuppliers(res.suppliers)
              } finally {
                setFilterSuppliersLoading(false)
              }
            }
          }}
          aria-label="Filtrar"
          className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center text-[#36606F] hover:opacity-80 active:scale-[0.99] transition shrink-0"
        >
          <Filter className="h-5 w-5" />
        </button>
      </div>

      {/* Banner de resultado del auto-mapeo (global o por albarán). */}
      {autoMapError ? (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs font-black text-rose-700">
          Auto-mapeo: {autoMapError}
        </div>
      ) : null}
      {autoMapReport ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs font-black text-emerald-800 flex items-start gap-2">
          <Sparkles className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="leading-tight">
              {autoMapReport.autoMapped} línea{autoMapReport.autoMapped === 1 ? '' : 's'} auto-mapeada{autoMapReport.autoMapped === 1 ? '' : 's'}
              {' '}de {autoMapReport.linesScanned} pendiente{autoMapReport.linesScanned === 1 ? '' : 's'} en {autoMapReport.invoicesScanned} albarán{autoMapReport.invoicesScanned === 1 ? '' : 'es'}.
            </p>
            <p className="mt-1 text-[11px] font-bold text-emerald-700">
              Sin match en diccionario: {autoMapReport.skippedNoMatch} · sin proveedor: {autoMapReport.skippedNoSupplier}
              {autoMapReport.errors ? ` · errores: ${autoMapReport.errors}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAutoMapReport(null)}
            aria-label="Cerrar resumen"
            className="ml-auto min-h-[32px] min-w-[32px] inline-flex items-center justify-center rounded-lg hover:bg-emerald-100 transition shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm font-bold text-red-700 flex flex-col sm:flex-row sm:items-center gap-3">
          <span className="flex-1 min-w-0">{error}</span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={refresh}
              disabled={isPending}
              className={cn(
                'min-h-[40px] px-3 rounded-xl bg-white border border-red-200 text-red-700 text-xs font-black uppercase tracking-wider active:scale-[0.99] transition inline-flex items-center justify-center gap-2',
                isPending && 'opacity-60 pointer-events-none'
              )}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Reintentar
            </button>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') window.location.reload()
              }}
              className="min-h-[40px] px-3 rounded-xl bg-red-600 text-white text-xs font-black uppercase tracking-wider active:scale-[0.99] transition"
            >
              Recargar página
            </button>
          </div>
        </div>
      ) : null}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden flex flex-col min-h-[320px]">
          <div className="p-2 overflow-auto flex-1 min-h-0">
            {filtered.length === 0 ? (
              <div className="p-6 text-sm font-bold text-zinc-500">No hay albaranes que coincidan.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {filtered.map((it) => {
                  const supplier = it.supplier_name ? it.supplier_name : 'Proveedor pendiente'
                  // Prioridad: image_url de BD > logo local en /public/icons/prov > icono genérico.
                  const logo = getSupplierLogo(it.supplier_image_url, it.supplier_name)
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => openDetail(it.id)}
                      className="w-full text-left rounded-xl p-3 transition min-h-[72px] active:scale-[0.995] hover:bg-zinc-50"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex items-center gap-3">
                          {/* Avatar proveedor: <img> nativo para no chocar con remotePatterns. Sin marco. */}
                          <div className="shrink-0 h-10 w-10 flex items-center justify-center">
                            {logo ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={logo} alt={supplier} className="h-10 w-10 object-contain" />
                            ) : (
                              <Truck className="h-6 w-6 text-zinc-400" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-black text-zinc-900 truncate">{supplier}</p>
                            <p className="text-[11px] font-medium text-zinc-500 truncate">
                              {formatDateTitle(it.invoice_date)}
                            </p>
                          </div>
                        </div>
                        <div className="shrink-0 text-right flex items-center gap-2">
                          <p className="text-sm font-black text-zinc-900">{formatMaybeMoney(it.total_amount)}</p>
                          {it.is_fully_processed ? (
                            <span
                              className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-emerald-600 text-white"
                              aria-label="Albarán procesado"
                              title="Albarán procesado"
                            >
                              <Check className="h-4 w-4" strokeWidth={3} />
                            </span>
                          ) : null}
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
                <input
                  ref={appendSheetInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleAppendSheetFileChange}
                />
                <div className="bg-[#36606F] px-3 py-2.5 md:px-5 md:py-4 flex items-center justify-between gap-2 md:gap-3 text-white shrink-0">
                  {/* Cabecera: por debajo de md, nombre en línea propia + metadato debajo; iconos compactos.
                      Desde md, fila única + targets 48px como antes. */}
                  <div className="min-w-0 flex-1 flex flex-col gap-0.5 md:flex-row md:items-baseline md:gap-3">
                    {detail ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSupplierPickerOpen(true)
                          setSupplierQuery('')
                          setSupplierResults([])
                          setSupplierError(null)
                        }}
                        className="text-left w-full min-w-0 text-xs font-black uppercase tracking-wide md:text-sm md:tracking-wider truncate hover:opacity-80"
                        title="Cambiar proveedor"
                      >
                        {detail.supplier_name ?? 'Añadir proveedor'}
                      </button>
                    ) : (
                      <p className="text-xs font-black uppercase tracking-wide truncate min-w-0 md:text-sm md:tracking-wider">
                        Proveedor pendiente
                      </p>
                    )}
                    {(() => {
                      const dateStr = formatDateTitle(detail?.invoice_date ?? activeItem?.invoice_date)
                      const invNum = detail?.invoice_number ?? activeItem?.invoice_number ?? ''
                      const hasDate = dateStr && dateStr !== '—'
                      if (!hasDate && !invNum) return null
                      return (
                        <p className="text-[10px] font-medium text-white/70 truncate min-w-0 md:text-[11px] md:shrink-0">
                          {hasDate ? dateStr : ''}
                          {hasDate && invNum ? ' · ' : ''}
                          {invNum ? invNum : ''}
                        </p>
                      )
                    })()}
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0 md:gap-2">
                    {detail?.id && detail?.supplier_id ? (
                      <button
                        type="button"
                        onClick={() => void runAutoMap(detail.id)}
                        disabled={autoMapLoading}
                        aria-label="Auto-mapear aprendidos"
                        title="Auto-mapear líneas pendientes con texto ya aprendido para este proveedor"
                        className={cn(
                          'min-h-9 min-w-9 md:min-h-[48px] md:min-w-[48px] inline-flex items-center justify-center rounded-lg md:rounded-xl text-white hover:opacity-80 transition active:scale-[0.99]',
                          autoMapLoading && 'opacity-60 pointer-events-none'
                        )}
                      >
                        {autoMapLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin md:h-5 md:w-5" />
                        ) : (
                          <Sparkles className="h-4 w-4 md:h-5 md:w-5" />
                        )}
                      </button>
                    ) : null}
                    {invoiceImageSheetOptions.length === 1 ? (
                      <a
                        href={invoiceImageSheetOptions[0]!.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Ver imagen del albarán"
                        title={invoiceImageSheetOptions[0]!.label}
                        className="min-h-9 min-w-9 md:min-h-[48px] md:min-w-[48px] inline-flex items-center justify-center rounded-lg md:rounded-xl text-white hover:opacity-80 transition active:scale-[0.99] shrink-0"
                      >
                        <Eye className="h-4 w-4 md:h-5 md:w-5" />
                      </a>
                    ) : invoiceImageSheetOptions.length > 1 ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setInvoiceCarouselIndex(0)
                          invoiceCarouselIndexRef.current = 0
                          setInvoiceImageViewerOpen(true)
                        }}
                        aria-label="Ver hojas del albarán (deslizar)"
                        title="Ver todas las hojas: desliza o usa los puntos"
                        className="min-h-9 min-w-9 md:min-h-[48px] md:min-w-[48px] inline-flex items-center justify-center rounded-lg md:rounded-xl text-white hover:opacity-80 transition active:scale-[0.99] shrink-0"
                      >
                        <Eye className="h-4 w-4 md:h-5 md:w-5" />
                      </button>
                    ) : null}
                    {isManager && detail?.id ? (
                      <button
                        type="button"
                        onClick={() => void deleteInvoice(detail.id)}
                        disabled={deletingInvoice}
                        aria-label="Eliminar albarán"
                        title="Eliminar albarán y revertir su stock"
                        className={cn(
                          'min-h-9 min-w-9 md:min-h-[48px] md:min-w-[48px] inline-flex items-center justify-center rounded-lg md:rounded-xl hover:bg-rose-500/30 transition active:scale-[0.99] text-white',
                          deletingInvoice && 'opacity-60 pointer-events-none'
                        )}
                      >
                        {deletingInvoice ? (
                          <Loader2 className="h-4 w-4 animate-spin md:h-5 md:w-5" />
                        ) : (
                          <Trash2 className="h-4 w-4 md:h-5 md:w-5" />
                        )}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={closeModal}
                      className="min-h-9 min-w-9 md:min-h-[48px] md:min-w-[48px] inline-flex items-center justify-center rounded-lg md:rounded-xl hover:opacity-80 transition active:scale-[0.99]"
                      aria-label="Cerrar"
                    >
                      <X className="h-4 w-4 md:h-5 md:w-5" />
                    </button>
                  </div>
                </div>

                <div className="p-4 overflow-auto flex-1 min-h-0">
                  {detail?.id && detail.supplier_id != null && !isLoadingDetail ? (
                    <div className="mb-3 shrink-0">
                      <button
                        type="button"
                        onClick={() => appendSheetInputRef.current?.click()}
                        disabled={appendSheetBusy}
                        aria-label="Añadir hoja"
                        title="Añadir otra página del mismo albarán (fotografía)"
                        className={cn(
                          'w-full min-h-12 inline-flex items-center justify-center rounded-xl px-4 text-sm font-medium uppercase tracking-wide text-[#36606F] hover:bg-zinc-50 active:scale-[0.99] transition border-0 bg-transparent shadow-none',
                          appendSheetBusy && 'opacity-60 pointer-events-none'
                        )}
                      >
                        {appendSheetBusy ? <Loader2 className="h-5 w-5 shrink-0 animate-spin" /> : null}
                        {appendSheetBusy ? 'Subiendo…' : 'Añadir hoja'}
                      </button>
                    </div>
                  ) : null}
                  {deleteError ? (
                    <div className="mb-3 bg-red-50 border border-red-200 rounded-xl p-3 text-sm font-bold text-red-700">
                      Eliminar: {deleteError}
                    </div>
                  ) : null}
                  {saveError ? (
                    <div className="mb-3 bg-red-50 border border-red-200 rounded-xl p-3 text-sm font-bold text-red-700">{saveError}</div>
                  ) : null}
                  {saveWarning ? (
                    <div className="mb-3 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm font-bold text-amber-800">
                      {saveWarning}
                    </div>
                  ) : null}

                  {mappedLinesWithoutStockCount > 0 && detail && !isLoadingDetail ? (
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
                      <p className="text-xs font-black text-amber-900 leading-snug min-w-0 flex-1">
                        {mappedLinesWithoutStockCount} línea{mappedLinesWithoutStockCount === 1 ? '' : 's'} mapeada
                        {mappedLinesWithoutStockCount === 1 ? '' : 's'} sin movimiento de stock. Pulsa el aviso en cada
                        línea o repáralas todas aquí.
                      </p>
                      <button
                        type="button"
                        onClick={() => void repairAllMappedLinesWithoutStock()}
                        disabled={repairingInvoiceStockBatch || repairingStockLineId !== null || mappingLoading}
                        className={cn(
                          'shrink-0 min-h-[48px] px-4 rounded-xl bg-amber-700 text-white text-xs font-black uppercase tracking-wider active:scale-[0.99] transition inline-flex items-center justify-center gap-2',
                          (repairingInvoiceStockBatch || repairingStockLineId !== null || mappingLoading) &&
                            'opacity-60 pointer-events-none'
                        )}
                      >
                        {repairingInvoiceStockBatch ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : null}
                        Reparar todas
                      </button>
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
                              const canEdit = true
                              const isEditing = activeEditLineId === l.id
                              const stock = stockStatusByLineId[l.id]
                              const stockApplied = Boolean(stock?.stockApplied)
                              const rectified = (stock?.rectifiedCount ?? 0) > 0
                              const noMatch = !l.ingredient_name
                              // Líneas con ingrediente vinculado → el lápiz reabre el mapping
                              // para ajustar factor/ingrediente. Las que no tienen match → el
                              // lápiz lanza el mismo modal en modo «mapeo manual». Por eso
                              // mostramos SIEMPRE el lápiz al manager, sin condicionarlo a
                              // `ingredient_id`: garantiza el affordance de edición en todos
                              // los casos (incluido el edge en que la línea perdió el match).
                              const needsRepair = lineNeedsStockRepair(l)
                              const stockBusy = repairingStockLineId !== null || repairingInvoiceStockBatch || mappingLoading
                              return (
                                <div key={l.id} className="p-3">
                                  {/* Cabecera de la fila: a la izquierda, área expandible
                                      (botón único) con el nombre + iconos de estado (X rojo /
                                      Check verde / RotateCcw ámbar) — solo visibles para manager.
                                      A la derecha, BLOQUE DE ACCIONES como hermano del botón anterior
                                      (no anidado) con AlertCircle clickeable (reparar stock) y
                                      Pencil (ajustar match). Esto evita HTML inválido (botones
                                      anidados vía role="button") que en algunos navegadores
                                      colapsa la zona de acciones y deja el lápiz invisible. */}
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (activeEditLineId === l.id) closeLineEdit()
                                        else void openLineEdit(l.id)
                                      }}
                                      className="flex-1 min-w-0 text-left flex items-center gap-2"
                                    >
                                      <span className="text-sm font-black text-zinc-900 truncate">
                                        {l.ingredient_name ? l.ingredient_name : l.original_name || 'Sin nombre'}
                                      </span>
                                      {isManager ? (
                                        <>
                                          {noMatch ? (
                                            <span
                                              className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-rose-600 text-white shrink-0"
                                              aria-label="Sin match"
                                              title="Sin match — pulsa el lápiz para mapear"
                                            >
                                              <X className="h-3 w-3" strokeWidth={3.5} />
                                            </span>
                                          ) : null}
                                          {stockApplied ? (
                                            <span
                                              className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-emerald-600 text-white shrink-0"
                                              aria-label="Stock aplicado"
                                              title="Stock aplicado"
                                            >
                                              <Check className="h-3 w-3" strokeWidth={3.5} />
                                            </span>
                                          ) : null}
                                          {rectified ? (
                                            <span
                                              className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-amber-500 text-white shrink-0"
                                              aria-label={`Stock rectificado (REV${stock?.rectifiedCount})`}
                                              title={`Stock rectificado (REV${stock?.rectifiedCount})`}
                                            >
                                              <RotateCcw className="h-3 w-3" strokeWidth={3} />
                                            </span>
                                          ) : null}
                                        </>
                                      ) : null}
                                    </button>

                                    {/* Acciones al extremo derecho (hermanas del botón expandir).
                                        shrink-0 para que NUNCA colapsen en pantallas estrechas. */}
                                    <div className="flex items-center gap-1 shrink-0">
                                      {needsRepair ? (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            void repairStockForLine(l.id)
                                          }}
                                          disabled={stockBusy}
                                          aria-label="Sin stock aplicado — pulsar para aplicar"
                                          title="Sin stock aplicado — pulsar para aplicar"
                                          className={cn(
                                            'min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl bg-amber-500 text-white active:scale-[0.99] transition',
                                            stockBusy && 'opacity-60 pointer-events-none'
                                          )}
                                        >
                                          {repairingStockLineId === l.id ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                          ) : (
                                            <AlertCircle className="h-4 w-4" strokeWidth={2.5} />
                                          )}
                                        </button>
                                      ) : null}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          void openLineEdit(l.id)
                                        }}
                                        className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl bg-zinc-50 border border-zinc-200 text-[#36606F] hover:bg-zinc-100 active:scale-[0.99] transition"
                                        aria-label={l.ingredient_id ? 'Ajustar match' : 'Mapear línea'}
                                        title={l.ingredient_id ? 'Ajustar match (cambiar factor o ingrediente)' : 'Mapear línea'}
                                      >
                                        <Pencil className="h-4 w-4" strokeWidth={2.5} />
                                      </button>
                                    </div>
                                  </div>

                                  {isEditing ? (
                                    <div className="mt-2 rounded-xl border border-[#36606F]/25 bg-[#36606F]/[0.12] p-2 sm:p-2.5">
                                    <div className="flex flex-col gap-2">
                                      {mappingError ? (
                                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs font-bold text-rose-800">
                                          {mappingError}
                                        </div>
                                      ) : null}

                                      {mappingLoading ? (
                                        <div className="flex items-center gap-2 py-2 text-xs font-semibold text-zinc-600">
                                          <Loader2 className="h-4 w-4 animate-spin text-[#36606F]" />
                                          Preparando edición…
                                        </div>
                                      ) : (
                                        <>
                                      <div className="flex flex-wrap items-stretch gap-1.5">
                                        <input
                                          value={d?.original_name ?? ''}
                                          onChange={(e) => setDraft(l.id, { original_name: e.target.value })}
                                          className="min-h-12 min-w-[8rem] flex-1 rounded-lg border border-zinc-200/90 bg-white px-2.5 text-sm font-black text-zinc-900 outline-none focus:border-[#36606F]/50"
                                          placeholder="Nombre línea"
                                        />
                                        <div className="relative min-h-12 min-w-[10rem] flex-[1.4]">
                                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                                          <input
                                            value={ingredientSearchQuery}
                                            onChange={(e) => void runIngredientSearch(e.target.value)}
                                            placeholder="Producto almacén…"
                                            className="h-full w-full rounded-lg border border-zinc-200/90 bg-white py-2 pl-9 pr-2 text-sm font-semibold text-zinc-900 outline-none focus:border-[#36606F]/40"
                                          />
                                        </div>
                                        <input
                                          id={`factor-top-${l.id}`}
                                          inputMode="decimal"
                                          value={factorByLineId[l.id] ?? '1'}
                                          onChange={(e) =>
                                            setFactorByLineId((p) => ({
                                              ...p,
                                              [l.id]: e.target.value,
                                            }))
                                          }
                                          title="Unidades de compra del ingrediente por 1 unidad del albarán"
                                          className="w-20 min-h-12 shrink-0 rounded-lg border border-zinc-200/90 bg-white px-2 text-sm font-bold text-zinc-900 outline-none focus:border-[#36606F]/40"
                                          placeholder="×"
                                          aria-label="Factor de conversión"
                                        />
                                        {(() => {
                                          const mappedSameIngredient =
                                            Boolean(l.ingredient_id) &&
                                            String(l.status ?? '') === 'mapped' &&
                                            String(selectedIngredientByLineId[l.id] ?? '') ===
                                              String(l.ingredient_id)
                                          return (
                                            <button
                                              type="button"
                                              onClick={() => void confirmMapping(l.id)}
                                              disabled={mappingLoading || !detail.supplier_id}
                                              className={cn(
                                                'min-h-12 shrink-0 rounded-lg bg-[#36606F] px-3 text-[11px] font-black uppercase tracking-wide text-white shadow-sm hover:bg-[#2d4f5c]',
                                                (mappingLoading || !detail.supplier_id) &&
                                                  'pointer-events-none opacity-50'
                                              )}
                                            >
                                              {mappedSameIngredient ? 'Guardar' : 'Vincular'}
                                            </button>
                                          )
                                        })()}
                                        <button
                                          type="button"
                                          onClick={closeLineEdit}
                                          className="min-h-12 min-w-12 shrink-0 inline-flex items-center justify-center rounded-lg border border-zinc-200/90 bg-white text-zinc-600 hover:bg-zinc-50"
                                          aria-label="Cerrar edición"
                                        >
                                          <X className="h-4 w-4" />
                                        </button>
                                      </div>

                                      {selectedIngredientByLineId[l.id] ? (
                                        <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1">
                                          <div className="flex min-w-0 items-center gap-1.5">
                                            <Check className="h-4 w-4 shrink-0 text-emerald-700" strokeWidth={2.5} />
                                            <span className="truncate text-xs font-black text-emerald-950">
                                              {ingredientPickLabelByLineId[l.id]?.trim() || 'Producto seleccionado'}
                                            </span>
                                          </div>
                                          <button
                                            type="button"
                                            className="shrink-0 text-[10px] font-bold uppercase text-emerald-900 underline-offset-2 hover:underline"
                                            onClick={() => {
                                              setSelectedIngredientByLineId((p) => ({ ...p, [l.id]: null }))
                                              setIngredientPickLabelByLineId((p) => ({ ...p, [l.id]: null }))
                                            }}
                                          >
                                            Cambiar
                                          </button>
                                        </div>
                                      ) : null}

                                      {ingredientSearchLoading ? (
                                        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500">
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                          Buscando…
                                        </div>
                                      ) : ingredientSearchResults.length ? (
                                        <div className="max-h-28 space-y-1 overflow-y-auto">
                                          {ingredientSearchResults.map((it) => (
                                            <button
                                              key={it.id}
                                              type="button"
                                              onClick={() => {
                                                setSelectedIngredientByLineId((p) => ({ ...p, [l.id]: it.id }))
                                                setIngredientPickLabelByLineId((p) => ({ ...p, [l.id]: it.name }))
                                              }}
                                              className={cn(
                                                'flex w-full min-h-12 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition active:scale-[0.99]',
                                                selectedIngredientByLineId[l.id] === it.id
                                                  ? 'border-[#36606F] bg-[#36606F]/8 ring-1 ring-[#36606F]/20'
                                                  : 'border-zinc-200 bg-white hover:bg-zinc-50'
                                              )}
                                            >
                                              <span className="truncate text-sm font-bold text-zinc-900">{it.name}</span>
                                              <span className="shrink-0 text-xs font-semibold text-zinc-500">
                                                {Number(it.current_price || 0).toFixed(2)}€/{it.purchase_unit || '—'}
                                              </span>
                                            </button>
                                          ))}
                                        </div>
                                      ) : ingredientSearchQuery.trim().length >= 2 ? (
                                        <p className="text-xs text-zinc-500">Sin resultados. Prueba otra palabra o crea el ingrediente.</p>
                                      ) : null}

                                        <div className="grid grid-cols-3 gap-1.5">
                                          <label className="min-w-0 block">
                                            <span
                                              className="text-[9px] font-black uppercase tracking-wider text-zinc-500"
                                              title="Si el PU es €/kg, indica los kg totales de la línea, no solo piezas."
                                            >
                                              Cant.
                                            </span>
                                            {canEdit ? (
                                              <input
                                                inputMode="decimal"
                                                value={d?.quantity ?? ''}
                                                onChange={(e) => setDraft(l.id, { quantity: e.target.value })}
                                                className="mt-0.5 w-full min-h-12 px-2 rounded-lg border border-zinc-200/90 bg-white text-sm font-bold text-zinc-800 outline-none focus:border-[#36606F]/50"
                                                placeholder="—"
                                              />
                                            ) : (
                                              <p className="mt-0.5 text-sm font-bold text-zinc-800">
                                                {l.quantity == null ? '—' : String(l.quantity)}
                                              </p>
                                            )}
                                          </label>
                                          <label className="min-w-0 block">
                                            <span className="text-[9px] font-black uppercase tracking-wider text-zinc-500">PU</span>
                                            {canEdit ? (
                                              <input
                                                inputMode="decimal"
                                                value={d?.unit_price ?? ''}
                                                onChange={(e) => setDraft(l.id, { unit_price: e.target.value })}
                                                className="mt-0.5 w-full min-h-12 px-2 rounded-lg border border-zinc-200/90 bg-white text-sm font-bold text-zinc-800 outline-none focus:border-[#36606F]/50"
                                                placeholder="—"
                                              />
                                            ) : (
                                              <p className="mt-0.5 text-sm font-bold text-zinc-800">{formatMaybeMoney(l.unit_price)}</p>
                                            )}
                                          </label>
                                          <label className="min-w-0 block">
                                            <span className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Total</span>
                                            {canEdit ? (
                                              <input
                                                inputMode="decimal"
                                                value={d?.total_price ?? ''}
                                                onChange={(e) => setDraft(l.id, { total_price: e.target.value })}
                                                className="mt-0.5 w-full min-h-12 px-2 rounded-lg border border-zinc-200/90 bg-white text-sm font-bold text-zinc-800 outline-none focus:border-[#36606F]/50"
                                                placeholder="—"
                                              />
                                            ) : (
                                              <p className="mt-0.5 text-sm font-bold text-zinc-800">{formatMaybeMoney(l.total_price)}</p>
                                            )}
                                          </label>
                                        </div>

                                      {!detail.supplier_id ? (
                                        <p className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] font-bold text-rose-700">
                                          Falta proveedor en el albarán.
                                        </p>
                                      ) : null}

                                      <div className="flex flex-wrap items-center gap-1.5 border-t border-[#36606F]/10 pt-2">
                                        {isLineDirty(l) ? (
                                          <button
                                            type="button"
                                            onClick={() => saveLine(l.id)}
                                            disabled={savingLineId === l.id}
                                            className={cn(
                                              'min-h-12 rounded-lg border border-[#36606F]/30 bg-white px-2.5 text-[10px] font-bold uppercase text-[#36606F]',
                                              savingLineId === l.id && 'opacity-60 pointer-events-none'
                                            )}
                                          >
                                            {savingLineId === l.id ? '…' : 'Guardar línea'}
                                          </button>
                                        ) : null}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const d = draftLines[l.id]
                                            const unitRaw = d?.unit_price?.trim()
                                              ? d.unit_price
                                              : l.unit_price == null
                                                ? ''
                                                : String(l.unit_price)
                                            const unitN = unitRaw === '' ? NaN : Number(String(unitRaw).replace(',', '.'))
                                            setWizardInvoiceContext({
                                              lineLabel: String(d?.original_name ?? l.original_name ?? '').trim() || null,
                                              quantity:
                                                d?.quantity?.trim() ||
                                                (l.quantity == null ? null : String(l.quantity)),
                                              unitPrice: Number.isFinite(unitN) ? unitN : null,
                                            })
                                            setWizardIngredientId(null)
                                            setWizardInitialName(l.original_name || '')
                                            setWizardTargetLineId(l.id)
                                            setWizardOpen(true)
                                          }}
                                          className="min-h-12 rounded-lg border border-zinc-200/90 bg-white px-2.5 text-[10px] font-bold uppercase tracking-wide text-zinc-700 hover:bg-zinc-50"
                                        >
                                          + Nuevo
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const d = draftLines[l.id]
                                            const unitRaw = d?.unit_price?.trim()
                                              ? d.unit_price
                                              : l.unit_price == null
                                                ? ''
                                                : String(l.unit_price)
                                            const unitN = unitRaw === '' ? NaN : Number(String(unitRaw).replace(',', '.'))
                                            setWizardInvoiceContext({
                                              lineLabel: String(d?.original_name ?? l.original_name ?? '').trim() || null,
                                              quantity:
                                                d?.quantity?.trim() ||
                                                (l.quantity == null ? null : String(l.quantity)),
                                              unitPrice: Number.isFinite(unitN) ? unitN : null,
                                            })
                                            setWizardIngredientId(selectedIngredientByLineId[l.id] ?? null)
                                            setWizardInitialName(null)
                                            setWizardTargetLineId(l.id)
                                            setWizardOpen(true)
                                          }}
                                          disabled={!selectedIngredientByLineId[l.id]}
                                          className={cn(
                                            'min-h-12 rounded-lg border border-zinc-200/90 bg-white px-2.5 text-[10px] font-bold uppercase tracking-wide text-[#36606F] hover:bg-zinc-50',
                                            !selectedIngredientByLineId[l.id] && 'pointer-events-none opacity-45'
                                          )}
                                        >
                                          Configurar precio
                                        </button>
                                        {stockApplied ? (
                                          <button
                                            type="button"
                                            onClick={() => void rectifyLine(l.id)}
                                            disabled={mappingLoading}
                                            className={cn(
                                              'min-h-12 rounded-lg border border-amber-200 bg-amber-50 px-2.5 text-[10px] font-bold uppercase text-amber-800',
                                              mappingLoading && 'opacity-60 pointer-events-none'
                                            )}
                                          >
                                            Rectificar stock
                                          </button>
                                        ) : null}
                                        {l.ingredient_id ? (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() => void editMapping(l.id)}
                                              disabled={mappingLoading}
                                              className={cn(
                                                'min-h-12 rounded-lg border border-zinc-200 bg-white px-2.5 text-[10px] font-bold uppercase text-zinc-700',
                                                mappingLoading && 'opacity-60 pointer-events-none'
                                              )}
                                            >
                                              Editar match
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => void removeMapping(l.id)}
                                              disabled={mappingLoading}
                                              className={cn(
                                                'min-h-12 rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-[10px] font-bold uppercase text-rose-700',
                                                mappingLoading && 'opacity-60 pointer-events-none'
                                              )}
                                            >
                                              Eliminar
                                            </button>
                                          </>
                                        ) : null}
                                      </div>
                                        </>
                                      )}
                                    </div>
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
                        key={wizardIngredientId ?? 'create'}
                        ingredientId={wizardIngredientId}
                        initialName={wizardInitialName ?? undefined}
                        mode={wizardIngredientId ? 'editPricing' : 'create'}
                        flow="express"
                        invoiceContext={wizardInvoiceContext ?? undefined}
                        onSaved={(id, meta) => {
                          const lineId = wizardTargetLineId
                          if (!lineId) return
                          setSelectedIngredientByLineId((p) => ({ ...p, [lineId]: id }))
                          const nm = meta?.name?.trim()
                          if (nm) setIngredientPickLabelByLineId((p) => ({ ...p, [lineId]: nm }))
                          const f = meta?.suggestedConversionFactor
                          if (f != null && Number.isFinite(f) && f > 0) {
                            setFactorByLineId((p) => ({ ...p, [lineId]: String(f) }))
                          }
                        }}
                        onClose={() => {
                          setWizardOpen(false)
                          setWizardIngredientId(null)
                          setWizardInitialName(null)
                          setWizardTargetLineId(null)
    setWizardInvoiceContext(null)
                          setWizardInvoiceContext(null)
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

      {invoiceImageViewerOpen && modalContainer && invoiceImageSheetOptions.length > 1
        ? createPortal(
            <div
              className="fixed inset-0 z-[10100] flex flex-col bg-zinc-950/95 backdrop-blur-md animate-in fade-in duration-150"
              role="dialog"
              aria-modal="true"
              aria-label="Visor de hojas del albarán"
              onClick={(e) => {
                if (e.target === e.currentTarget) setInvoiceImageViewerOpen(false)
              }}
            >
              <div className="flex shrink-0 items-center justify-between gap-3 bg-[#36606F] px-3 py-3 text-white md:px-5">
                <p className="min-w-0 flex-1 truncate text-center text-[11px] font-black uppercase tracking-wide md:text-xs">
                  {invoiceImageSheetOptions[invoiceCarouselIndex]?.label ?? 'Hoja'}
                </p>
                <button
                  type="button"
                  onClick={() => setInvoiceImageViewerOpen(false)}
                  className="min-h-9 min-w-9 shrink-0 rounded-xl text-white hover:bg-white/10 active:scale-[0.99] md:min-h-[48px] md:min-w-[48px]"
                  aria-label="Cerrar visor"
                >
                  <X className="h-5 w-5" strokeWidth={2.5} />
                </button>
              </div>

              <div
                className="flex min-h-0 flex-1 flex-col gap-1 p-2 md:p-4"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="relative min-h-0 shrink-0 overflow-visible">
                  <button
                    type="button"
                    className={cn(
                      'absolute left-1 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-[#36606F] shadow-md ring-1 ring-zinc-200/90 hover:bg-white md:flex',
                      invoiceCarouselIndex <= 0 && 'pointer-events-none opacity-35'
                    )}
                    aria-label="Hoja anterior"
                    onClick={() => scrollInvoiceCarouselToIndex(invoiceCarouselIndex - 1)}
                  >
                    <ChevronLeft className="h-6 w-6" strokeWidth={2.5} />
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'absolute right-1 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-[#36606F] shadow-md ring-1 ring-zinc-200/90 hover:bg-white md:flex',
                      invoiceCarouselIndex >= invoiceImageSheetOptions.length - 1 &&
                        'pointer-events-none opacity-35'
                    )}
                    aria-label="Hoja siguiente"
                    onClick={() => scrollInvoiceCarouselToIndex(invoiceCarouselIndex + 1)}
                  >
                    <ChevronRight className="h-6 w-6" strokeWidth={2.5} />
                  </button>

                  <div
                    ref={invoiceCarouselRef}
                    onScroll={onInvoiceCarouselScroll}
                    className={cn(
                      'touch-pan-x flex w-full snap-x snap-mandatory overflow-x-auto overflow-y-visible bg-transparent',
                      'min-h-[10rem] h-[min(72dvh,calc(100svh-10rem))] md:h-[min(70vh,calc(100vh-12rem))]',
                      '[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
                    )}
                  >
                    {invoiceImageSheetOptions.map((opt) => (
                      <div
                        key={opt.key}
                        className="box-border flex h-full min-h-0 min-w-full shrink-0 snap-center snap-always items-center justify-center px-2 pb-1 pt-4"
                      >
                        <div className="relative max-h-full max-w-full">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={opt.url}
                            alt={opt.label}
                            className="block h-auto max-h-[min(62dvh,calc(100svh-14rem))] w-auto max-w-full rounded-xl object-contain shadow-lg ring-1 ring-white/10 md:max-h-[min(64vh,calc(100vh-14rem))]"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex shrink-0 justify-center gap-0 pb-1 pt-0">
                  {invoiceImageSheetOptions.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => scrollInvoiceCarouselToIndex(i)}
                      aria-label={`Ir a ${invoiceImageSheetOptions[i]?.label ?? `hoja ${i + 1}`}`}
                      aria-current={i === invoiceCarouselIndex ? 'true' : undefined}
                      className={cn(
                        'inline-flex min-h-9 min-w-[1.125rem] shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 shadow-none ring-0 outline-none active:scale-95',
                        i === invoiceCarouselIndex ? 'text-white' : 'text-zinc-500'
                      )}
                    >
                      <span
                        className={cn(
                          'block h-1.5 w-1.5 rounded-full transition-colors',
                          i === invoiceCarouselIndex ? 'bg-white' : 'bg-current'
                        )}
                      />
                    </button>
                  ))}
                </div>

                <p className="shrink-0 pb-2 text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                  Desliza para cambiar de hoja
                </p>
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
                <select
                  value={filterSupplierId}
                  onChange={(e) => setFilterSupplierId(e.target.value)}
                  className="mt-1 w-full min-h-[48px] px-3 rounded-xl border border-zinc-200 bg-white text-sm font-bold"
                >
                  <option value="">Todos</option>
                  {filterSuppliers.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {filterSuppliersLoading ? <p className="mt-2 text-xs font-bold text-zinc-500">Cargando proveedores…</p> : null}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFilterFrom('')
                    setFilterTo('')
                    setFilterSupplierId('')
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
    </DashboardDetailLayout>
  )
}

