'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Loader2, Search, X } from 'lucide-react'
import { toast } from 'sonner'
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
import { cn } from '@/lib/utils'
import type { PurchaseInvoiceLine } from '@/app/dashboard/albaranes/actions'
import {
  confirmInvoiceLineMappingAction,
  resolveLineMappingAction,
  searchIngredientsForMappingAction,
  updateMappedLineConversionFactorAction,
} from '@/app/dashboard/albaranes/actions'
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
  portalTarget?: HTMLElement | null
  onClose: () => void
  onSuccess: () => void | Promise<void>
}

export function LineMappingModal({
  open,
  line,
  invoiceId,
  supplierId,
  portalTarget,
  onClose,
  onSuccess,
}: LineMappingModalProps) {
  const [mounted, setMounted] = useState(false)
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

  useEffect(() => {
    setMounted(true)
  }, [])

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
  }, [open, line?.id, invoiceId, loadResolve])

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

  const alreadyMappedSameIngredient = useMemo(() => {
    if (!line || !ingredientId) return false
    return (
      String(line.status ?? '') === 'mapped' &&
      Boolean(line.ingredient_id) &&
      String(line.ingredient_id) === String(ingredientId)
    )
  }, [line, ingredientId])

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
      const payload = { lineBillingUnit, lineContentQty, lineContentUnit }
      const res = alreadyMappedSameIngredient
        ? await updateMappedLineConversionFactorAction({
            invoiceId,
            lineId: line.id,
            conversionFactor: factorNum,
            ...payload,
          })
        : await confirmInvoiceLineMappingAction({
            lineId: line.id,
            invoiceId,
            ingredientId,
            conversionFactor: factorNum,
            ...payload,
          })

      if (!res.success) {
        toast.error(res.message)
        return
      }

      if (alreadyMappedSameIngredient) {
        if ('stockRectified' in res && res.stockRectified) {
          toast.success('Calibración guardada y stock rectificado.')
        } else {
          toast.success('Calibración guardada.')
        }
        if ('warning' in res) {
          const w = res.warning
          if (typeof w === 'string' && w.trim()) toast.info(w)
        }
      } else {
        toast.success('Línea vinculada al catálogo.')
      }

      await onSuccess()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  if (!open || !line || !mounted) return null

  const target = portalTarget ?? (typeof document !== 'undefined' ? document.body : null)
  if (!target) return null

  const headerTitle = `${line.original_name || 'Sin nombre'} — ${formatLineTotal(line.total_price)}`

  return createPortal(
    <div
      className="fixed inset-0 z-[10070] flex flex-col justify-end sm:justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="line-mapping-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose()
      }}
    >
      <div
        className="flex flex-col w-full sm:max-w-lg sm:mx-auto max-h-[92vh] sm:max-h-[88vh] bg-zinc-50 sm:rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#36606F] px-4 py-3 flex items-start justify-between gap-3 text-white shrink-0">
          <div className="min-w-0 flex-1">
            <p id="line-mapping-title" className="text-xs font-black uppercase tracking-wider text-white/80">
              Vincular producto
            </p>
            <p className="text-sm font-black truncate mt-0.5">{headerTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="min-h-12 min-w-12 shrink-0 inline-flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 active:scale-[0.99] transition"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm font-semibold text-zinc-600">
              <Loader2 className="h-5 w-5 animate-spin text-[#36606F]" />
              Preparando sugerencias…
            </div>
          ) : (
            <>
              <section className="rounded-xl border border-zinc-100 bg-white shadow-sm p-4 flex flex-col gap-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-[#36606F]">
                  Producto en almacén
                </p>
                <p className="text-xs font-semibold text-zinc-600 leading-snug">
                  Busca el artículo del catálogo que coincide con esta línea del albarán.
                </p>

                <div className="relative min-h-12">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                  <input
                    value={searchQuery}
                    onChange={(e) => void runSearch(e.target.value)}
                    placeholder="Buscar ingrediente en catálogo…"
                    className="w-full min-h-12 rounded-xl border border-zinc-200 bg-white pl-11 pr-3 text-sm font-semibold text-zinc-900 outline-none focus:border-[#36606F]/50"
                  />
                </div>

                {ingredientId ? (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 min-h-12">
                    <div className="flex min-w-0 items-center gap-2">
                      <Check className="h-5 w-5 shrink-0 text-emerald-700" strokeWidth={2.5} />
                      <span className="truncate text-sm font-black text-emerald-950">
                        {ingredientLabel?.trim() || 'Seleccionado'}
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-emerald-800">
                        €/{ingredientPurchaseUnit}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 min-h-12 px-2 text-[10px] font-bold uppercase text-emerald-900 underline"
                      onClick={() => {
                        setIngredientId(null)
                        setIngredientLabel(null)
                        setSelectedIngredientMeta(null)
                        setShowAdvancedCalibration(false)
                      }}
                    >
                      Cambiar
                    </button>
                  </div>
                ) : null}

                {searchLoading ? (
                  <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500 py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Buscando…
                  </div>
                ) : searchResults.length > 0 ? (
                  <div className="max-h-40 overflow-y-auto space-y-1.5">
                    {searchResults.map((it) => (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => {
                          setIngredientId(it.id)
                          setIngredientLabel(it.name)
                          applySuggestion(it, { lineUnitFromInvoice: line.line_unit })
                        }}
                        className={cn(
                          'flex w-full min-h-12 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition active:scale-[0.99]',
                          ingredientId === it.id
                            ? 'border-[#36606F] bg-[#36606F]/8 ring-1 ring-[#36606F]/20'
                            : 'border-zinc-100 bg-zinc-50 hover:bg-white'
                        )}
                      >
                        <span className="truncate text-sm font-bold text-zinc-900">{it.name}</span>
                        <span className="shrink-0 text-xs font-semibold text-zinc-500">
                          {Number(it.current_price || 0).toFixed(2)}€/{it.purchase_unit}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : searchQuery.trim().length >= 2 ? (
                  <p className="text-xs text-zinc-500">Sin resultados.</p>
                ) : (
                  <p className="text-xs text-zinc-500">Escribe al menos 2 caracteres para buscar.</p>
                )}
              </section>

              {ingredientId ? (
                <section className="rounded-xl border border-zinc-100 bg-white shadow-sm p-4 flex flex-col gap-3">
                  {isAutoSameFamilyMode ? (
                    <>
                      <p className="text-[10px] font-black uppercase tracking-wider text-[#36606F]">
                        Unidades
                      </p>
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 space-y-1">
                        <p className="text-sm font-black text-emerald-950">
                          {autoSameFamilyCaption ??
                            `Conversión automática: 1 ${billingMassVolumeNorm} = 1 ${purchaseMassVolumeNorm}`}
                        </p>
                        <p className="text-xs font-medium text-emerald-900/80 leading-snug">
                          Misma familia de medida (masa o volumen): no hace falta indicar garrafas ni
                          cajas; el precio y el stock se ajustan con la equivalencia estándar.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowAdvancedCalibration(true)}
                        className="min-h-12 w-full rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-3 text-xs font-bold uppercase tracking-wide text-zinc-600 hover:bg-white active:scale-[0.99] transition"
                      >
                        Caja, ud u otra conversión…
                      </button>
                    </>
                  ) : isSimpleMode ? (
                    <>
                      <p className="text-[10px] font-black uppercase tracking-wider text-[#36606F]">
                        Unidades
                      </p>
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 space-y-1">
                        <p className="text-sm font-black text-emerald-950">
                          1 unidad en el albarán = 1 unidad en almacén
                        </p>
                        <p className="text-xs font-medium text-emerald-900/80 leading-snug">
                          No hace falta calibrar litros ni cajas: cada línea suma una unidad al stock
                          (€/ud).
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowAdvancedCalibration(true)}
                        className="min-h-12 w-full rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-3 text-xs font-bold uppercase tracking-wide text-zinc-600 hover:bg-white active:scale-[0.99] transition"
                      >
                        Caja, litros u otra conversión…
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-[10px] font-black uppercase tracking-wider text-[#36606F]">
                        Conversión albarán → almacén
                      </p>
                      <p className="text-xs font-medium text-zinc-600 leading-snug">
                        Indica qué trae cada unidad de factura (ej. una garrafa contiene 5 litros).
                      </p>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={dimensional.lineBillingUnit}
                      onChange={(e) =>
                        setDimensional((d) => ({ ...d, lineBillingUnit: e.target.value }))
                      }
                      placeholder="Garrafa"
                      aria-label="Unidad de facturación"
                      className="min-h-12 min-w-[7rem] flex-1 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-[#36606F]/50"
                    />
                    <span className="text-sm font-bold text-zinc-500 shrink-0 px-1">contiene</span>
                    <input
                      inputMode="decimal"
                      value={dimensional.lineContentQty}
                      onChange={(e) =>
                        setDimensional((d) => ({ ...d, lineContentQty: e.target.value }))
                      }
                      placeholder="5"
                      aria-label="Cantidad por unidad"
                      className="min-h-12 w-20 shrink-0 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-[#36606F]/50"
                    />
                    <select
                      value={dimensional.lineContentUnit}
                      onChange={(e) =>
                        setDimensional((d) => ({ ...d, lineContentUnit: e.target.value }))
                      }
                      aria-label="Unidad de contenido"
                      className="min-h-12 min-w-[5.5rem] shrink-0 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none focus:border-[#36606F]/50"
                    >
                      <option value="">—</option>
                      {ALBARAN_LINE_CONTENT_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>

                  <p className="text-xs font-medium text-zinc-600 leading-relaxed border-t border-zinc-100 pt-3">
                    El sistema calculará y guardará el precio exacto por{' '}
                    <span className="font-black text-[#36606F]">{ingredientPurchaseUnit || 'ud'}</span> de
                    compra del ingrediente seleccionado.
                  </p>

                  <label className="block pt-1">
                    <span className="text-[9px] font-black uppercase tracking-wider text-zinc-400">
                      Factor de conversión (avanzado)
                    </span>
                    <input
                      inputMode="decimal"
                      value={factor}
                      onChange={(e) => setFactor(e.target.value)}
                      className="mt-1 w-full min-h-12 rounded-xl border border-zinc-100 bg-zinc-50 px-3 text-sm font-bold text-zinc-700 outline-none focus:border-[#36606F]/40"
                    />
                  </label>

                      {selectedIngredientMeta &&
                      billingMassVolumeNorm != null &&
                      sameMassVolumeFamilyBillingAndIngredient(
                        billingMassVolumeNorm,
                        selectedIngredientMeta
                      ) ? (
                        <button
                          type="button"
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
                          className="min-h-12 w-full rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold uppercase tracking-wide text-emerald-900 hover:bg-emerald-100 active:scale-[0.99] transition"
                        >
                          Volver a conversión automática
                        </button>
                      ) : selectedIngredientMeta &&
                        isSimpleAlbaranUnitMapping(selectedIngredientMeta, dimensional, factor) ? (
                        <button
                          type="button"
                          onClick={() => {
                            setDimensional({ ...SIMPLE_ALBARAN_UNIT_DIMENSIONAL })
                            setFactor('1')
                            setShowAdvancedCalibration(false)
                          }}
                          className="min-h-12 w-full rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold uppercase tracking-wide text-emerald-900 hover:bg-emerald-100 active:scale-[0.99] transition"
                        >
                          Volver a modo unidad simple
                        </button>
                      ) : null}
                    </>
                  )}
                </section>
              ) : null}

              {supplierId == null ? (
                <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800">
                  Asigna un proveedor al albarán antes de vincular líneas.
                </p>
              ) : null}
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-zinc-200 bg-white p-4 flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="min-h-12 flex-1 rounded-xl border border-zinc-200 bg-white text-sm font-black uppercase tracking-wide text-zinc-700 hover:bg-zinc-50 active:scale-[0.99] transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!canSave || saving || loading}
            className={cn(
              'min-h-12 flex-1 rounded-xl bg-[#36606F] text-sm font-black uppercase tracking-wide text-white shadow-sm hover:bg-[#2d4f5c] active:scale-[0.99] transition',
              (!canSave || saving || loading) && 'opacity-50 pointer-events-none'
            )}
          >
            {saving ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Guardando…
              </span>
            ) : alreadyMappedSameIngredient ? (
              'Guardar'
            ) : (
              'Vincular'
            )}
          </button>
        </div>
      </div>
    </div>,
    target
  )
}
