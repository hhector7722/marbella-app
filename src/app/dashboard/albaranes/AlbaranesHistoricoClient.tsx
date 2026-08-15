'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import { createPortal } from 'react-dom'
import {
  AlertCircle,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  MinusCircle,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Truck,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { assessScannerImageReadability } from '@/lib/scanner-image-quality'
import { compressImageFileToDataUri } from '@/lib/scanner-image-compress'
import { cn } from '@/lib/utils'
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking'
import { useTrackModalApply } from '@/hooks/useTrackModalApply'
import { albaranesFilterSummary, namedEntitySummary } from '@/lib/usage/modal-apply'
import { LineEditModal } from '@/components/albaranes/LineEditModal'
import { LineMappingModal } from '@/components/albaranes/LineMappingModal'
import { DocumentEvidenceModal } from '@/components/albaranes/DocumentEvidenceModal'
import { PinchZoomViewport } from '@/components/ui/PinchZoomViewport'
import { getSupplierLogo } from '@/lib/supplier-logos'
import {
  invoiceLineRequiresStock,
  isInvoiceLineExcluded,
  isInvoiceLineResolved,
} from '@/lib/albaranes-line-status'
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout'
import { Modal } from '@/components/ui/modal'
import { IngredientWizard, type IngredientWizardInvoiceContext } from '@/components/ingredients/IngredientWizard'
import type {
  PurchaseInvoiceDetail,
  PurchaseInvoiceLine,
  PurchaseInvoiceListItem,
  SupplierListItem,
} from './actions'
import { appendScannerPageToInvoiceAction, replaceScannerImageAction, retryOcrInvoiceAction } from '../scanner/actions'
import { ScannerClient } from '../scanner/ScannerClient'
import {
  autoMapKnownLinesAction,
  deletePurchaseInvoiceAction,
  excludeInvoiceLineFromMappingAction,
  markInvoiceLineExpenseOnlyAction,
  restoreInvoiceLineFromExpenseOnlyAction,
  getInvoiceStockStatusesAction,
  getPurchaseInvoiceDetailAction,
  listPurchaseInvoicesAction,
  listSuppliersForFilterAction,
  rectifyInvoiceLineStockAction,
  repairOrphanLineStockAction,
  repairOrphanLinesInInvoiceAction,
  searchSuppliersForInvoiceAction,
  setPurchaseInvoiceSupplierAction,
  unmapInvoiceLineAction,
  updatePurchaseInvoiceLineAction,
} from './actions'
import type { AutoMapReport } from './actions'

function formatDateTitle(v: string | null | undefined) {
  const t = String(v ?? '').trim()
  if (!t) return '—'
  // `invoice_date` viene como YYYY-MM-DD (DATE). Reordenar por componentes (sin Date) → DD/MM/YYYY.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : t
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
  const searchParams = useSearchParams()
  const trackAlbaranesSupplier = useTrackModalApply('albaranes-supplier-picker', 'Proveedor albarán')
  const trackAlbaranesFilter = useTrackModalApply('albaranes-filter', 'Filtro albaranes')
  const deepLinkHandledRef = useRef<string | null>(null)

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
  /** Línea abierta en el modal de edición (datos + acciones). */
  const [lineForEditModal, setLineForEditModal] = useState<PurchaseInvoiceLine | null>(null)
  /** Línea abierta en el modal de mapeo/calibración dimensional. */
  const [lineForMappingModal, setLineForMappingModal] = useState<PurchaseInvoiceLine | null>(null)
  const [lineForEvidenceModal, setLineForEvidenceModal] = useState<string | null>(null)
  const [evidenceVersion, setEvidenceVersion] = useState(0)
  /** Línea de Evidence a reabrir al cerrar Edit/Mapping (Evidence-first). */
  const evidenceContextLineIdRef = useRef<string | null>(null)
  const [lineActionBusy, setLineActionBusy] = useState(false)
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
  const replaceImageInputRef = useRef<HTMLInputElement>(null)
  const [appendSheetBusy, setAppendSheetBusy] = useState(false)
  const [ocrActionBusy, setOcrActionBusy] = useState(false)
  const [appendSheetCapture, setAppendSheetCapture] = useState<'environment' | undefined>('environment')
  /** Visor carrusel (varias hojas), mismo patrón que el borrador del escáner. */
  const [invoiceImageViewerOpen, setInvoiceImageViewerOpen] = useState(false)
  const [invoiceCarouselIndex, setInvoiceCarouselIndex] = useState(0)
  const invoiceCarouselRef = useRef<HTMLDivElement>(null)
  const invoiceCarouselIndexRef = useRef(0)
  const invoiceImageViewerOpenRef = useRef(false)

  useModalUsageTracking({
    open: selectedId !== null,
    usageId: 'albaranes-invoice-detail',
    usageLabel: 'Detalle albarán',
  })
  useModalUsageTracking({
    open: supplierPickerOpen,
    usageId: 'albaranes-supplier-picker',
    usageLabel: 'Asignar proveedor',
  })
  useModalUsageTracking({
    open: wizardOpen,
    usageId: 'albaranes-ingredient-wizard',
    usageLabel: 'Asistente ingrediente',
  })
  useModalUsageTracking({
    open: invoiceImageViewerOpen,
    usageId: 'albaranes-image-viewer',
    usageLabel: 'Visor hojas albarán',
  })
  useModalUsageTracking({
    open: filterOpen,
    usageId: 'albaranes-filter',
    usageLabel: 'Filtrar albaranes',
  })

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
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    if (isIOS) setAppendSheetCapture(undefined)
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
    const allResolved = lines.every((l) => isInvoiceLineResolved(l))
    const allStockOk = lines.every(
      (l) => !invoiceLineRequiresStock(l) || stockStatusByLineId[l.id]?.stockApplied === true
    )
    const fully = allResolved && allStockOk
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.id === detail.id)
      if (idx < 0) return prev
      const prevRow = prev[idx]!
      const nextStatus = fully
        ? 'mapped'
        : prevRow.status === 'mapped'
          ? 'pending_mapping'
          : prevRow.status
      if (prevRow.is_fully_processed === fully && prevRow.status === nextStatus) return prev
      const next = prev.slice()
      next[idx] = { ...prevRow, is_fully_processed: fully, status: nextStatus }
      return next
    })
  }, [detail, stockStatusByLineId])

  function lineNeedsStockRepair(l: PurchaseInvoiceDetail['lines'][number]) {
    if (isInvoiceLineExcluded(l)) return false
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

  // Mientras haya albaranes en OCR, refrescar la lista cada pocos segundos.
  const hasProcessingItems = useMemo(
    () => items.some((it) => String(it.status ?? '').toLowerCase() === 'processing'),
    [items]
  )

  useEffect(() => {
    if (!hasProcessingItems) return
    const t = window.setInterval(() => {
      void (async () => {
        const res = await listPurchaseInvoicesAction({ limit: 60 })
        if (!res.success) return
        setItems(res.items)
        const sid = selectedId
        if (!sid) return
        const row = res.items.find((x) => x.id === sid)
        if (!row) return
        const st = String(row.status ?? '').toLowerCase()
        if (st === 'processing') return
        const detailRes = await getPurchaseInvoiceDetailAction(sid)
        if (detailRes.success) {
          setDetail(detailRes.detail)
          const nextDraft: Record<string, { original_name: string; quantity: string; unit_price: string; total_price: string }> = {}
          for (const l of detailRes.detail.lines) {
            nextDraft[l.id] = {
              original_name: l.original_name ?? '',
              quantity: l.quantity == null ? '' : String(l.quantity),
              unit_price: l.unit_price == null ? '' : String(l.unit_price),
              total_price: l.total_price == null ? '' : String(l.total_price),
            }
          }
          setDraftLines(nextDraft)
        }
      })()
    }, 4000)
    return () => window.clearInterval(t)
  }, [hasProcessingItems, selectedId])

  async function handleRetryOcr() {
    if (!detail?.id) return
    setOcrActionBusy(true)
    try {
      const res = await retryOcrInvoiceAction(detail.id)
      if (!res.success) {
        toast.error(res.message)
        return
      }
      toast.success('Reintentando lectura en segundo plano…')
      const refreshed = await getPurchaseInvoiceDetailAction(detail.id)
      if (refreshed.success) setDetail(refreshed.detail)
      refresh()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al reintentar')
    } finally {
      setOcrActionBusy(false)
    }
  }

  async function handleReplaceImageFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (replaceImageInputRef.current) replaceImageInputRef.current.value = ''
    if (!file || !detail?.id) return

    setOcrActionBusy(true)
    try {
      const dataUri = await compressImageFileToDataUri(file)
      const q = await assessScannerImageReadability(dataUri)
      if (!q.ok) {
        toast.error(q.message)
        return
      }
      const fname = file.name.replace(/\.[^/.]+$/, '') + '.jpg'
      const res = await replaceScannerImageAction({
        invoiceId: detail.id,
        base64DataUri: dataUri,
        filename: fname,
      })
      if (!res.success) {
        toast.error(res.message)
        return
      }
      toast.success('Foto sustituida. Se está leyendo en segundo plano.')
      const refreshed = await getPurchaseInvoiceDetailAction(detail.id)
      if (refreshed.success) setDetail(refreshed.detail)
      refresh()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al sustituir la foto')
    } finally {
      setOcrActionBusy(false)
    }
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
    setLineForEditModal(null)
    setLineForMappingModal(null)
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

  useEffect(() => {
    const targetId = searchParams.get('id')?.trim()
    if (!targetId || deepLinkHandledRef.current === targetId) return
    deepLinkHandledRef.current = targetId
    void openDetail(targetId)
  }, [searchParams])

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
      toast.success('Hoja añadida. Se está leyendo en segundo plano.')
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
    setLineForEditModal(null)
    setLineForMappingModal(null)
    setLineForEvidenceModal(null)
    evidenceContextLineIdRef.current = null
    setLineActionBusy(false)
    setWizardOpen(false)
    setWizardIngredientId(null)
    setWizardInitialName(null)
    setWizardTargetLineId(null)
    setWizardInvoiceContext(null)
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

  function reopenEvidenceFromContext() {
    const lineId = evidenceContextLineIdRef.current
    setLineForEditModal(null)
    setLineForMappingModal(null)
    if (!lineId) return
    setEvidenceVersion((v) => v + 1)
    setLineForEvidenceModal(lineId)
  }

  async function saveLine(lineId: string): Promise<boolean> {
    if (!detail) return false
    setSaveError(null)
    setSaveWarning(null)
    setSavingLineId(lineId)
    try {
      const d = draftLines[lineId]
      if (!d) {
        setSaveError('No hay borrador para esta línea.')
        return false
      }

      const qty = d.quantity.trim() === '' ? null : Number(d.quantity)
      const unit = d.unit_price.trim() === '' ? null : Number(d.unit_price)
      const total = d.total_price.trim() === '' ? null : Number(d.total_price)

      if (qty != null && !Number.isFinite(qty)) {
        setSaveError('Cantidad inválida.')
        return false
      }
      if (unit != null && !Number.isFinite(unit)) {
        setSaveError('Precio unitario inválido.')
        return false
      }
      if (total != null && !Number.isFinite(total)) {
        setSaveError('Total inválido.')
        return false
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
        return false
      }
      if (res.warning) setSaveWarning(res.warning)

      // Refrescar detalle para ver cambios y mantener consistencia
      const refreshed = await getPurchaseInvoiceDetailAction(detail.id)
      if (!refreshed.success) {
        setSaveError(`Guardado OK, pero no se pudo recargar: ${refreshed.message}`)
        return false
      }
      setDetail(refreshed.detail)
      setEvidenceVersion((v) => v + 1)
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
      return true
    } finally {
      setSavingLineId(null)
    }
  }

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
      const supplierName =
        supplierResults.find((s) => s.id === supplierId)?.name ??
        detail.supplier_name ??
        String(supplierId)
      trackAlbaranesSupplier(namedEntitySummary(supplierName), {
        supplierId: String(supplierId),
        invoiceId: detail.id,
      })
    } finally {
      setSupplierSaving(false)
    }
  }

  function openLineMappingModal(line: PurchaseInvoiceLine) {
    setLineForEditModal(null)
    setLineForEvidenceModal(null)
    setWizardOpen(false)
    setLineForMappingModal(line)
  }

  function openWizardForLine(
    line: PurchaseInvoiceLine,
    opts: { ingredientId: string | null; initialName: string | null }
  ) {
    const d = draftLines[line.id]
    const unitRaw = d?.unit_price?.trim()
      ? d.unit_price
      : line.unit_price == null
        ? ''
        : String(line.unit_price)
    const unitN = unitRaw === '' ? NaN : Number(String(unitRaw).replace(',', '.'))
    setWizardInvoiceContext({
      lineLabel: String(d?.original_name ?? line.original_name ?? '').trim() || null,
      quantity: d?.quantity?.trim() || (line.quantity == null ? null : String(line.quantity)),
      unitPrice: Number.isFinite(unitN) ? unitN : null,
    })
    setWizardIngredientId(opts.ingredientId)
    setWizardInitialName(opts.initialName)
    setWizardTargetLineId(line.id)
    // Conserva evidenceContextLineIdRef: al cerrar Mapping se vuelve a Evidence.
    setLineForEvidenceModal(null)
    setLineForEditModal(null)
    setLineForMappingModal(null)
    setWizardOpen(true)
  }

  async function returnToMappingAfterWizard(lineId: string | null) {
    setWizardOpen(false)
    setWizardIngredientId(null)
    setWizardInitialName(null)
    setWizardTargetLineId(null)
    setWizardInvoiceContext(null)
    if (!lineId || !detail) return
    await refreshDetailAndStock()
    const dRes = await getPurchaseInvoiceDetailAction(detail.id)
    if (!dRes.success) return
    setDetail(dRes.detail)
    const line = dRes.detail.lines.find((l) => l.id === lineId)
    if (line) openLineMappingModal(line)
  }

  async function rectifyLine(lineId: string) {
    if (!detail) return
    const line = detail.lines.find((l) => l.id === lineId)
    const ingredientId = line?.ingredient_id ?? null
    if (!ingredientId) {
      toast.error('Esta línea no tiene ingrediente asignado.')
      return
    }
    const status = stockStatusByLineId[lineId]
    if (!status?.stockApplied || status.stockAppliedQty == null) {
      toast.error('No hay stock aplicado previo para rectificar.')
      return
    }

    const next = window.prompt(
      `Cantidad correcta a aplicar en stock (unidad base). Antes: ${status.stockAppliedQty}`,
      String(status.stockAppliedQty)
    )
    if (next == null) return
    const newQty = Number(String(next).replace(',', '.'))
    if (!Number.isFinite(newQty) || newQty <= 0) {
      toast.error('Cantidad inválida.')
      return
    }

    setLineActionBusy(true)
    try {
      const res = await rectifyInvoiceLineStockAction({ lineId, ingredientId, newQtyApplied: newQty })
      if (!res.success) {
        toast.error(res.message)
        return
      }
      await refreshDetailAndStock()
    } finally {
      setLineActionBusy(false)
    }
  }

  // Refresca detalle + estado de stock de un albarán. Sincroniza la línea del modal si está abierta.
  async function refreshDetailAndStock() {
    if (!detail) return
    const dRes = await getPurchaseInvoiceDetailAction(detail.id)
    if (!dRes.success) {
      toast.error(`No se pudo recargar el albarán: ${dRes.message}`)
      return
    }
    setDetail(dRes.detail)
    setEvidenceVersion((v) => v + 1)
    setLineForEditModal((prev) => {
      if (!prev) return null
      return dRes.detail.lines.find((l) => l.id === prev.id) ?? null
    })
    setLineForMappingModal((prev) => {
      if (!prev) return null
      return dRes.detail.lines.find((l) => l.id === prev.id) ?? null
    })
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

  async function excludeLineFromMapping(lineId: string) {
    setLineActionBusy(true)
    try {
      const res = await excludeInvoiceLineFromMappingAction({ lineId })
      if (!res.success) {
        toast.error(res.message)
        return
      }
      toast.success('Línea marcada como portes/ajuste (sin ingrediente).')
      await refreshDetailAndStock()
    } finally {
      setLineActionBusy(false)
    }
  }

  async function restoreExcludedLine(lineId: string) {
    setLineActionBusy(true)
    try {
      const res = await unmapInvoiceLineAction({ lineId })
      if (!res.success) {
        toast.error(res.message)
        return
      }
      await refreshDetailAndStock()
    } finally {
      setLineActionBusy(false)
    }
  }

  async function markLineExpenseOnly(lineId: string) {
    setLineActionBusy(true)
    try {
      const res = await markInvoiceLineExpenseOnlyAction({ lineId })
      if (!res.success) {
        toast.error(res.message)
        return
      }
      toast.success('Línea marcada como gasto (sin stock).')
      await refreshDetailAndStock()
    } finally {
      setLineActionBusy(false)
    }
  }

  async function restoreExpenseOnlyLine(lineId: string) {
    setLineActionBusy(true)
    try {
      const res = await restoreInvoiceLineFromExpenseOnlyAction({ lineId })
      if (!res.success) {
        toast.error(res.message)
        return
      }
      await refreshDetailAndStock()
    } finally {
      setLineActionBusy(false)
    }
  }

  // "Editar match": deshace el mapeo actual (revierte stock) y abre el modal
  // para volver a mapear. Mantiene el aprendizaje en el diccionario porque el
  // usuario va a re-mapear (si lo cambia, el upsert lo sobrescribe).
  async function editMapping(lineId: string) {
    if (!detail) return
    setLineActionBusy(true)
    try {
      const res = await unmapInvoiceLineAction({ lineId })
      if (!res.success) {
        toast.error(res.message)
        return
      }
      const dRes = await getPurchaseInvoiceDetailAction(detail.id)
      if (!dRes.success) {
        toast.error(`Match deshecho, pero no se pudo recargar: ${dRes.message}`)
        return
      }
      setDetail(dRes.detail)
      const st = await getInvoiceStockStatusesAction({ lineIds: dRes.detail.lines.map((l) => l.id) })
      if (st.success) {
        const map: Record<string, { stockApplied: boolean; stockAppliedQty: number | null; rectifiedCount: number }> = {}
        for (const s of st.statuses)
          map[s.lineId] = { stockApplied: s.stockApplied, stockAppliedQty: s.stockAppliedQty, rectifiedCount: s.rectifiedCount }
        setStockStatusByLineId(map)
      }
      const line = dRes.detail.lines.find((l) => l.id === lineId)
      if (line) openLineMappingModal(line)
    } finally {
      setLineActionBusy(false)
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
    setLineActionBusy(true)
    try {
      const res = await unmapInvoiceLineAction({ lineId, removeFromDictionary: true })
      if (!res.success) {
        toast.error(res.message)
        return
      }
      if (lineForEditModal?.id === lineId) setLineForEditModal(null)
      if (lineForMappingModal?.id === lineId) setLineForMappingModal(null)
      await refreshDetailAndStock()
      evidenceContextLineIdRef.current = lineId
      reopenEvidenceFromContext()
    } finally {
      setLineActionBusy(false)
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
      setLineForEditModal(null)
      setLineForMappingModal(null)
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
          'min-h-9 min-w-9 inline-flex items-center justify-center text-white hover:opacity-70 active:scale-[0.99] transition shrink-0',
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
          'min-h-9 min-w-9 inline-flex items-center justify-center text-white hover:opacity-70 active:scale-[0.99] transition shrink-0',
          isPending && 'opacity-60 pointer-events-none'
        )}
      >
        {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}
      </button>
    </>
  )

  return (
    <DashboardDetailLayout
      title="Albaranes"
      backHref="/dashboard"
      maxWidthClass="max-w-5xl"
      showBackButton={false}
      rightSlot={headerActions}
      compactHeader
      contentClassName="p-3 md:p-4 pt-2 md:pt-3"
    >
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex-1 min-w-0 bg-white rounded-xl border border-zinc-100 shadow-sm px-2.5 py-0.5 flex items-center gap-1.5">
          <Search className="h-4 w-4 text-zinc-400 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full outline-none text-sm font-semibold text-zinc-800 placeholder:text-zinc-400 min-h-8"
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
            className="min-h-8 min-w-8 inline-flex items-center justify-center text-[#36606F] hover:opacity-80 active:scale-[0.99] transition shrink-0"
          >
            <Filter className="h-4 w-4" />
          </button>
        </div>
        <ScannerClient onSuccess={refresh} compactTrigger />
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
            {autoMapReport.pendingInvoices.length > 0 ? (
              <div className="mt-2.5 space-y-1.5">
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-800/80">
                  {autoMapReport.pendingInvoices.length === 1
                    ? 'Albarán con líneas pendientes'
                    : 'Albaranes con líneas pendientes'}
                </p>
                {autoMapReport.pendingInvoices.map((inv) => (
                  <button
                    key={inv.invoiceId}
                    type="button"
                    onClick={() => void openDetail(inv.invoiceId)}
                    className="w-full min-h-12 rounded-lg border border-emerald-300/60 bg-white px-3 py-2 text-left text-[11px] font-bold text-emerald-950 hover:bg-emerald-100/50 active:scale-[0.99] transition flex items-center justify-between gap-2"
                  >
                    <span className="min-w-0 truncate">
                      {inv.supplierName ?? 'Proveedor pendiente'}
                      {inv.invoiceDate ? ` · ${formatDateTitle(inv.invoiceDate)}` : ''}
                      {inv.invoiceNumber ? ` · ${inv.invoiceNumber}` : ''}
                    </span>
                    <span className="shrink-0 rounded-full bg-emerald-200/80 px-2 py-0.5 text-[10px] font-black tabular-nums">
                      {inv.pendingLineCount} línea{inv.pendingLineCount === 1 ? '' : 's'}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
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
          <div className="px-1.5 py-1 overflow-auto flex-1 min-h-0">
            {filtered.length === 0 ? (
              <div className="px-2 py-6 text-xs font-medium text-zinc-500">No hay albaranes que coincidan.</div>
            ) : (
              <div className="flex flex-col">
                {filtered.map((it) => {
                  const supplier = it.supplier_name ? it.supplier_name : 'Proveedor pendiente'
                  // Prioridad: image_url de BD > logo local en /public/icons/prov > icono genérico.
                  const logo = getSupplierLogo(it.supplier_image_url, it.supplier_name)
                  const st = String(it.status ?? '').toLowerCase()
                  const accountingReady = st === 'mapped' || st === 'completed'
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => openDetail(it.id)}
                      className="w-full text-left rounded-lg px-1.5 py-1.5 transition min-h-12 active:scale-[0.995] hover:bg-zinc-50 border-b border-zinc-100 last:border-b-0"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Avatar proveedor: <img> nativo para no chocar con remotePatterns. Sin marco. */}
                        <div className="shrink-0 h-8 w-8 flex items-center justify-center">
                          {logo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={logo} alt={supplier} className="h-8 w-8 object-contain" />
                          ) : (
                            <Truck className="h-5 w-5 text-zinc-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="min-w-0 flex items-center gap-1.5 overflow-hidden">
                              <p className="text-xs font-semibold text-zinc-900 truncate min-w-0">
                                {supplier}
                              </p>
                              <p className="text-[10px] font-normal text-zinc-500 tabular-nums shrink-0 whitespace-nowrap">
                                {formatDateTitle(it.invoice_date)}
                              </p>
                            </div>
                            <p className="text-xs font-semibold text-zinc-900 tabular-nums shrink-0 whitespace-nowrap ml-auto">
                              {formatMaybeMoney(it.total_amount)}
                            </p>
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center justify-center min-w-[1.25rem]">
                          {st === 'processing' ? (
                            <span
                              className="inline-flex items-center gap-0.5 rounded-md bg-sky-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-sky-800"
                              aria-label="Procesando OCR"
                              title="Leyendo albarán en segundo plano"
                            >
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Leyendo
                            </span>
                          ) : st === 'ocr_failed' ? (
                            <span
                              className="inline-flex items-center gap-0.5 rounded-md bg-rose-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-rose-800"
                              aria-label="Error de lectura"
                              title={it.ocr_error ?? 'No se pudo leer el albarán'}
                            >
                              <AlertCircle className="h-3 w-3" />
                              Error
                            </span>
                          ) : accountingReady ? (
                            <span
                              className="inline-flex text-emerald-600"
                              aria-label="Albarán contabilizado"
                              title="Albarán contabilizado (entra en PyG)"
                            >
                              <Check className="h-3.5 w-3.5" strokeWidth={3} />
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
              <div className="bg-white rounded-[20px] shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
                <input
                  ref={appendSheetInputRef}
                  type="file"
                  accept="image/*"
                  capture={appendSheetCapture}
                  className="hidden"
                  onChange={handleAppendSheetFileChange}
                />
                <input
                  ref={replaceImageInputRef}
                  type="file"
                  accept="image/*"
                  capture={appendSheetCapture}
                  className="hidden"
                  onChange={handleReplaceImageFileChange}
                />
                {/* 1. CABECERA */}
                <div className="flex shrink-0 items-center justify-between bg-[#36606F] px-4 py-3 relative">
                  <div className="min-w-0 flex-1 pr-[9.5rem]">
                    {detail ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSupplierPickerOpen(true)
                          setSupplierQuery('')
                          setSupplierResults([])
                          setSupplierError(null)
                        }}
                        className="text-left w-full min-w-0 text-sm font-black uppercase tracking-wider text-white truncate hover:opacity-80 transition-opacity"
                        title="Cambiar proveedor"
                      >
                        {detail.supplier_name ?? 'Añadir proveedor'}
                      </button>
                    ) : (
                      <p className="text-sm font-black uppercase tracking-wider text-white truncate min-w-0">
                        Proveedor pendiente
                      </p>
                    )}
                  </div>

                  {/* Acciones flotantes en la cabecera: iconos sin fondo circular */}
                  <div className="absolute top-1/2 -translate-y-1/2 right-2 flex items-center gap-0.5">
                    {detail?.id && detail?.supplier_id ? (
                      <button
                        type="button"
                        onClick={() => void runAutoMap(detail.id)}
                        disabled={autoMapLoading}
                        aria-label="Auto-mapear aprendidos"
                        title="Auto-mapear líneas pendientes con texto ya aprendido para este proveedor"
                        className={cn(
                          'flex min-h-12 min-w-12 items-center justify-center text-white/90 transition-opacity hover:opacity-100 opacity-90 active:scale-[0.99]',
                          autoMapLoading && 'opacity-60 pointer-events-none'
                        )}
                      >
                        {autoMapLoading ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <Sparkles className="h-5 w-5" />
                        )}
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
                          'flex min-h-12 min-w-12 items-center justify-center text-white/90 transition-opacity hover:text-rose-200 hover:opacity-100 opacity-90 active:scale-[0.99]',
                          deletingInvoice && 'opacity-60 pointer-events-none'
                        )}
                      >
                        {deletingInvoice ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <Trash2 className="h-5 w-5" />
                        )}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={closeModal}
                      className="flex min-h-12 min-w-12 items-center justify-center text-white/90 transition-opacity hover:opacity-100 opacity-90 active:scale-[0.99]"
                      aria-label="Cerrar"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto bg-[#fafafa] p-2.5 sm:p-3 space-y-2.5">
                  {/* Status & Errors */}
                  {deleteError ? (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-2.5 py-2 text-xs font-medium text-red-700">
                      Eliminar: {deleteError}
                    </div>
                  ) : null}
                  {saveError ? (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-2.5 py-2 text-xs font-medium text-red-700">{saveError}</div>
                  ) : null}
                  {saveWarning ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 text-xs font-medium text-amber-800">
                      {saveWarning}
                    </div>
                  ) : null}

                  {detail && !isLoadingDetail ? (
                    (() => {
                      const st = String(detail.status ?? '').toLowerCase()
                      if (st === 'processing') {
                        return (
                          <div className="flex items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4">
                            <Loader2 className="h-6 w-6 shrink-0 animate-spin text-sky-700" />
                            <p className="text-sm font-black text-sky-900 leading-snug">
                              Leyendo el albarán en segundo plano. Las líneas aparecerán en unos segundos.
                            </p>
                          </div>
                        )
                      }
                      if (st === 'ocr_failed') {
                        return (
                          <div className="flex flex-col gap-4 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                            <div className="flex items-start gap-3">
                              <AlertCircle className="h-6 w-6 shrink-0 text-rose-700" />
                              <div className="min-w-0">
                                <p className="text-sm font-black text-rose-900">No se pudo leer el albarán</p>
                                <p className="mt-1 text-sm font-medium text-rose-800">
                                  {detail.ocr_error?.trim() || 'Error de OCR. Reintenta o sustituye la foto.'}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <button
                                type="button"
                                onClick={() => void handleRetryOcr()}
                                disabled={ocrActionBusy}
                                className={cn(
                                  'min-h-12 flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#36606F] px-4 text-xs font-black uppercase tracking-wider text-white active:scale-[0.99] transition',
                                  ocrActionBusy && 'opacity-60 pointer-events-none'
                                )}
                              >
                                {ocrActionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                                Reintentar lectura
                              </button>
                              <button
                                type="button"
                                onClick={() => replaceImageInputRef.current?.click()}
                                disabled={ocrActionBusy}
                                className={cn(
                                  'min-h-12 flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-rose-300 bg-white px-4 text-xs font-black uppercase tracking-wider text-rose-900 active:scale-[0.99] transition',
                                  ocrActionBusy && 'opacity-60 pointer-events-none'
                                )}
                              >
                                <Camera className="h-4 w-4" />
                                Sustituir foto
                              </button>
                            </div>
                          </div>
                        )
                      }
                      return null
                    })()
                  ) : null}

                  {mappedLinesWithoutStockCount > 0 && detail && !isLoadingDetail ? (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-amber-200/80 bg-amber-50/90 px-2 py-1.5">
                      <p className="text-[11px] font-medium text-amber-900 leading-snug min-w-0 flex-1">
                        {mappedLinesWithoutStockCount} línea
                        {mappedLinesWithoutStockCount === 1 ? '' : 's'} sin movimiento
                      </p>
                      <button
                        type="button"
                        onClick={() => void repairAllMappedLinesWithoutStock()}
                        disabled={repairingInvoiceStockBatch || repairingStockLineId !== null || lineActionBusy}
                        className={cn(
                          'shrink-0 px-2.5 py-1 rounded-lg bg-amber-700/90 text-white text-[10px] font-semibold uppercase tracking-wide active:scale-[0.99] transition inline-flex items-center justify-center gap-1.5 hover:bg-amber-800',
                          (repairingInvoiceStockBatch || repairingStockLineId !== null || lineActionBusy) &&
                            'opacity-60 pointer-events-none'
                        )}
                      >
                        {repairingInvoiceStockBatch ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : null}
                        Reparar
                      </button>
                    </div>
                  ) : null}

                  {/* 3. BLOQUE DE INFORMACIÓN DEL DOCUMENTO */}
                  {detail && !isLoadingDetail && (
                    <div className="flex flex-nowrap items-end gap-2 sm:gap-4 overflow-x-auto min-w-0">
                      <div className="min-w-0 shrink space-y-0.5">
                        <div className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Nº</div>
                        <div className="text-[11px] font-normal text-zinc-600 tabular-nums whitespace-nowrap truncate">
                          {detail.invoice_number ?? '—'}
                        </div>
                      </div>
                      <div className="shrink-0 space-y-0.5">
                        <div className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Fecha</div>
                        <div className="text-xs font-semibold text-zinc-900 tabular-nums whitespace-nowrap">
                          {(() => {
                            const raw = String(detail.invoice_date ?? '').trim()
                            const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw)
                            return m ? `${m[3]}/${m[2]}/${m[1]}` : formatDateTitle(detail.invoice_date)
                          })()}
                        </div>
                      </div>
                      <div className="shrink-0 space-y-0.5">
                        <div className="text-[9px] font-black uppercase tracking-wider text-zinc-400">Total</div>
                        <div className="text-xs font-semibold text-[#36606F] tabular-nums whitespace-nowrap">
                          {detail.total_amount != null
                            ? `${Number(detail.total_amount).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
                            : '—'}
                        </div>
                      </div>
                      <div className="shrink-0 ml-auto self-end">
                        {invoiceImageSheetOptions.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setInvoiceCarouselIndex(0)
                              invoiceCarouselIndexRef.current = 0
                              setInvoiceImageViewerOpen(true)
                            }}
                            className="inline-flex min-h-12 items-center text-[10px] font-normal uppercase tracking-wide text-zinc-500 hover:text-[#36606F] transition-colors whitespace-nowrap"
                          >
                            Ver original
                          </button>
                        ) : (
                          <div className="flex min-h-12 items-center text-xs font-medium text-zinc-400 whitespace-nowrap">Sin imagen</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 4. SECCIÓN ARTÍCULOS */}
                  {isLoadingDetail ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-2 text-sm font-bold text-zinc-600">
                      <Loader2 className="h-8 w-8 animate-spin text-[#36606F]" />
                      Cargando detalle…
                    </div>
                  ) : detailError ? (
                    <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm font-bold text-red-700">{detailError}</div>
                  ) : detail ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-baseline justify-between gap-2 pb-1 border-b border-zinc-900/5 px-1">
                        <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Artículos</div>
                        <div className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{detail.lines.length} artículos</div>
                      </div>

                      {detail.lines.length === 0 ? (
                        <div className="py-8 text-center text-sm font-bold text-zinc-500">
                          {String(detail.status ?? '').toLowerCase() === 'processing'
                            ? 'Esperando lectura OCR…'
                            : String(detail.status ?? '').toLowerCase() === 'ocr_failed'
                              ? 'Sin líneas: corrige la foto o reintenta la lectura.'
                              : 'No hay líneas guardadas.'}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-0 min-w-0">
                          {/* Cabecera de columnas: siempre visible, alineada con filas */}
                          <div className="flex items-center gap-1.5 sm:gap-3 px-1 py-1 border-b border-zinc-100">
                            <div className="flex-1 min-w-0 text-[9px] font-black uppercase tracking-wider text-zinc-400">Producto</div>
                            <div className="flex items-center justify-end shrink-0 gap-1.5 sm:gap-3">
                              <div className="w-[3.25rem] sm:w-[4.5rem] text-right text-[9px] font-black uppercase tracking-wider text-zinc-400">Cant.</div>
                              <div className="w-[3.75rem] sm:w-[5rem] text-right text-[9px] font-black uppercase tracking-wider text-zinc-400">Precio ud.</div>
                              <div className="w-[3.75rem] sm:w-[5rem] text-right text-[9px] font-black uppercase tracking-wider text-zinc-400">Importe</div>
                            </div>
                          </div>

                          {detail.lines.map((l) => {
                            const stock = stockStatusByLineId[l.id]
                            const stockApplied = Boolean(stock?.stockApplied)
                            const rectified = (stock?.rectifiedCount ?? 0) > 0
                            const excluded = isInvoiceLineExcluded(l)
                            const noMatch = !excluded && !l.ingredient_name
                            const needsRepair = lineNeedsStockRepair(l)
                            const displayName = l.ingredient_name
                              ? l.ingredient_name
                              : l.original_name || 'Sin nombre'

                            return (
                              <div
                                key={l.id}
                                onClick={() => {
                                  setLineForEditModal(null)
                                  setLineForMappingModal(null)
                                  evidenceContextLineIdRef.current = l.id
                                  setLineForEvidenceModal(l.id)
                                }}
                                className="group flex flex-row items-center gap-1.5 sm:gap-3 px-1 py-1.5 min-h-12 hover:bg-zinc-50 rounded-lg transition-colors cursor-pointer"
                              >
                                <div className="flex-1 min-w-0 flex items-center gap-1.5">
                                  <span className="text-xs font-medium text-zinc-900 truncate min-w-0" title={displayName}>{displayName}</span>

                                  {/* Estado */}
                                  <div className="shrink-0 flex items-center">
                                    {noMatch ? (
                                      <span className="inline-flex text-rose-600" aria-label="Sin match" title="Sin match"><X className="h-3.5 w-3.5" strokeWidth={3} /></span>
                                    ) : null}
                                    {excluded ? (
                                      <span className="inline-flex text-zinc-400" aria-label="Portes o ajuste" title="Portes / ajuste / sin cargo"><MinusCircle className="h-3.5 w-3.5" strokeWidth={2.5} /></span>
                                    ) : null}
                                    {needsRepair ? (
                                      <button
                                        type="button"
                                        aria-label="Sin stock aplicado — reparar"
                                        title="Sin stock aplicado — pulsa para aplicar"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          void repairStockForLine(l.id)
                                        }}
                                        disabled={repairingStockLineId !== null || lineActionBusy}
                                        className={cn(
                                          'inline-flex min-h-12 min-w-12 items-center justify-center rounded-xl text-amber-500 hover:bg-amber-50 active:scale-[0.99] transition',
                                          (repairingStockLineId !== null || lineActionBusy) && 'opacity-60 pointer-events-none'
                                        )}
                                      >
                                        {repairingStockLineId === l.id ? (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} />
                                        ) : (
                                          <AlertCircle className="h-3.5 w-3.5" strokeWidth={2.5} />
                                        )}
                                      </button>
                                    ) : null}
                                    {stockApplied ? (
                                      <span className="inline-flex text-emerald-600" aria-label="Stock aplicado" title="Stock aplicado"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>
                                    ) : null}
                                    {rectified ? (
                                      <span className="inline-flex text-amber-500" aria-label={`Stock rectificado (REV${stock?.rectifiedCount})`} title={`Stock rectificado (REV${stock?.rectifiedCount})`}><RotateCcw className="h-3.5 w-3.5" strokeWidth={2.5} /></span>
                                    ) : null}
                                  </div>
                                </div>

                                {/* Valores económicos: tipografía densa, peso normal, columnas fijas */}
                                <div className="flex items-center justify-end shrink-0 gap-1.5 sm:gap-3">
                                  <div className="w-[3.25rem] sm:w-[4.5rem] text-right">
                                    <span className="text-[10px] sm:text-[11px] font-normal text-zinc-800 tabular-nums">
                                      {l.quantity != null ? Number(l.quantity).toLocaleString('es-ES', { maximumFractionDigits: 3 }) : '—'}
                                      {l.line_unit ? ` ${l.line_unit}` : ''}
                                    </span>
                                  </div>
                                  <div className="w-[3.75rem] sm:w-[5rem] text-right">
                                    <span className="text-[10px] sm:text-[11px] font-normal text-zinc-800 tabular-nums">
                                      {l.unit_price != null ? `${Number(l.unit_price).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €` : '—'}
                                    </span>
                                  </div>
                                  <div className="w-[3.75rem] sm:w-[5rem] text-right">
                                    <span className="text-[10px] sm:text-[11px] font-normal text-zinc-800 tabular-nums">
                                      {l.total_price != null ? `${Number(l.total_price).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : '—'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>

                <LineEditModal
                  open={!!lineForEditModal}
                  line={lineForEditModal}
                  draft={lineForEditModal ? draftLines[lineForEditModal.id] ?? null : null}
                  saving={lineForEditModal ? savingLineId === lineForEditModal.id : false}
                  isDirty={lineForEditModal ? isLineDirty(lineForEditModal) : false}
                  onClose={() => {
                    reopenEvidenceFromContext()
                  }}
                  onDraftChange={(patch) => {
                    if (!lineForEditModal) return
                    setDraft(lineForEditModal.id, patch)
                  }}
                  onSaveLine={async () => {
                    if (!lineForEditModal) return
                    const ok = await saveLine(lineForEditModal.id)
                    if (ok) reopenEvidenceFromContext()
                  }}
                />

                <LineMappingModal
                  open={!!lineForMappingModal}
                  line={lineForMappingModal}
                  invoiceId={detail?.id ?? null}
                  supplierId={detail?.supplier_id ?? null}
                  stockApplied={
                    lineForMappingModal
                      ? Boolean(stockStatusByLineId[lineForMappingModal.id]?.stockApplied)
                      : false
                  }
                  needsRepair={lineForMappingModal ? lineNeedsStockRepair(lineForMappingModal) : false}
                  busy={lineActionBusy || repairingStockLineId !== null}
                  onClose={() => {
                    reopenEvidenceFromContext()
                  }}
                  onSuccess={() => refreshDetailAndStock()}
                  onOpenWizardNew={() => {
                    if (!lineForMappingModal) return
                    openWizardForLine(lineForMappingModal, { ingredientId: null, initialName: lineForMappingModal.original_name || '' })
                  }}
                  onOpenWizardPrice={() => {
                    if (!lineForMappingModal) return
                    openWizardForLine(lineForMappingModal, {
                      ingredientId: lineForMappingModal.ingredient_id ? String(lineForMappingModal.ingredient_id) : null,
                      initialName: null,
                    })
                  }}
                  onRepairStock={() => {
                    if (lineForMappingModal) void repairStockForLine(lineForMappingModal.id)
                  }}
                  onRectifyStock={() => {
                    if (lineForMappingModal) void rectifyLine(lineForMappingModal.id)
                  }}
                  onEditMapping={() => {
                    if (lineForMappingModal) void editMapping(lineForMappingModal.id)
                  }}
                  onRemoveMapping={() => {
                    if (lineForMappingModal) void removeMapping(lineForMappingModal.id)
                  }}
                />

                <DocumentEvidenceModal
                  open={!!lineForEvidenceModal}
                  lineId={lineForEvidenceModal}
                  supplierName={detail?.supplier_name}
                  invoiceNumber={detail?.invoice_number}
                  refreshVersion={evidenceVersion}
                  isManager={isManager}
                  onClose={() => {
                    evidenceContextLineIdRef.current = null
                    setLineForEvidenceModal(null)
                  }}
                  onOpenProduct={() => {
                    const l = detail?.lines.find((line) => line.id === lineForEvidenceModal)
                    if (!l) return
                    evidenceContextLineIdRef.current = l.id
                    setLineForEvidenceModal(null)
                    setLineForEditModal(null)
                    openLineMappingModal(l)
                  }}
                  onOpenEditor={() => {
                    const l = detail?.lines.find((line) => line.id === lineForEvidenceModal)
                    if (!l) return
                    evidenceContextLineIdRef.current = l.id
                    setLineForEvidenceModal(null)
                    setLineForMappingModal(null)
                    setLineForEditModal(l)
                  }}
                  onExcludeFromMapping={() => {
                    if (lineForEvidenceModal) void excludeLineFromMapping(lineForEvidenceModal)
                  }}
                  onMarkExpenseOnly={() => {
                    if (lineForEvidenceModal) void markLineExpenseOnly(lineForEvidenceModal)
                  }}
                  onRestoreStatus={() => {
                    if (!lineForEvidenceModal) return
                    const l = detail?.lines.find((line) => line.id === lineForEvidenceModal)
                    if (l) {
                      if (l.status === 'expense_only') void restoreExpenseOnlyLine(l.id)
                      else void restoreExcludedLine(l.id)
                    }
                  }}
                />

                <Modal
                  open={supplierPickerOpen}
                  onClose={() => { if (!supplierSaving) setSupplierPickerOpen(false) }}
                  hideHeader={true}
                  wrapperClassName="max-w-lg"
                  className="max-h-[80vh]"
                  panelHostClassName="p-0"
                  zIndexClass="z-[10100]"
                  title="Seleccionar proveedor"
                >
                  <div className="flex flex-col h-full w-full">
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
                </Modal>

                <Modal
                  open={wizardOpen}
                  onClose={() => {
                    const lineId = wizardTargetLineId
                    void returnToMappingAfterWizard(lineId)
                  }}
                  hideHeader={true}
                  wrapperClassName="max-w-lg"
                  className="max-h-[86vh] p-2"
                  panelHostClassName="p-0"
                  zIndexClass="z-[10100]"
                  title="Wizard de ingrediente"
                >
                  <div className="h-full w-full">
                      <IngredientWizard
                        key={wizardIngredientId ?? 'create'}
                        ingredientId={wizardIngredientId}
                        initialName={wizardInitialName ?? undefined}
                        mode={wizardIngredientId ? 'editPricing' : 'create'}
                        flow="express"
                        invoiceContext={wizardInvoiceContext ?? undefined}
                        onSaved={async () => {
                          const lineId = wizardTargetLineId
                          await returnToMappingAfterWizard(lineId)
                        }}
                        onClose={() => {
                          const lineId = wizardTargetLineId
                          void returnToMappingAfterWizard(lineId)
                        }}
                      />
                  </div>
                </Modal>
              </div>
            </div>,
            modalContainer
          )
        : null}

      {invoiceImageViewerOpen && modalContainer && invoiceImageSheetOptions.length >= 1
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
              <div className="shrink-0 bg-[#36606F] pt-[max(6px,env(safe-area-inset-top))] pb-3 text-white md:pb-3.5">
                <p className="min-w-0 truncate px-4 text-center text-[11px] font-black uppercase tracking-wide text-white md:px-6 md:text-xs">
                  {invoiceImageSheetOptions[invoiceCarouselIndex]?.label ?? 'Hoja'}
                </p>
              </div>

              <div
                className="flex min-h-0 flex-1 flex-col gap-1 p-2 md:p-4"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="relative min-h-0 shrink-0 overflow-visible">
                  {invoiceImageSheetOptions.length > 1 ? (
                    <>
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
                    </>
                  ) : null}

                  <div
                    ref={invoiceCarouselRef}
                    onScroll={invoiceImageSheetOptions.length > 1 ? onInvoiceCarouselScroll : undefined}
                    className={cn(
                      'flex w-full bg-transparent',
                      'min-h-[10rem] h-[min(72dvh,calc(100svh-10rem))] md:h-[min(70vh,calc(100vh-12rem))]',
                      invoiceImageSheetOptions.length > 1
                        ? 'touch-pan-x snap-x snap-mandatory overflow-x-auto overflow-y-visible [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
                        : 'flex-col overflow-hidden'
                    )}
                  >
                    {invoiceImageSheetOptions.map((opt) => (
                      <div
                        key={opt.key}
                        className={cn(
                          'box-border flex h-full min-h-0 shrink-0 flex-col items-stretch justify-stretch px-1 pb-1 pt-2 md:px-2',
                          invoiceImageSheetOptions.length > 1
                            ? 'min-w-full snap-center snap-always'
                            : 'w-full min-w-0'
                        )}
                      >
                        <PinchZoomViewport resetKey={`${opt.key}-${invoiceCarouselIndex}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={opt.url}
                            alt={opt.label}
                            className="block h-auto max-h-[min(58dvh,calc(100svh-18rem))] w-auto max-w-[min(100vw,100%)] rounded-xl object-contain shadow-lg ring-1 ring-white/10 md:max-h-[min(60vh,calc(100vh-18rem))]"
                          />
                        </PinchZoomViewport>
                      </div>
                    ))}
                  </div>
                </div>

                {invoiceImageSheetOptions.length > 1 ? (
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
                ) : null}

                <p className="shrink-0 pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                  {invoiceImageSheetOptions.length > 1
                    ? 'Desliza para cambiar de hoja · Pellizca con dos dedos para zoom'
                    : 'Pellizca con dos dedos para zoom'}
                </p>
              </div>

              <div className="shrink-0 border-t border-white/10 bg-zinc-950 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 md:px-5">
                <div className="mx-auto flex max-w-lg justify-center">
                  <button
                    type="button"
                    onClick={() => setInvoiceImageViewerOpen(false)}
                    className="inline-flex min-h-12 w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-black uppercase tracking-wide text-[#36606F] shadow-md transition hover:bg-zinc-100 active:scale-[0.99] sm:w-auto"
                    aria-label="Cerrar visor de imagen"
                  >
                    <X className="h-5 w-5 shrink-0" strokeWidth={2.5} />
                    Cerrar
                  </button>
                </div>
              </div>
            </div>,
            modalContainer
          )
        : null}

      {filterOpen ? (
        <div
          className="fixed inset-0 z-[10010] bg-black/60 backdrop-blur-sm p-4 flex items-center justify-center animate-in fade-in duration-150"
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
                  onClick={() => {
                    const supplierName = filterSuppliers.find(
                      (s) => String(s.id) === filterSupplierId
                    )?.name
                    trackAlbaranesFilter(
                      albaranesFilterSummary({
                        from: filterFrom,
                        to: filterTo,
                        supplierId: filterSupplierId,
                        supplierName,
                      })
                    )
                    setFilterOpen(false)
                  }}
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

