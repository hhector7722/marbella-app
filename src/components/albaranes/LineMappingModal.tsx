'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { SearchField } from '@/components/ui/SearchField'
import {
  ALBARAN_LINE_CONTENT_UNITS,
  billingMassVolumeNormForAuto,
  buildAutomaticSameFamilyDimensional,
  ingredientPurchaseUnitNormForMapping,
  isSimpleAlbaranUnitMapping,
  sameFamilyAutomaticConversionCaption,
  sameMassVolumeFamilyBillingAndIngredient,
  SIMPLE_ALBARAN_UNIT_DIMENSIONAL,
  suggestedDimensionalMappingFromIngredient,
  type IngredientDimensionalSource,
} from '@/lib/ingredient-pack-pricing'
import type { PurchaseInvoiceLine } from '@/app/dashboard/albaranes/actions'
import {
  resolveLineMappingAction,
  searchIngredientsForMappingAction,
} from '@/app/dashboard/albaranes/actions'
import {
  applyReceiptLineAction,
  listReceiptOrderAllocationOptionsAction,
  previewReceiptLineAction,
  saveReceiptMappingProposalAction,
  type ReceiptAllocationInput,
  type ReceiptPreview,
} from '@/app/dashboard/albaranes/receipt-actions'
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking'
import { useTrackModalApply } from '@/hooks/useTrackModalApply'
import { namedEntitySummary } from '@/lib/usage/modal-apply'
type LineDimensionalDraft = {
  lineBillingUnit: string
  lineContentQty: string
  lineContentUnit: string
}

const EMPTY_DIMENSIONAL: LineDimensionalDraft = {
  lineBillingUnit: '',
  lineContentQty: '',
  lineContentUnit: '',
}

type IngredientMappingSearchItem = IngredientDimensionalSource & {
  id: string
  name: string
  purchase_unit: string
  current_price: number
}

type ReceiptOrderOption = {
  purchaseOrderItemId: string
  purchaseOrderId: string
  label: string
  orderUnit: string
  quantityPending: number
}

type ReceiptAllocationDraft = Record<string, { orderQuantity: string; lineQuantity: string }>

function parseDimensionalPayload(dim: LineDimensionalDraft): {
  lineBillingUnit: string | null
  lineContentQty: number | null
  lineContentUnit: string | null
} {
  const lineBillingUnit = dim.lineBillingUnit.trim() || null
  const qtyRaw = dim.lineContentQty.trim().replace(',', '.')
  const lineContentQty = qtyRaw === '' ? null : Number(qtyRaw)
  const lineContentUnit = dim.lineContentUnit.trim() || null
  return { lineBillingUnit, lineContentQty, lineContentUnit }
}

function formatLineTotal(v: number | null | undefined) {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : null
  if (n == null || n === 0) return '—'
  return `${n.toFixed(2)}€`
}

export type LineMappingModalProps = {
  open: boolean
  line: PurchaseInvoiceLine | null
  invoiceId: string | null
  supplierId: number | null
  stockApplied?: boolean
  busy?: boolean
  onClose: () => void
  onSuccess: () => void | Promise<void>
  onOpenWizardNew?: () => void
  onOpenWizardPrice?: () => void
}

/** Una sola superficie derivada a la vez (ADR-0007). */

export function LineMappingModal({
  open,
  line,
  invoiceId,
  supplierId,
  stockApplied = false,
  busy = false,
  onClose,
  onSuccess,
  onOpenWizardNew,
  onOpenWizardPrice,
}: LineMappingModalProps) {
  useModalUsageTracking({ open, usageId: 'albaran-line-mapping', usageLabel: 'Mapear línea albarán' })
  const trackLineMapping = useTrackModalApply('albaran-line-mapping', 'Mapear línea albarán')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [ingredientId, setIngredientId] = useState<string | null>(null)
  const [ingredientLabel, setIngredientLabel] = useState<string | null>(null)
  const [ingredientPurchaseUnit, setIngredientPurchaseUnit] = useState<string>('kg')
  const [selectedIngredientMeta, setSelectedIngredientMeta] =
    useState<IngredientDimensionalSource | null>(null)
  const [showAdvancedCalibration, setShowAdvancedCalibration] = useState(false)
  const [factor, setFactor] = useState('1')
  const [dimensional, setDimensional] = useState<LineDimensionalDraft>(EMPTY_DIMENSIONAL)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<IngredientMappingSearchItem[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [mappingVersionId, setMappingVersionId] = useState<string | null>(null)
  const [savedProposalFingerprint, setSavedProposalFingerprint] = useState<string | null>(null)
  const [orderOptions, setOrderOptions] = useState<ReceiptOrderOption[]>([])
  const [allocationDraft, setAllocationDraft] = useState<ReceiptAllocationDraft>({})
  const [receiptPreview, setReceiptPreview] = useState<ReceiptPreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmationKey, setConfirmationKey] = useState<string | null>(null)

  const applySuggestion = useCallback(
    (
      ing: IngredientDimensionalSource & { purchase_unit?: string },
      opts?: {
        lineUnitFromInvoice?: string | null
        storedBillingUnit?: string | null
        storedContentQty?: number | null
        storedContentUnit?: string | null
        conversionFactorFallback?: number | null
        forceAdvanced?: boolean
      }
    ) => {
      setSelectedIngredientMeta(ing)
      const suggestion = suggestedDimensionalMappingFromIngredient(ing, {
        lineUnitFromInvoice: opts?.lineUnitFromInvoice,
        storedBillingUnit: opts?.storedBillingUnit,
        storedContentQty: opts?.storedContentQty,
        storedContentUnit: opts?.storedContentUnit,
      })
      let nextDim: LineDimensionalDraft = {
        lineBillingUnit: suggestion.lineBillingUnit,
        lineContentQty: suggestion.lineContentQty,
        lineContentUnit: suggestion.lineContentUnit,
      }
      const f =
        suggestion.conversionFactor ??
        (opts?.conversionFactorFallback != null && opts.conversionFactorFallback > 0
          ? opts.conversionFactorFallback
          : null)
      let nextFactor =
        f != null && Number.isFinite(f) && f > 0 ? String(f) : '1'

      const billingNorm = billingMassVolumeNormForAuto(
        nextDim.lineBillingUnit,
        opts?.lineUnitFromInvoice
      )
      const autoFamily =
        !opts?.forceAdvanced &&
        billingNorm != null &&
        sameMassVolumeFamilyBillingAndIngredient(billingNorm, ing)
      const autoDim = autoFamily ? buildAutomaticSameFamilyDimensional(billingNorm, ing) : null

      const simple =
        !autoFamily && isSimpleAlbaranUnitMapping(ing, nextDim, nextFactor)

      if (autoDim && !opts?.forceAdvanced) {
        nextDim = {
          lineBillingUnit: autoDim.lineBillingUnit,
          lineContentQty: autoDim.lineContentQty,
          lineContentUnit: autoDim.lineContentUnit,
        }
        nextFactor = String(autoDim.conversionFactor)
        setShowAdvancedCalibration(false)
      } else if (simple && !opts?.forceAdvanced) {
        nextDim = { ...SIMPLE_ALBARAN_UNIT_DIMENSIONAL }
        nextFactor = '1'
        setShowAdvancedCalibration(false)
      } else {
        setShowAdvancedCalibration(true)
      }

      setDimensional(nextDim)
      setFactor(nextFactor)
      if (ing.purchase_unit) setIngredientPurchaseUnit(String(ing.purchase_unit))
    },
    []
  )

  const loadResolve = useCallback(async () => {
    if (!open || !line || !invoiceId) return
    setLoading(true)
    setSearchQuery('')
    setSearchResults([])
    try {
      const res = await resolveLineMappingAction({ invoiceId, lineId: line.id })
      if (!res.success) {
        toast.error(res.message)
        return
      }
      const {
        suggestedIngredientId,
        suggestedFactor,
        candidates,
        lineBillingUnit,
        lineContentQty,
        lineContentUnit,
      } = res.result

      const mappedId = line.ingredient_id ? String(line.ingredient_id) : null
      const pickId = suggestedIngredientId ?? mappedId
      const cand = pickId ? candidates.find((c) => String(c.id) === String(pickId)) : undefined

      setIngredientId(pickId)
      setIngredientLabel(
        line.ingredient_name?.trim() ||
          cand?.name ||
          (pickId ? 'Producto seleccionado' : null)
      )
      if (cand?.purchase_unit) setIngredientPurchaseUnit(cand.purchase_unit)
      setSelectedIngredientMeta(cand ?? null)
      setShowAdvancedCalibration(false)

      let nextFactor = '1'
      if (suggestedFactor != null && Number.isFinite(suggestedFactor) && suggestedFactor > 0) {
        nextFactor = String(suggestedFactor)
      } else if (
        line.conversion_factor != null &&
        Number.isFinite(Number(line.conversion_factor)) &&
        Number(line.conversion_factor) > 0
      ) {
        nextFactor = String(line.conversion_factor)
      }
      setFactor(nextFactor)

      const hasStoredDimensional =
        line.line_billing_unit ||
        line.line_content_qty != null ||
        line.line_content_unit ||
        lineBillingUnit ||
        lineContentQty != null ||
        lineContentUnit

      if (hasStoredDimensional) {
        const storedDim: LineDimensionalDraft = {
          lineBillingUnit:
            String(line.line_billing_unit ?? lineBillingUnit ?? line.line_unit ?? '').trim() || '',
          lineContentQty:
            line.line_content_qty != null
              ? String(line.line_content_qty)
              : lineContentQty != null
                ? String(lineContentQty)
                : '',
          lineContentUnit: String(line.line_content_unit ?? lineContentUnit ?? '').trim() || '',
        }
        setDimensional(storedDim)
        if (cand) {
          const billingNorm = billingMassVolumeNormForAuto(
            storedDim.lineBillingUnit,
            line.line_unit
          )
          const autoStored =
            billingNorm != null &&
            sameMassVolumeFamilyBillingAndIngredient(billingNorm, cand)
          const simpleStored =
            !autoStored && isSimpleAlbaranUnitMapping(cand, storedDim, nextFactor)
          setShowAdvancedCalibration(!(autoStored || simpleStored))
        } else {
          setShowAdvancedCalibration(true)
        }
      } else if (pickId && cand) {
        applySuggestion(cand, {
          lineUnitFromInvoice: line.line_unit,
          conversionFactorFallback: suggestedFactor ?? line.conversion_factor,
        })
      } else {
        setDimensional({
          lineBillingUnit: String(line.line_unit ?? '').trim(),
          lineContentQty: '',
          lineContentUnit: '',
        })
        setSelectedIngredientMeta(null)
      }
    } finally {
      setLoading(false)
    }
  }, [open, line, invoiceId, applySuggestion])

  useEffect(() => {
    if (open && line && invoiceId) void loadResolve()
    // Recargar también cuando cambia el vínculo (p.ej. tras «Editar match»), no solo el id.
  }, [
    open,
    line?.id,
    line?.ingredient_id,
    line?.status,
    line?.conversion_factor,
    line?.line_billing_unit,
    line?.line_content_qty,
    line?.line_content_unit,
    invoiceId,
    loadResolve,
  ])

  async function runSearch(q: string) {
    const query = q.trim()
    setSearchQuery(q)
    if (query.length < 2) {
      setSearchResults([])
      return
    }
    setSearchLoading(true)
    try {
      const res = await searchIngredientsForMappingAction({ query, limit: 40 })
      if (!res.success) {
        toast.error(res.message)
        return
      }
      setSearchResults(res.items as IngredientMappingSearchItem[])
    } finally {
      setSearchLoading(false)
    }
  }

  const dimensionalParsed = useMemo(() => parseDimensionalPayload(dimensional), [dimensional])

  const billingMassVolumeNorm = useMemo(
    () => billingMassVolumeNormForAuto(dimensional.lineBillingUnit, line?.line_unit),
    [dimensional.lineBillingUnit, line?.line_unit]
  )

  const purchaseMassVolumeNorm = useMemo(
    () =>
      ingredientPurchaseUnitNormForMapping(
        selectedIngredientMeta ?? { purchase_unit: ingredientPurchaseUnit }
      ),
    [selectedIngredientMeta, ingredientPurchaseUnit]
  )

  const isAutoSameFamilyMode = useMemo(() => {
    if (!ingredientId || !selectedIngredientMeta || showAdvancedCalibration) return false
    if (billingMassVolumeNorm == null) return false
    return sameMassVolumeFamilyBillingAndIngredient(
      billingMassVolumeNorm,
      selectedIngredientMeta
    )
  }, [
    ingredientId,
    selectedIngredientMeta,
    showAdvancedCalibration,
    billingMassVolumeNorm,
  ])

  const autoSameFamilyCaption = useMemo(() => {
    if (!isAutoSameFamilyMode || billingMassVolumeNorm == null) return null
    return sameFamilyAutomaticConversionCaption(
      billingMassVolumeNorm,
      purchaseMassVolumeNorm
    )
  }, [isAutoSameFamilyMode, billingMassVolumeNorm, purchaseMassVolumeNorm])

  const isSimpleMode = useMemo(() => {
    if (!ingredientId || !selectedIngredientMeta || showAdvancedCalibration) return false
    if (isAutoSameFamilyMode) return false
    return isSimpleAlbaranUnitMapping(selectedIngredientMeta, dimensional, factor)
  }, [
    ingredientId,
    selectedIngredientMeta,
    showAdvancedCalibration,
    dimensional,
    factor,
    isAutoSameFamilyMode,
  ])

  const canSave = useMemo(() => {
    if (!ingredientId || !invoiceId || supplierId == null) return false
    if (isSimpleMode || isAutoSameFamilyMode) return true
    const f = Number(String(factor).replace(',', '.'))
    if (!Number.isFinite(f) || f <= 0) return false
    const { lineBillingUnit, lineContentQty, lineContentUnit } = dimensionalParsed
    if (!lineBillingUnit) return false
    if (lineContentQty == null || !Number.isFinite(lineContentQty) || lineContentQty <= 0) return false
    if (!lineContentUnit) return false
    return true
  }, [
    ingredientId,
    invoiceId,
    supplierId,
    factor,
    dimensionalParsed,
    isSimpleMode,
    isAutoSameFamilyMode,
  ])

  const proposalFingerprint = useMemo(
    () =>
      JSON.stringify({
        ingredientId,
        factor: String(factor).trim(),
        lineBillingUnit: dimensional.lineBillingUnit.trim().toLowerCase(),
        lineContentQty: dimensional.lineContentQty.trim().replace(',', '.'),
        lineContentUnit: dimensional.lineContentUnit.trim().toLowerCase(),
      }),
    [ingredientId, factor, dimensional]
  )

  async function handleSave() {
    if (!line || !invoiceId || !ingredientId) {
      toast.error('Selecciona un ingrediente del catálogo.')
      return
    }
    if (supplierId == null) {
      toast.error('Este albarán no tiene proveedor asignado.')
      return
    }

    let factorNum = Number(String(factor).replace(',', '.'))
    let { lineBillingUnit, lineContentQty, lineContentUnit } = dimensionalParsed

    if (isAutoSameFamilyMode && selectedIngredientMeta && billingMassVolumeNorm) {
      const auto = buildAutomaticSameFamilyDimensional(
        billingMassVolumeNorm,
        selectedIngredientMeta
      )
      if (auto) {
        lineBillingUnit = auto.lineBillingUnit
        lineContentQty = Number(auto.lineContentQty)
        lineContentUnit = auto.lineContentUnit
        factorNum = auto.conversionFactor
      }
    } else if (isSimpleMode && selectedIngredientMeta) {
      lineBillingUnit = SIMPLE_ALBARAN_UNIT_DIMENSIONAL.lineBillingUnit
      lineContentQty = 1
      lineContentUnit = SIMPLE_ALBARAN_UNIT_DIMENSIONAL.lineContentUnit
      factorNum = 1
    }

    if (!Number.isFinite(factorNum) || factorNum <= 0) {
      toast.error('Factor de conversión inválido.')
      return
    }

    if (!lineBillingUnit) {
      toast.error('Indica la unidad de facturación (ej. garrafa, caja).')
      return
    }
    if (lineContentQty == null || !Number.isFinite(lineContentQty) || lineContentQty <= 0) {
      toast.error('Indica la cantidad por unidad (ej. 5 litros → 5).')
      return
    }
    if (!lineContentUnit) {
      toast.error('Selecciona la unidad de contenido.')
      return
    }

    setSaving(true)
    try {
      const res = await saveReceiptMappingProposalAction({
        invoiceId,
        lineId: line.id,
        ingredientId,
        conversionFactor: factorNum,
        lineBillingUnit,
        lineContentQty,
        lineContentUnit,
      })

      if (!res.success) {
        toast.error(res.message)
        return
      }

      setMappingVersionId(res.mappingVersionId)
      setSavedProposalFingerprint(proposalFingerprint)
      setReceiptPreview(null)
      setConfirmationKey(null)
      const orderRes = await listReceiptOrderAllocationOptionsAction({ ingredientId })
      if (orderRes.success) setOrderOptions(orderRes.items)
      else toast.error(orderRes.message)

      toast.success('Propuesta guardada. Revisa el efecto antes de confirmar.')

      const lineLabel = line.original_name?.trim() || line.id
      const ingredientName = ingredientLabel?.trim() || ingredientId || '?'
      trackLineMapping(`${namedEntitySummary(lineLabel)} → ${namedEntitySummary(ingredientName)}`, {
        lineId: line.id,
        ingredientId: ingredientId ?? undefined,
      })

      await onSuccess()
    } finally {
      setSaving(false)
    }
  }

  function buildAllocations(): ReceiptAllocationInput[] | null {
    const allocations: ReceiptAllocationInput[] = []
    for (const option of orderOptions) {
      const draft = allocationDraft[option.purchaseOrderItemId]
      const orderRaw = draft?.orderQuantity.trim() ?? ''
      const lineRaw = draft?.lineQuantity.trim() ?? ''
      if (!orderRaw && !lineRaw) continue
      const orderQuantity = Number(orderRaw.replace(',', '.'))
      const lineQuantity = Number(lineRaw.replace(',', '.'))
      if (!Number.isFinite(orderQuantity) || orderQuantity <= 0 || !Number.isFinite(lineQuantity) || lineQuantity <= 0) {
        toast.error('Cada asignación debe indicar ambas cantidades positivas.')
        return null
      }
      allocations.push({
        purchase_order_item_id: option.purchaseOrderItemId,
        quantity_in_order_unit: orderQuantity,
        quantity_in_invoice_line_unit: lineQuantity,
      })
    }
    return allocations
  }

  async function handlePreview() {
    if (!line || !mappingVersionId) {
      toast.error('Guarda primero la propuesta de mapeo.')
      return
    }
    if (savedProposalFingerprint !== proposalFingerprint) {
      toast.error('La presentación cambió. Guarda de nuevo la propuesta antes de revisar el efecto.')
      return
    }
    const allocations = buildAllocations()
    if (!allocations) return
    setPreviewing(true)
    try {
      const res = await previewReceiptLineAction({ lineId: line.id, mappingVersionId, allocations })
      if (!res.success) {
        toast.error(res.message)
        return
      }
      setReceiptPreview(res.preview)
      setConfirmationKey(crypto.randomUUID())
      toast.success('Vista previa lista para confirmar.')
    } finally {
      setPreviewing(false)
    }
  }

  async function handleConfirm() {
    if (!line || !mappingVersionId || !receiptPreview || !confirmationKey) {
      toast.error('Prepara y revisa la vista previa antes de confirmar.')
      return
    }
    const allocations = buildAllocations()
    if (!allocations) return
    setConfirming(true)
    try {
      const res = await applyReceiptLineAction({
        lineId: line.id,
        mappingVersionId,
        allocations,
        idempotencyKey: confirmationKey,
      })
      if (!res.success) {
        toast.error(res.message)
        return
      }
      toast.success('Recepción confirmada.')
      await onSuccess()
      handleClose()
    } finally {
      setConfirming(false)
    }
  }

  function handleClose() {
    setMappingVersionId(null)
    setSavedProposalFingerprint(null)
    setOrderOptions([])
    setAllocationDraft({})
    setReceiptPreview(null)
    setConfirmationKey(null)
    onClose()
  }

  if (!open || !line) return null

  const headerTitle = `${line.original_name || 'Sin nombre'} — ${formatLineTotal(line.total_price)}`

  return (
    <Modal
      open={open}
      onClose={handleClose}
      variant="work"
      layer="derived"
      instance="albaran-line-mapping"
      parentInstance="albaran-detail"
      usageId="albaran-line-mapping"
      usageLabel="Mapear línea albarán"
      headerTone="petroleum"
      headerTitleAlign="left"
      title="Producto"
      subtitle={headerTitle}
      disableUsageTracking
      footer={
        <>
          <Button
            type="button"
            variant="tertiary"
            instance="albaran-line-mapping-cancel"
            onClick={handleClose}
            disabled={saving || previewing || confirming || busy}
          >
            Cancelar
          </Button>
          {!stockApplied && mappingVersionId ? (
            <Button
              type="button"
              variant={receiptPreview ? 'secondary' : 'primary'}
              instance="albaran-line-mapping-preview-receipt"
              onClick={() => void handlePreview()}
              disabled={saving || previewing || confirming || busy}
              loading={previewing}
              loadingLabel="Validando…"
            >
              {receiptPreview ? 'Actualizar vista previa' : 'Ver efecto'}
            </Button>
          ) : null}
          {!stockApplied && receiptPreview ? (
            <Button
              type="button"
              variant="primary"
              instance="albaran-line-mapping-confirm-receipt"
              onClick={() => void handleConfirm()}
              disabled={saving || previewing || confirming || busy}
              loading={confirming}
              loadingLabel="Confirmando…"
            >
              Confirmar recepción
            </Button>
          ) : !stockApplied ? (
            <Button
              type="button"
              variant="primary"
              instance="albaran-line-mapping-save"
              onClick={() => void handleSave()}
              disabled={!canSave || loading || saving || previewing || confirming || busy}
              loading={saving}
              loadingLabel="Guardando…"
            >
              Guardar propuesta
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-1.5 min-w-0 max-w-full bg-zinc-50">
        {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs font-medium text-zinc-600">
              <Loader2 className="h-5 w-5 animate-spin text-[#36606F]" />
              Preparando sugerencias…
            </div>
          ) : (
            <>
              <section className="rounded-lg border border-zinc-200 bg-white p-2 flex flex-col gap-1.5">
                <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400 px-1">
                  Producto en almacén
                </p>

                <div className="flex gap-1.5 px-1">
                  <div className="min-h-12 flex-1">
                    <SearchField
                      instance="albaran-line-mapping-search"
                      value={searchQuery}
                      onChange={(v) => void runSearch(v)}
                      placeholder="Buscar en catálogo…"
                    />
                  </div>
                  {onOpenWizardNew && !ingredientId && (
                    <Button
                      type="button"
                      variant="secondary"
                      instance="albaran-line-mapping-new-ingredient"
                      className="shrink-0"
                      onClick={() => {
                        onOpenWizardNew()
                      }}
                    >
                      Nuevo
                    </Button>
                  )}
                </div>

                {ingredientId ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 min-h-12 mx-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <Check className="h-4 w-4 shrink-0 text-emerald-700" strokeWidth={2.5} />
                      <span className="truncate text-xs font-medium text-emerald-950">
                        {ingredientLabel?.trim() || 'Seleccionado'}
                      </span>
                      <span className="shrink-0 text-[10px] font-normal text-emerald-800">
                        €/{ingredientPurchaseUnit}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {onOpenWizardPrice && (
                        <Button
                          type="button"
                          variant="tertiary"
                          instance="albaran-line-mapping-edit-price"
                          className="shrink-0"
                          onClick={() => {
                            onOpenWizardPrice()
                          }}
                        >
                          Precio
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="tertiary"
                        instance="albaran-line-mapping-change-ingredient"
                        className="shrink-0"
                        onClick={() => {
                          setIngredientId(null)
                          setIngredientLabel(null)
                          setSelectedIngredientMeta(null)
                          setShowAdvancedCalibration(false)
                        }}
                      >
                        Cambiar
                      </Button>
                    </div>
                  </div>
                ) : null}

                {searchLoading ? (
                  <div className="flex items-center gap-2 text-[10px] font-medium text-zinc-500 py-1 px-1">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Buscando…
                  </div>
                ) : searchResults.length > 0 ? (
                  <div className="max-h-40 overflow-y-auto space-y-1 px-1">
                    {searchResults.map((it) => (
                      <Button
                        key={it.id}
                        type="button"
                        variant={ingredientId === it.id ? 'secondary' : 'tertiary'}
                        className="w-full"
                        instance={`albaran-line-mapping-search-${it.id}`}
                        onClick={() => {
                          setIngredientId(it.id)
                          setIngredientLabel(it.name)
                          applySuggestion(it, { lineUnitFromInvoice: line.line_unit })
                        }}
                      >
                        <span className="flex w-full min-w-0 items-center justify-between gap-2 text-left">
                          <span className="truncate text-xs font-medium">{it.name}</span>
                          <span className="shrink-0 text-[10px] font-normal tabular-nums">
                            {Number(it.current_price || 0).toFixed(2)}€/{it.purchase_unit}
                          </span>
                        </span>
                      </Button>
                    ))}
                  </div>
                ) : searchQuery.trim().length >= 2 ? (
                  <p className="text-[10px] text-zinc-500 px-1">Sin resultados.</p>
                ) : (
                  <p className="text-[10px] text-zinc-500 px-1">Escribe al menos 2 caracteres para buscar.</p>
                )}
              </section>

              {ingredientId ? (
                <section className="rounded-lg border border-zinc-200 bg-white p-2 flex flex-col gap-2">
                  {isAutoSameFamilyMode ? (
                    <>
                      <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400 px-1">
                        Unidades
                      </p>
                      <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/90 px-2 py-1.5 mx-1">
                        <p className="text-[11px] font-medium text-emerald-950 leading-snug">
                          {autoSameFamilyCaption ??
                            `Conversión automática: 1 ${billingMassVolumeNorm} = 1 ${purchaseMassVolumeNorm}`}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="tertiary"
                        className="w-full"
                        instance="albaran-line-mapping-advanced-calibration"
                        onClick={() => setShowAdvancedCalibration(true)}
                      >
                        Caja, ud u otra conversión…
                      </Button>
                    </>
                  ) : isSimpleMode ? (
                    <>
                      <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400 px-1">
                        Unidades
                      </p>
                      <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/90 px-2 py-1.5 mx-1">
                        <p className="text-[11px] font-medium text-emerald-950 leading-snug">
                          1 unidad en el albarán = 1 unidad en almacén
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="tertiary"
                        className="w-full"
                        instance="albaran-line-mapping-advanced-calibration-simple"
                        onClick={() => setShowAdvancedCalibration(true)}
                      >
                        Caja, litros u otra conversión…
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400 px-1">
                        Conversión albarán → almacén
                      </p>
                      <p className="text-[10px] font-normal text-zinc-600 leading-snug px-1">
                        Indica qué trae cada unidad de factura (ej. una garrafa contiene 5 litros).
                      </p>

                  <div className="flex flex-wrap items-center gap-1.5 px-1">
                    <input
                      value={dimensional.lineBillingUnit}
                      onChange={(e) =>
                        setDimensional((d) => ({ ...d, lineBillingUnit: e.target.value }))
                      }
                      placeholder="Garrafa"
                      aria-label="Unidad de facturación"
                      className="min-h-12 min-w-[7rem] flex-1 rounded-lg border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-900 outline-none focus:border-[#36606F]/50"
                    />
                    <span className="text-[11px] font-normal text-zinc-500 shrink-0 px-0.5">contiene</span>
                    <input
                      inputMode="decimal"
                      value={dimensional.lineContentQty}
                      onChange={(e) =>
                        setDimensional((d) => ({ ...d, lineContentQty: e.target.value }))
                      }
                      placeholder="5"
                      aria-label="Cantidad por unidad"
                      className="min-h-12 w-20 shrink-0 rounded-lg border border-zinc-200 bg-white px-2 text-[11px] font-normal text-zinc-900 tabular-nums outline-none focus:border-[#36606F]/50"
                    />
                    <select
                      value={dimensional.lineContentUnit}
                      onChange={(e) =>
                        setDimensional((d) => ({ ...d, lineContentUnit: e.target.value }))
                      }
                      aria-label="Unidad de contenido"
                      className="min-h-12 min-w-[5.5rem] shrink-0 rounded-lg border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-900 outline-none focus:border-[#36606F]/50"
                    >
                      <option value="">—</option>
                      {ALBARAN_LINE_CONTENT_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>

                  <p className="text-[10px] font-normal text-zinc-500 leading-snug mx-1">
                    Precio guardado por{' '}
                    <span className="font-semibold text-[#36606F]">{ingredientPurchaseUnit || 'ud'}</span>.
                  </p>

                  <label className="block pt-0.5 px-1">
                    <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400">
                      Factor de conversión (avanzado)
                    </span>
                    <input
                      inputMode="decimal"
                      value={factor}
                      onChange={(e) => setFactor(e.target.value)}
                      className="mt-0.5 w-full min-h-12 rounded-lg border border-zinc-200 bg-zinc-50 px-2 text-[11px] font-normal text-zinc-700 tabular-nums outline-none focus:border-[#36606F]/40"
                    />
                  </label>

                      {selectedIngredientMeta &&
                      billingMassVolumeNorm != null &&
                      sameMassVolumeFamilyBillingAndIngredient(
                        billingMassVolumeNorm,
                        selectedIngredientMeta
                      ) ? (
                        <Button
                          type="button"
                          variant="secondary"
                          className="w-full"
                          instance="albaran-line-mapping-auto-conversion"
                          onClick={() => {
                            const auto = buildAutomaticSameFamilyDimensional(
                              billingMassVolumeNorm,
                              selectedIngredientMeta
                            )
                            if (auto) {
                              setDimensional({
                                lineBillingUnit: auto.lineBillingUnit,
                                lineContentQty: auto.lineContentQty,
                                lineContentUnit: auto.lineContentUnit,
                              })
                              setFactor(String(auto.conversionFactor))
                            }
                            setShowAdvancedCalibration(false)
                          }}
                        >
                          Volver a conversión automática
                        </Button>
                      ) : selectedIngredientMeta &&
                        isSimpleAlbaranUnitMapping(selectedIngredientMeta, dimensional, factor) ? (
                        <Button
                          type="button"
                          variant="secondary"
                          className="w-full"
                          instance="albaran-line-mapping-simple-unit"
                          onClick={() => {
                            setDimensional({ ...SIMPLE_ALBARAN_UNIT_DIMENSIONAL })
                            setFactor('1')
                            setShowAdvancedCalibration(false)
                          }}
                        >
                          Volver a modo unidad simple
                        </Button>
                      ) : null}
                    </>
                  )}
                </section>
              ) : null}

              {supplierId == null ? (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[10px] font-semibold text-rose-800">
                  Asigna un proveedor al albarán antes de vincular líneas.
                </p>
              ) : null}

              {stockApplied ? (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[10px] font-semibold text-emerald-900">
                  Esta línea ya tiene una recepción registrada. K4 no permite reescribirla desde esta pantalla.
                </p>
              ) : null}

              {mappingVersionId ? (
                <section className="rounded-lg border border-zinc-200 bg-white p-2 flex flex-col gap-2">
                  <div className="px-1">
                    <p className="text-[9px] font-black uppercase tracking-wider text-zinc-400">
                      Conciliación con pedidos (opcional)
                    </p>
                    <p className="mt-0.5 text-[10px] leading-snug text-zinc-600">
                      Deja todo vacío si este albarán no procede de un pedido. Una línea puede repartirse entre varios pedidos.
                    </p>
                  </div>
                  {orderOptions.length === 0 ? (
                    <p className="px-1 text-[10px] text-zinc-500">No hay líneas de pedido pendientes para este ingrediente.</p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {orderOptions.map((option) => {
                        const draft = allocationDraft[option.purchaseOrderItemId] ?? { orderQuantity: '', lineQuantity: '' }
                        return (
                          <div key={option.purchaseOrderItemId} className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
                            <p className="text-[10px] font-semibold text-zinc-800">
                              Pedido {option.purchaseOrderId.slice(0, 8)} · pendiente {option.quantityPending} {option.orderUnit}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              <label className="min-w-[8rem] flex-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
                                Del pedido ({option.orderUnit})
                                <input
                                  inputMode="decimal"
                                  value={draft.orderQuantity}
                                  onChange={(event) => {
                                    setAllocationDraft((current) => ({
                                      ...current,
                                      [option.purchaseOrderItemId]: { ...draft, orderQuantity: event.target.value },
                                    }))
                                    setReceiptPreview(null)
                                  }}
                                  className="mt-0.5 min-h-12 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs font-medium tabular-nums text-zinc-900 outline-none focus:border-[#36606F]/50"
                                />
                              </label>
                              <label className="min-w-[8rem] flex-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
                                Recibido ({line.line_unit || 'unidad línea'})
                                <input
                                  inputMode="decimal"
                                  value={draft.lineQuantity}
                                  onChange={(event) => {
                                    setAllocationDraft((current) => ({
                                      ...current,
                                      [option.purchaseOrderItemId]: { ...draft, lineQuantity: event.target.value },
                                    }))
                                    setReceiptPreview(null)
                                  }}
                                  className="mt-0.5 min-h-12 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs font-medium tabular-nums text-zinc-900 outline-none focus:border-[#36606F]/50"
                                />
                              </label>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>
              ) : null}

              {receiptPreview ? (
                <section className="rounded-lg border border-[#36606F]/30 bg-[#eef5f7] p-2">
                  <p className="px-1 text-[9px] font-black uppercase tracking-wider text-[#36606F]">Efecto a confirmar</p>
                  <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 px-1 text-[10px] text-zinc-700">
                    <div><dt className="text-zinc-500">Entrada</dt><dd className="font-semibold">{receiptPreview.physical_quantity} {receiptPreview.base_unit}</dd></div>
                    <div><dt className="text-zinc-500">Compra</dt><dd className="font-semibold">{receiptPreview.purchase_quantity} {receiptPreview.purchase_unit}</dd></div>
                    <div><dt className="text-zinc-500">Precio albarán</dt><dd className="font-semibold">{receiptPreview.observed_unit_price} €/{receiptPreview.line_billing_unit}</dd></div>
                    <div><dt className="text-zinc-500">Precio normalizado</dt><dd className="font-semibold">{receiptPreview.normalized_unit_price} €/{receiptPreview.purchase_unit}</dd></div>
                    <div><dt className="text-zinc-500">Precio actual → nuevo</dt><dd className="font-semibold">{receiptPreview.price_before} € → {receiptPreview.price_after} €</dd></div>
                    <div><dt className="text-zinc-500">Pedidos vinculados</dt><dd className="font-semibold">{receiptPreview.allocation_count}</dd></div>
                  </dl>
                  <p className="mt-1 rounded-md bg-white/80 px-2 py-1 text-[10px] font-medium text-zinc-700">
                    {receiptPreview.price_locked
                      ? 'Precio bloqueado: se registrará la recepción, sin cambiar el precio.'
                      : receiptPreview.price_changed
                        ? 'Se creará un único PURCHASE y se actualizará el precio con esta procedencia.'
                        : 'Se creará un único PURCHASE; el precio ya coincide.'}
                    {receiptPreview.mapping_will_be_confirmed ? ' La propuesta de mapeo quedará versionada y confirmada.' : ''}
                  </p>
                </section>
              ) : null}
            </>
          )}
      </div>
    </Modal>
  )
}
