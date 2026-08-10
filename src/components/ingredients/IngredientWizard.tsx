// SSOT precios ingredientes / albaranes: marbella-os/3-ingenieria/dominio/PRECIOS-Y-COMPRAS.md
import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { pricingAssistantCopy } from '@/lib/ingredient-pricing-assistant-copy'
import {
  resolveDeclaredPurchaseUnitWithPackContent,
  suggestedAlbaranConversionFactorFromIngredient,
} from '@/lib/ingredient-pack-pricing'
import { PricingChoiceButton, PricingStepHeader } from '@/components/ingredients/PricingAssistantControls'
import {
  IngredientExpressPricePanel,
  type ExpressKind,
} from '@/components/ingredients/IngredientExpressPricePanel'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'
import { buildIngredientPriceOnlyPatch } from '@/lib/ingredient-price-sync'
import {
  RECIPE_UNIT_OPTIONS,
  convertToPurchaseUnitQuantity,
  defaultRecipeUnitFromPurchase,
  resolveIngredientRecipeUnit,
} from '@/lib/recipe-cost'
import { buildSupplierNameSet, getOrphanedSupplierName } from '@/lib/orphaned-supplier'
import { resolveSupplierPickerItems } from '@/lib/supplier-seed'
import { OrphanedSupplierAlert } from '@/components/ingredients/OrphanedSupplierAlert'

export type IngredientWizardCategory = 'Bebida' | 'Comida' | 'Packaging' | 'Limpieza' | 'Otros'
export type IngredientWizardHowCharged = 'kilo' | 'litro' | 'pack' | 'unidad'
export type IngredientWizardPricing = 'per_purchase_unit' | 'per_pack'
export type WizardBaseUnit = 'kg' | 'l' | 'ud'

export type WizardDraft = {
  name: string
  category: IngredientWizardCategory | null
  howCharged: IngredientWizardHowCharged | null
  pricingMode: IngredientWizardPricing | null
  containsLiquid: boolean | null
  // Precio según proveedor:
  supplierPrice: number
  // Si viene por formato/caja:
  unitsInside: number | null
  contentPerUnitQty: number | null
  contentPerUnitUnit: 'ud' | 'ml' | 'cl' | 'l' | 'g' | 'kg'
  // Unidad base (para coste/recetas):
  baseUnit: WizardBaseUnit
  // Opcionales (último paso)
  wastePercentage: number | null
  orderUnit: string | null
  recipeUnit: string | null
  recommendedStock: number | null
  supplier: string | null
  supplier2: string | null
  /** Si true, los albaranes no actualizan `current_price` en catálogo. */
  priceLocked: boolean
}

export type IngredientWizardInvoiceContext = {
  lineLabel?: string | null
  quantity?: string | number | null
  unitPrice?: number | null
}

export type IngredientWizardSavedMeta = {
  name?: string | null
  suggestedConversionFactor?: number | null
}

type WizardStep = 1 | 2 | 3 | 4 | 5 | 'express'

export type WizardResult = {
  supplier_pricing_mode: IngredientWizardPricing
  purchase_unit: WizardBaseUnit
  // per_purchase_unit:
  current_price?: number
  // per_pack:
  pack_price?: number | null
  pack_units?: number | null
  pack_unit_size_qty?: number | null
  pack_unit_size_unit?: string | null
}

const PACK_UNITS_PRESETS = [12, 24]
/** Atajos para packaging (paletinas, vasos, etc.). */
const COUNTABLE_PACK_UNITS_PRESETS = [100, 500, 1000]
const VOLUME_PRESETS = [
  { qty: 200, unit: 'ml' as const },
  { qty: 250, unit: 'ml' as const },
  { qty: 330, unit: 'ml' as const },
  { qty: 500, unit: 'ml' as const },
  { qty: 700, unit: 'ml' as const },
  { qty: 740, unit: 'ml' as const },
  { qty: 750, unit: 'ml' as const },
  { qty: 1, unit: 'l' as const },
  { qty: 1.5, unit: 'l' as const },
  { qty: 2, unit: 'l' as const },
]
const MASS_PRESETS = [
  { qty: 100, unit: 'g' as const },
  { qty: 250, unit: 'g' as const },
  { qty: 500, unit: 'g' as const },
  { qty: 1, unit: 'kg' as const },
  { qty: 2, unit: 'kg' as const },
]

const ORDER_UNIT_OPTIONS = ['unidad', 'ud', 'pack', 'caja', 'pieza', 'kg', 'l', 'g', 'ml', 'cl'] as const

function toNumber(x: unknown): number {
  const n = typeof x === 'number' ? x : Number(String(x ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function toWizardPurchaseBase(resolved: string): WizardBaseUnit {
  if (resolved === 'kg') return 'kg'
  if (resolved === 'l') return 'l'
  return 'ud'
}

function convertQty(qty: number, from: string, to: WizardBaseUnit): number | null {
  const f = String(from).trim().toLowerCase()
  if (to === 'ud') {
    if (f === 'ud') return qty
    return null
  }
  if (to === 'l') {
    if (f === 'l') return qty
    if (f === 'ml') return qty / 1000
    if (f === 'cl') return qty / 100
    return null
  }
  if (to === 'kg') {
    if (f === 'kg') return qty
    if (f === 'g') return qty / 1000
    return null
  }
  return null
}

function computeUnitCost(d: WizardDraft): number | null {
  if (!Number.isFinite(d.supplierPrice) || d.supplierPrice < 0) return null
  if (d.pricingMode === 'per_purchase_unit') return d.supplierPrice
  const units = d.unitsInside ?? 0
  if (!Number.isFinite(units) || units <= 0) return null
  const perUnitQty = d.contentPerUnitQty ?? 1
  const contentUnit = d.contentPerUnitUnit ?? 'ud'
  const storeBase = toWizardPurchaseBase(
    resolveDeclaredPurchaseUnitWithPackContent(d.baseUnit, contentUnit)
  )
  const converted = convertQty(perUnitQty, contentUnit, storeBase)
  if (converted == null || converted <= 0) return null
  return d.supplierPrice / (units * converted)
}

function primaryBaseUnitForCategory(cat: IngredientWizardCategory): WizardBaseUnit {
  if (cat === 'Bebida') return 'l'
  if (cat === 'Packaging') return 'ud'
  if (cat === 'Limpieza') return 'ud'
  if (cat === 'Otros') return 'ud'
  return 'kg'
}

function allowedHowChargedOptionsForCategory(cat: IngredientWizardCategory | null): IngredientWizardHowCharged[] {
  // Reglas solicitadas:
  // - Comida: no aparece "litro"
  // - Bebida: no aparece "kilo"
  // - Packaging/Limpieza/Otros: no aparece "litro" ni "kilo"
  const all: IngredientWizardHowCharged[] = ['kilo', 'litro', 'pack', 'unidad']
  if (!cat) return all
  if (cat === 'Bebida') return all.filter((x) => x !== 'kilo')
  if (cat === 'Comida') return all.filter((x) => x !== 'litro')
  if (cat === 'Packaging' || cat === 'Limpieza' || cat === 'Otros') return all.filter((x) => x !== 'litro' && x !== 'kilo')
  return all
}

function needsLiquidQuestion(h: IngredientWizardHowCharged): boolean {
  return h === 'pack' || h === 'unidad'
}

/** Caja con piezas contables (ud) → per_pack; pieza suelta → per_purchase_unit; volumen/peso → per_pack. */
function pricingModeForHowCharged(h: IngredientWizardHowCharged, baseUnit: WizardBaseUnit): IngredientWizardPricing {
  if (h === 'kilo' || h === 'litro') return 'per_purchase_unit'
  if (h === 'pack') {
    return 'per_pack'
  }
  if (h === 'unidad') {
    if (baseUnit === 'ud') return 'per_purchase_unit'
    return 'per_pack'
  }
  return 'per_purchase_unit'
}

function isCountableCategory(cat: IngredientWizardCategory | null): boolean {
  return cat === 'Packaging' || cat === 'Limpieza' || cat === 'Otros'
}

function isDraftReadyForPriceStep(d: WizardDraft): boolean {
  if (!d.pricingMode || !d.howCharged) return false
  if (needsLiquidQuestion(d.howCharged) && d.containsLiquid == null) return false
  return true
}

/** Inferir si el contenido por pieza es “líquido” según unidad guardada en BD. */
function inferContainsLiquidFromPackUnit(unitRaw: string | null | undefined): boolean {
  const u = String(unitRaw ?? '').toLowerCase()
  if (['ml', 'cl', 'l'].includes(u)) return true
  if (['g', 'kg', 'ud'].includes(u) || u === '') return false
  return false
}

function inferExpressKind(d: WizardDraft): ExpressKind | null {
  if (d.howCharged === 'kilo') return 'kg'
  if (d.howCharged === 'litro') return 'l'
  if (d.howCharged === 'pack') return 'pack'
  if (d.howCharged === 'unidad') {
    if (d.pricingMode === 'per_pack' && d.baseUnit === 'l') return 'piece_liquid'
    if (d.pricingMode === 'per_pack' && d.baseUnit === 'kg') return 'piece_liquid'
    return 'piece'
  }
  return null
}

function draftPatchForExpressKind(kind: ExpressKind): Partial<WizardDraft> {
  if (kind === 'kg') {
    return {
      howCharged: 'kilo',
      pricingMode: 'per_purchase_unit',
      baseUnit: 'kg',
      containsLiquid: false,
      unitsInside: null,
      contentPerUnitQty: null,
      contentPerUnitUnit: 'ud',
    }
  }
  if (kind === 'l') {
    return {
      howCharged: 'litro',
      pricingMode: 'per_purchase_unit',
      baseUnit: 'l',
      containsLiquid: true,
      unitsInside: null,
      contentPerUnitQty: null,
      contentPerUnitUnit: 'ud',
    }
  }
  if (kind === 'piece') {
    return {
      howCharged: 'unidad',
      pricingMode: 'per_purchase_unit',
      baseUnit: 'ud',
      containsLiquid: false,
      unitsInside: null,
      contentPerUnitQty: null,
      contentPerUnitUnit: 'ud',
    }
  }
  if (kind === 'piece_liquid') {
    return {
      howCharged: 'unidad',
      pricingMode: 'per_pack',
      baseUnit: 'l',
      containsLiquid: true,
      unitsInside: 1,
      contentPerUnitQty: 750,
      contentPerUnitUnit: 'ml',
    }
  }
  return {
    howCharged: 'pack',
    pricingMode: 'per_pack',
    baseUnit: 'l',
    containsLiquid: true,
    unitsInside: 24,
    contentPerUnitQty: 330,
    contentPerUnitUnit: 'ml',
  }
}

function dbCategoryForExpressKind(kind: ExpressKind): string {
  if (kind === 'l' || kind === 'piece_liquid') return 'Bebidas'
  if (kind === 'pack') return 'Bebidas'
  return 'Alimentos'
}

function formatWizardPricingSummary(d: WizardDraft): string {
  const parts: string[] = []
  const unitCostPreview = computeUnitCost(d)

  if (d.pricingMode === 'per_purchase_unit') {
    if (d.howCharged === 'kilo') parts.push('Factura: por kilo')
    else if (d.howCharged === 'litro') parts.push('Factura: por litro')
    else if (d.howCharged === 'unidad') parts.push('Factura: por unidad')
    else parts.push('Factura: por compra')
    parts.push(`Almacén / recetas en ${d.baseUnit}`)
    if (unitCostPreview != null && unitCostPreview > 0) {
      parts.push(`Coste ${unitCostPreview.toFixed(2).replace('.', ',')} €/${d.baseUnit}`)
    } else if (Number.isFinite(d.supplierPrice) && d.supplierPrice > 0) {
      parts.push(`Importe factura ${d.supplierPrice.toFixed(2).replace('.', ',')} €`)
    }
  } else {
    parts.push('Factura: por pack o caja')
    const n = d.unitsInside
    if (n != null && Number.isFinite(n) && n > 0) parts.push(`${n} uds por pack`)
    const q = d.contentPerUnitQty
    const u = d.contentPerUnitUnit
    if (q != null && Number.isFinite(q) && q > 0) parts.push(`${q} ${u}/pieza`)
    if (Number.isFinite(d.supplierPrice) && d.supplierPrice > 0) {
      parts.push(`Precio pack ${d.supplierPrice.toFixed(2).replace('.', ',')} €`)
    }
    if (unitCostPreview != null && unitCostPreview > 0) {
      parts.push(`Coste ${unitCostPreview.toFixed(2).replace('.', ',')} €/${d.baseUnit}`)
    }
  }
  if (d.priceLocked) parts.push('Precio fijo (albaranes no lo cambian)')
  return parts.join(' · ')
}

export function IngredientWizard({
  ingredientId: initialIngredientId,
  initialName,
  initialCategory,
  initialHowCharged,
  initialPricingMode,
  mode,
  flow = 'full',
  invoiceContext,
  onSaved,
  onClose,
}: {
  ingredientId?: string | null
  initialName?: string
  initialCategory?: IngredientWizardCategory | null
  initialHowCharged?: IngredientWizardHowCharged | null
  initialPricingMode?: IngredientWizardPricing | null
  mode?: 'create' | 'editPricing' | 'editFull'
  /** `express`: una pantalla con precio del albarán (ideal desde mapeo). `full`: asistente completo. */
  flow?: 'full' | 'express'
  invoiceContext?: IngredientWizardInvoiceContext
  onSaved?: (ingredientId: string, meta?: IngredientWizardSavedMeta) => void
  onClose?: () => void
}) {
  const supabase = createClient()
  const isExpress = flow === 'express'
  const initialUnitPrice = useMemo(() => {
    const n = Number(invoiceContext?.unitPrice)
    return Number.isFinite(n) && n >= 0 ? n : 0
  }, [invoiceContext?.unitPrice])

  const [ingredientId, setIngredientId] = useState<string | null>(initialIngredientId ?? null)
  const [step, setStep] = useState<WizardStep>(() => (isExpress ? 'express' : 1))
  const [expressKind, setExpressKind] = useState<ExpressKind | null>(null)
  const [saving, setSaving] = useState(false)
  const [ingredientHydrated, setIngredientHydrated] = useState(() => !initialIngredientId)
  const [draft, setDraft] = useState<WizardDraft>(() => ({
    name: String(initialName ?? '').trim(),
    category: initialCategory ?? null,
    howCharged: initialHowCharged ?? null,
    pricingMode: initialPricingMode ?? null,
    containsLiquid: null,
    supplierPrice: initialUnitPrice,
    unitsInside: null,
    contentPerUnitQty: null,
    contentPerUnitUnit: 'ud',
    baseUnit: initialCategory ? primaryBaseUnitForCategory(initialCategory) : 'l',
    wastePercentage: 0,
    orderUnit: 'unidad',
    recipeUnit: 'kg',
    recommendedStock: null,
    supplier: null,
    supplier2: null,
    priceLocked: false,
  }))

  const unitCost = useMemo(() => computeUnitCost(draft), [draft])

  const [dbSuppliers, setDbSuppliers] = useState<{ id: string; name: string }[]>([])
  const [suppliersLoaded, setSuppliersLoaded] = useState(false)
  const [isCustomSupplier, setIsCustomSupplier] = useState(false)
  const [isCustomSupplier2, setIsCustomSupplier2] = useState(false)
  const [customSupplierName, setCustomSupplierName] = useState('')
  const [customSupplier2Name, setCustomSupplier2Name] = useState('')

  const supplierNamesFromDb = useMemo(() => buildSupplierNameSet(dbSuppliers), [dbSuppliers])

  const orphanedSupplier1 = useMemo(
    () => getOrphanedSupplierName(draft.supplier, supplierNamesFromDb, suppliersLoaded),
    [draft.supplier, supplierNamesFromDb, suppliersLoaded],
  )

  const orphanedSupplier2 = useMemo(
    () => getOrphanedSupplierName(draft.supplier2, supplierNamesFromDb, suppliersLoaded),
    [draft.supplier2, supplierNamesFromDb, suppliersLoaded],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase.from('suppliers').select('id,name').order('name')
      if (cancelled) return
      if (error) {
        toast.error('No se pudieron cargar los proveedores')
        setSuppliersLoaded(true)
        return
      }
      const rows = (data ?? []).map((r) => ({
        id: String(r.id),
        name: String(r.name ?? '').trim(),
      })).filter((r) => r.name)
      setDbSuppliers(resolveSupplierPickerItems(rows))
      setSuppliersLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [supabase])

  useEffect(() => {
    const id = initialIngredientId ?? null
    if (!id) {
      setIngredientHydrated(true)
      return
    }
    setIngredientHydrated(false)
    let cancelled = false

    async function loadExistingIngredient() {
      setSaving(true)
      try {
        const [supRes, ingRes] = await Promise.all([
          supabase.from('suppliers').select('id,name').order('name'),
          supabase
            .from('ingredients')
            .select(
              'id,name,category,supplier_pricing_mode,purchase_unit,recipe_unit,current_price,pack_price,pack_units,pack_unit_size_qty,pack_unit_size_unit,waste_percentage,order_unit,recommended_stock,supplier,supplier_2,price_locked'
            )
            .eq('id', id)
            .maybeSingle(),
        ])
        const { data: supRows, error: supErr } = supRes
        const { data, error } = ingRes
        if (cancelled) return
        if (supErr) toast.error('No se pudieron cargar los proveedores')
        const supMapped = resolveSupplierPickerItems(
          (supRows ?? []).map((r) => ({
            id: String((r as { id: number }).id),
            name: String((r as { name?: string }).name ?? '').trim(),
          })).filter((r) => r.name),
        )
        setDbSuppliers(supMapped)
        setSuppliersLoaded(true)
        if (error) throw error
        if (!data?.id) throw new Error('Ingrediente no encontrado')

        const nameSet = new Set(
          (supRows ?? []).map((s) => String((s as { name?: string }).name ?? '').trim()).filter(Boolean)
        )

        setIngredientId(String(data.id))

        const catDb = String((data as any).category ?? 'Alimentos')
        const cat: IngredientWizardCategory =
          catDb === 'Bebidas'
            ? 'Bebida'
            : catDb === 'Packaging'
              ? 'Packaging'
              : catDb === 'Limpieza'
                ? 'Limpieza'
                : catDb === 'Otros'
                  ? 'Otros'
                  : 'Comida'

        const purchaseUnit = String((data as any).purchase_unit ?? 'kg').toLowerCase()
        let baseUnit: WizardBaseUnit = purchaseUnit === 'l' ? 'l' : purchaseUnit === 'ud' ? 'ud' : 'kg'

        const spm = ((data as any).supplier_pricing_mode ?? 'per_purchase_unit') as IngredientWizardPricing
        const pricingMode: IngredientWizardPricing = spm === 'per_pack' ? 'per_pack' : 'per_purchase_unit'

        if (pricingMode === 'per_pack' && isCountableCategory(cat)) {
          baseUnit = 'ud'
        }

        const howCharged: IngredientWizardHowCharged =
          pricingMode === 'per_pack' ? 'pack' : baseUnit === 'kg' ? 'kilo' : baseUnit === 'l' ? 'litro' : 'unidad'

        const packPrice = (data as any).pack_price == null ? null : Number((data as any).pack_price)
        const currentPrice = (data as any).current_price == null ? 0 : Number((data as any).current_price)
        const supplierPrice = pricingMode === 'per_pack' ? (Number.isFinite(packPrice as any) ? (packPrice as number) : 0) : currentPrice

        const packUnitRaw = (data as any).pack_unit_size_unit

        let containsLiquidVal: boolean | null = null
        if (pricingMode === 'per_pack') {
          containsLiquidVal = inferContainsLiquidFromPackUnit(packUnitRaw == null ? undefined : String(packUnitRaw))
        } else if (baseUnit === 'l') {
          containsLiquidVal = true
        } else if (baseUnit === 'kg') {
          containsLiquidVal = false
        } else {
          containsLiquidVal = false
        }

        const rawUnitLower = String(packUnitRaw ?? 'ud').toLowerCase()
        const allowedContentUnits = new Set(['ml', 'cl', 'l', 'g', 'kg', 'ud'])
        const contentPerUnitUnitResolved: WizardDraft['contentPerUnitUnit'] = allowedContentUnits.has(rawUnitLower)
          ? (rawUnitLower as WizardDraft['contentPerUnitUnit'])
          : baseUnit === 'l'
            ? 'ml'
            : baseUnit === 'kg'
              ? 'g'
              : 'ud'

        const nextDraft: WizardDraft = {
          name: String((data as any).name ?? '').trim(),
          category: cat,
          howCharged,
          pricingMode,
          containsLiquid: containsLiquidVal,
          supplierPrice: Number.isFinite(supplierPrice) ? supplierPrice : 0,
          unitsInside: (data as any).pack_units == null ? null : Number((data as any).pack_units),
          contentPerUnitQty: (data as any).pack_unit_size_qty == null ? null : Number((data as any).pack_unit_size_qty),
          contentPerUnitUnit: contentPerUnitUnitResolved,
          baseUnit,
          wastePercentage: (data as any).waste_percentage == null ? 0 : Number((data as any).waste_percentage),
          orderUnit: String((data as any).order_unit ?? 'unidad'),
          recipeUnit: resolveIngredientRecipeUnit((data as any).recipe_unit, purchaseUnit),
          recommendedStock: (data as any).recommended_stock == null ? null : Number((data as any).recommended_stock),
          supplier: (data as any).supplier ?? null,
          supplier2: (data as any).supplier_2 ?? null,
          priceLocked: (data as any).price_locked === true,
        }

        setDraft(nextDraft)

        const rawS1 = (data as any).supplier
        const rawS2 = (data as any).supplier_2
        const s1 = rawS1 != null ? String(rawS1).trim() : null
        const s2 = rawS2 != null ? String(rawS2).trim() : null
        setIsCustomSupplier(!!s1 && !nameSet.has(s1))
        setCustomSupplierName(!!s1 && !nameSet.has(s1) ? s1 : '')
        setIsCustomSupplier2(!!s2 && !nameSet.has(s2))
        setCustomSupplier2Name(!!s2 && !nameSet.has(s2) ? s2 : '')

        const m = mode ?? 'create'
        if (isExpress) {
          setStep('express')
          setExpressKind(inferExpressKind(nextDraft))
        } else if (m === 'editPricing') {
          setStep(isDraftReadyForPriceStep(nextDraft) ? 4 : 3)
        } else if (m === 'editFull') {
          setStep(2)
        }
      } catch (e: any) {
        toast.error(e?.message || 'Error cargando ingrediente')
      } finally {
        if (!cancelled) {
          setSaving(false)
          setIngredientHydrated(true)
        }
      }
    }

    void loadExistingIngredient()
    return () => {
      cancelled = true
    }
  }, [initialIngredientId, isExpress, mode, supabase])

  useEffect(() => {
    if (!isExpress || !ingredientHydrated) return
    if (initialUnitPrice > 0) {
      setDraft((d) => (d.supplierPrice > 0 ? d : { ...d, supplierPrice: initialUnitPrice }))
    }
    if (!expressKind && initialUnitPrice > 0 && !initialIngredientId) {
      setExpressKind('piece_liquid')
      setDraft((d) => ({ ...d, ...draftPatchForExpressKind('piece_liquid') }))
    }
  }, [expressKind, initialIngredientId, initialUnitPrice, ingredientHydrated, isExpress])

  async function upsertDraft(patch: Partial<WizardDraft>) {
    setDraft((d) => ({ ...d, ...patch }))
  }

  async function ensureIngredientId(name: string): Promise<string> {
    if (ingredientId) return ingredientId
    const clean = String(name || '').trim()
    if (!clean) throw new Error('Nombre requerido')
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('ingredients')
        .insert({
          name: clean,
          category: 'Alimentos',
          current_price: 0,
          purchase_unit: 'kg',
          unit_type: 'kg',
          waste_percentage: 0,
          supplier_pricing_mode: 'per_purchase_unit',
          order_unit: 'ud',
          recipe_unit: 'kg',
          price_locked: false,
        })
        .select('id')
        .single()
      if (error) throw error
      const id = data?.id as string
      if (!id) throw new Error('No se pudo crear ingrediente')
      setIngredientId(id)
      return id
    } finally {
      setSaving(false)
    }
  }

  async function savePatch(patch: Record<string, any>) {
    const id = await ensureIngredientId(draft.name)
    setSaving(true)
    try {
      const { error } = await supabase.from('ingredients').update(patch).eq('id', id)
      if (error) throw error
    } finally {
      setSaving(false)
    }
  }

  function advance() {
    setStep((s) => {
      if (s === 'express') return 'express'
      if (s === 5) return 5
      return (s + 1) as WizardStep
    })
  }

  function back() {
    setStep((s) => {
      if (s === 'express') return 'express'
      if (s === 1) return 1
      return (s - 1) as WizardStep
    })
  }

  const expressPreviewDraft = useMemo(() => {
    if (!expressKind) return draft
    return { ...draft, ...draftPatchForExpressKind(expressKind) }
  }, [draft, expressKind])

  const expressUnitCost = useMemo(() => computeUnitCost(expressPreviewDraft), [expressPreviewDraft])

  const expressSuggestedFactor = useMemo(() => {
    if (!expressKind) return null
    const d = expressPreviewDraft
    return suggestedAlbaranConversionFactorFromIngredient({
      supplier_pricing_mode: d.pricingMode ?? undefined,
      purchase_unit: d.baseUnit,
      pack_unit_size_qty: d.contentPerUnitQty,
      pack_unit_size_unit: d.contentPerUnitUnit,
      pack_units: d.unitsInside,
    })
  }, [expressKind, expressPreviewDraft])

  function recipeUnitForDraft(d: WizardDraft, purchaseUnit: string): string {
    return resolveIngredientRecipeUnit(d.recipeUnit, purchaseUnit)
  }

  /** Solo precio: conserva purchase_unit, recipe_unit, pack_* y supplier_pricing_mode del catálogo. */
  async function persistPriceOnlyFromExistingCatalog(d: WizardDraft, id: string) {
    const { data: row, error } = await supabase
      .from('ingredients')
      .select(
        'current_price, supplier_pricing_mode, pack_price, pack_units, pack_unit_size_qty, pack_unit_size_unit, purchase_unit'
      )
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    if (!row) throw new Error('Ingrediente no encontrado')

    const mode = String((row as any).supplier_pricing_mode ?? 'per_purchase_unit')
    let targetPurchaseUnitPrice = d.supplierPrice
    if (mode === 'per_pack') {
      const denom =
        Number((row as any).pack_units) > 0 &&
        Number((row as any).pack_unit_size_qty) > 0 &&
        (row as any).pack_unit_size_unit
          ? (() => {
              const converted = convertToPurchaseUnitQuantity(
                Number((row as any).pack_unit_size_qty),
                String((row as any).pack_unit_size_unit),
                String((row as any).purchase_unit ?? 'kg')
              )
              if (converted == null || converted <= 0) return null
              return Number((row as any).pack_units) * converted
            })()
          : null
      if (denom != null && denom > 0) targetPurchaseUnitPrice = d.supplierPrice / denom
    }

    const patch = buildIngredientPriceOnlyPatch(row as any, targetPurchaseUnitPrice, (qty, from, to) =>
      convertToPurchaseUnitQuantity(qty, from, to)
    )
    if (!patch) return
    const { error: updErr } = await supabase.from('ingredients').update(patch).eq('id', id)
    if (updErr) throw updErr
  }

  async function persistPricingFromDraft(d: WizardDraft) {
    if (!d.pricingMode) throw new Error('Falta el modo de precio')
    if (d.pricingMode === 'per_purchase_unit') {
      if (!Number.isFinite(d.supplierPrice) || d.supplierPrice < 0) throw new Error('Precio inválido')
      await savePatch({
        supplier_pricing_mode: 'per_purchase_unit',
        current_price: d.supplierPrice,
        purchase_unit: d.baseUnit,
        unit_type: d.baseUnit,
        recipe_unit: recipeUnitForDraft(d, d.baseUnit),
        pack_price: null,
        pack_units: null,
        pack_unit_size_qty: null,
        pack_unit_size_unit: null,
      })
      return
    }
    if (!Number.isFinite(d.supplierPrice) || d.supplierPrice < 0) throw new Error('Precio inválido')
    if (!d.unitsInside || d.unitsInside <= 0) throw new Error('Indica cuántas piezas trae el pack')
    const qty = d.contentPerUnitQty ?? 1
    const unit = d.contentPerUnitUnit ?? 'ud'
    const storePurchase = toWizardPurchaseBase(resolveDeclaredPurchaseUnitWithPackContent(d.baseUnit, unit))
    if (storePurchase !== 'ud' && (!Number.isFinite(qty) || qty <= 0)) {
      throw new Error('Indica tamaño por unidad (ej. 750 ml)')
    }
    const converted = convertQty(qty, unit, storePurchase)
    if (converted == null) throw new Error(`Conversión no soportada: ${unit} → ${storePurchase}`)
    await savePatch({
      supplier_pricing_mode: 'per_pack',
      pack_price: d.supplierPrice,
      pack_units: d.unitsInside,
      pack_unit_size_qty: qty,
      pack_unit_size_unit: unit,
      purchase_unit: storePurchase,
      unit_type: storePurchase,
      recipe_unit: recipeUnitForDraft(d, storePurchase),
    })
  }

  function pickExpressKind(kind: ExpressKind) {
    setExpressKind(kind)
    setDraft((d) => ({ ...d, ...draftPatchForExpressKind(kind) }))
  }

  async function handleExpressSave() {
    const cleanName = String(draft.name || '').trim()
    if (!cleanName) return toast.error('Nombre requerido')
    if (!expressKind) return toast.error('Elige cómo cobra el proveedor')
    try {
      setSaving(true)
      const merged: WizardDraft = {
        ...draft,
        ...draftPatchForExpressKind(expressKind),
        name: cleanName,
      }
      setDraft(merged)
      const id = await ensureIngredientId(cleanName)
      await supabase.from('ingredients').update({ name: cleanName }).eq('id', id)
      const catDb = dbCategoryForExpressKind(expressKind)
      await savePatch({ category: catDb })
      if (mode === 'editPricing' && initialIngredientId) {
        await persistPriceOnlyFromExistingCatalog(merged, id)
      } else {
        await persistPricingFromDraft(merged)
      }
      const factor = suggestedAlbaranConversionFactorFromIngredient({
        supplier_pricing_mode: merged.pricingMode ?? undefined,
        purchase_unit: merged.baseUnit,
        pack_unit_size_qty: merged.contentPerUnitQty,
        pack_unit_size_unit: merged.contentPerUnitUnit,
        pack_units: merged.unitsInside,
      })
      toast.success('Precio guardado')
      onSaved?.(id, { name: cleanName, suggestedConversionFactor: factor })
      onClose?.()
    } catch (e: any) {
      toast.error(e?.message || 'Error guardando precio')
    } finally {
      setSaving(false)
    }
  }

  async function handleConfirmName() {
    const clean = String(draft.name || '').trim()
    if (!clean) return toast.error('Nombre requerido')
    try {
      const id = await ensureIngredientId(clean)
      await supabase.from('ingredients').update({ name: clean }).eq('id', id)
      onSaved?.(id, { name: clean })
      advance()
    } catch (e: any) {
      toast.error(e?.message || 'Error guardando nombre')
    }
  }

  async function handlePickCategory(cat: IngredientWizardCategory) {
    const dbCategory =
      cat === 'Bebida'
        ? 'Bebidas'
        : cat === 'Packaging'
          ? 'Packaging'
          : cat === 'Limpieza'
            ? 'Limpieza'
            : cat === 'Otros'
              ? 'Otros'
              : 'Alimentos'
    try {
      await upsertDraft({ category: cat, baseUnit: primaryBaseUnitForCategory(cat) })
      await savePatch({ category: dbCategory })
      advance()
    } catch (e: any) {
      toast.error(e?.message || 'Error guardando categoría')
    }
  }

  async function finalizeHowChargedAndAdvance(next: {
    howCharged: IngredientWizardHowCharged
    pricingMode: IngredientWizardPricing
    baseUnit: WizardBaseUnit
    containsLiquid: boolean | null
  }) {
    try {
      const h = next.howCharged
      const pricingMode = next.pricingMode
      const baseUnit = next.baseUnit
      const containsLiquid = next.containsLiquid

      const perPack = pricingMode === 'per_pack'
      const shouldAskContent = perPack && containsLiquid === true

      await upsertDraft({
        howCharged: h,
        pricingMode,
        baseUnit,
        containsLiquid,
        unitsInside: perPack ? (h === 'unidad' ? 1 : (draft.unitsInside ?? 1)) : null,
        // Si no es líquido: 1 unidad coherente con la base elegida (ud / kg / l).
        contentPerUnitQty: perPack ? (shouldAskContent ? (draft.contentPerUnitQty ?? null) : 1) : null,
        contentPerUnitUnit: perPack
          ? shouldAskContent
            ? (draft.contentPerUnitUnit ?? 'ml')
            : baseUnit === 'kg'
              ? 'kg'
              : baseUnit === 'l'
                ? 'l'
                : 'ud'
          : 'ud',
      })

      // IMPORTANTE:
      // - En modo pack, NO podemos guardar supplier_pricing_mode='per_pack' aún,
      //   porque el trigger exige pack_price/pack_units/pack_unit_size_* y lanza excepción si faltan.
      // - Lo guardamos en el paso de Precio junto con los pack_*.
      if (pricingMode === 'per_purchase_unit') {
        await savePatch({
          supplier_pricing_mode: 'per_purchase_unit',
          purchase_unit: baseUnit,
          unit_type: baseUnit,
          pack_price: null,
          pack_units: null,
          pack_unit_size_qty: null,
          pack_unit_size_unit: null,
        })
      } else {
        await savePatch({
          // mantener modo estable hasta que haya pack_* completos
          supplier_pricing_mode: 'per_purchase_unit',
          purchase_unit: baseUnit,
          unit_type: baseUnit,
          pack_price: null,
          pack_units: null,
          pack_unit_size_qty: null,
          pack_unit_size_unit: null,
        })
      }

      advance()
    } catch (e: any) {
      toast.error(e?.message || 'Error guardando modo proveedor')
    }
  }

  async function handlePickHowCharged(h: IngredientWizardHowCharged) {
    // Reglas:
    // - litro => se entiende "líquido"
    // - kilo  => se entiende "no líquido"
    // - pack/unidad => preguntamos "¿contiene líquido?"
    if (h === 'litro') {
      return finalizeHowChargedAndAdvance({
        howCharged: h,
        pricingMode: 'per_purchase_unit',
        baseUnit: 'l',
        containsLiquid: true,
      })
    }
    if (h === 'kilo') {
      return finalizeHowChargedAndAdvance({
        howCharged: h,
        pricingMode: 'per_purchase_unit',
        baseUnit: 'kg',
        containsLiquid: false,
      })
    }

    // Packaging / limpieza / otros: caja de piezas contables → per_pack en ud sin pantalla de líquido.
    if (h === 'pack' && isCountableCategory(draft.category)) {
      return finalizeHowChargedAndAdvance({
        howCharged: 'pack',
        pricingMode: 'per_pack',
        baseUnit: 'ud',
        containsLiquid: false,
      })
    }

    if (needsLiquidQuestion(h)) {
      // guardamos selección y esperamos a la respuesta (peso / volumen / ud)
      await upsertDraft({
        howCharged: h,
        containsLiquid: null,
        unitsInside: null,
        contentPerUnitQty: null,
        contentPerUnitUnit: 'ud',
      })
      return
    }

    // fallback seguro (no debería ocurrir)
    return finalizeHowChargedAndAdvance({
      howCharged: h,
      pricingMode: 'per_purchase_unit',
      baseUnit: draft.baseUnit,
      containsLiquid: null,
    })
  }

  async function handleSavePricingAndAdvance() {
    try {
      await persistPricingFromDraft(draft)
      advance()
    } catch (e: any) {
      toast.error(e?.message || 'Error guardando precio')
    }
  }

  async function skipPricing() {
    try {
      // Permitir crear sin precio: dejamos un estado estable compatible con trigger.
      await savePatch({
        supplier_pricing_mode: 'per_purchase_unit',
        current_price: 0,
        pack_price: null,
        pack_units: null,
        pack_unit_size_qty: null,
        pack_unit_size_unit: null,
      })
      advance()
    } catch (e: any) {
      toast.error(e?.message || 'Error al saltar precio')
    }
  }

  async function handleUploadImage(file: File) {
    try {
      const id = await ensureIngredientId(draft.name)
      const fileExt = file.name.split('.').pop() || 'jpg'
      const fileName = `ing-${id}-${Date.now()}.${fileExt}`
      const { error: uploadError } = await supabase.storage.from('ingredients').upload(fileName, file, { upsert: true })
      if (uploadError) throw uploadError
      const { data } = supabase.storage.from('ingredients').getPublicUrl(fileName)
      const publicUrl = data.publicUrl
      await supabase.from('ingredients').update({ image_url: publicUrl }).eq('id', id)
      toast.success('Imagen guardada')
    } catch (e: any) {
      toast.error(e?.message || 'Error subiendo imagen')
    }
  }

  async function saveOptionalFieldsAndClose() {
    try {
      // Acepta vacíos: proveedores pueden ser null; stock puede ser null.
      const wp = draft.wastePercentage == null ? 0 : Number(draft.wastePercentage)
      const waste_percentage = Number.isFinite(wp) ? wp : 0
      const rs =
        draft.recommendedStock == null
          ? null
          : (() => {
              const n = Number(draft.recommendedStock)
              return Number.isFinite(n) ? n : null
            })()
      const order_unit = String(draft.orderUnit ?? '').trim() || null
      const recipe_unit = resolveIngredientRecipeUnit(draft.recipeUnit, draft.baseUnit)
      const supplier = String(draft.supplier ?? '').trim() || null
      const supplier_2 = String(draft.supplier2 ?? '').trim() || null

      await savePatch({
        waste_percentage,
        order_unit,
        recipe_unit,
        recommended_stock: rs,
        supplier,
        supplier_2,
        price_locked: draft.priceLocked === true,
      })
      // Notificar al padre el ID final para enlazarlo (ej. mapeo desde albaranes)
      if (ingredientId)
        onSaved?.(ingredientId, { name: String(draft.name || '').trim() || null })
      onClose?.()
    } catch (e: any) {
      toast.error(e?.message || 'Error al guardar')
    }
  }

  function closeWithoutSavingOptional() {
    if (ingredientId) onSaved?.(ingredientId, { name: String(draft.name || '').trim() || null })
    onClose?.()
  }

  if (!ingredientHydrated) {
    return (
      <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm p-8 flex min-h-[12rem] flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-[#36606F]" aria-hidden />
        <p className="text-center text-sm font-bold text-zinc-600">Cargando configuración del ingrediente…</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm p-4 space-y-4">
      {step === 'express' ? (
        <IngredientExpressPricePanel
          draft={{
            name: draft.name,
            supplierPrice: draft.supplierPrice,
            unitsInside: draft.unitsInside,
            contentPerUnitQty: draft.contentPerUnitQty,
            contentPerUnitUnit: draft.contentPerUnitUnit,
          }}
          setDraft={(updater) => {
            setDraft((d) => {
              const slice =
                typeof updater === 'function'
                  ? updater({
                      name: d.name,
                      supplierPrice: d.supplierPrice,
                      unitsInside: d.unitsInside,
                      contentPerUnitQty: d.contentPerUnitQty,
                      contentPerUnitUnit: d.contentPerUnitUnit,
                    })
                  : updater
              return {
                ...d,
                ...slice,
                contentPerUnitUnit: (slice.contentPerUnitUnit ?? d.contentPerUnitUnit) as WizardDraft['contentPerUnitUnit'],
              }
            })
          }}
          expressKind={expressKind}
          onPickKind={pickExpressKind}
          invoiceContext={invoiceContext}
          initialUnitPrice={initialUnitPrice}
          showNameField={!initialIngredientId}
          saving={saving}
          unitCost={expressUnitCost}
          previewBaseUnit={expressPreviewDraft.baseUnit}
          suggestedFactor={expressSuggestedFactor}
          onSave={() => void handleExpressSave()}
          onAdvanced={() => {
            if (expressKind) setDraft((d) => ({ ...d, ...draftPatchForExpressKind(expressKind) }))
            setStep(3)
          }}
        />
      ) : step === 1 ? (
        <div className="space-y-3">
          <PricingStepHeader title={pricingAssistantCopy.name.title} hint={pricingAssistantCopy.name.hint} />
          <label className="block space-y-2">
            <span className="sr-only">Nombre</span>
            <input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="Ej. Tomate pera, Aceite 0,4…"
              className="w-full min-h-12 rounded-xl border border-zinc-200 px-3 text-sm font-bold"
              autoFocus
            />
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={handleConfirmName}
            className="w-full min-h-12 rounded-xl bg-[#36606F] text-white font-black disabled:opacity-50"
          >
            {pricingAssistantCopy.name.continue}
          </button>
        </div>
      ) : (
        <div className="min-h-12 rounded-xl border border-zinc-100 bg-zinc-50 px-3 flex items-center shrink-0">
          <span className="font-black text-zinc-900">{draft.name || '—'}</span>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <PricingStepHeader title={pricingAssistantCopy.category.title} hint={pricingAssistantCopy.category.hint} />
          <div className="grid grid-cols-1 gap-2">
            <PricingChoiceButton
              disabled={saving}
              title={pricingAssistantCopy.category.drinks}
              subtitle={pricingAssistantCopy.category.drinksSub}
              onClick={() => handlePickCategory('Bebida')}
            />
            <PricingChoiceButton
              disabled={saving}
              title={pricingAssistantCopy.category.food}
              subtitle={pricingAssistantCopy.category.foodSub}
              onClick={() => handlePickCategory('Comida')}
            />
            <PricingChoiceButton
              disabled={saving}
              title={pricingAssistantCopy.category.packaging}
              subtitle={pricingAssistantCopy.category.packagingSub}
              onClick={() => handlePickCategory('Packaging')}
            />
            <PricingChoiceButton
              disabled={saving}
              title={pricingAssistantCopy.category.cleaning}
              subtitle={pricingAssistantCopy.category.cleaningSub}
              onClick={() => handlePickCategory('Limpieza')}
            />
            <PricingChoiceButton
              disabled={saving}
              title={pricingAssistantCopy.category.other}
              subtitle={pricingAssistantCopy.category.otherSub}
              onClick={() => handlePickCategory('Otros')}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={back}
              className="min-h-12 flex-1 rounded-xl bg-rose-600 text-white font-black hover:bg-rose-700"
            >
              Atrás
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                // Añadir más tarde: mantenemos categoría por defecto en BD (Alimentos) y avanzamos.
                try {
                  await ensureIngredientId(draft.name)
                  advance()
                } catch (e: any) {
                  toast.error(e?.message || 'Error')
                }
              }}
              className="min-h-12 flex-1 rounded-xl bg-zinc-200 text-zinc-800 font-black hover:bg-zinc-300 disabled:opacity-50"
            >
              {pricingAssistantCopy.category.skipLater}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          {(mode === 'editPricing' || mode === 'editFull') && draft.howCharged ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-bold leading-snug text-emerald-950">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-emerald-800/90">
                Configuración actual en catálogo
              </span>
              {formatWizardPricingSummary(draft)}
            </div>
          ) : null}
          <PricingStepHeader title={pricingAssistantCopy.invoiceStyle.title} hint={pricingAssistantCopy.invoiceStyle.hint} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {allowedHowChargedOptionsForCategory(draft.category).includes('kilo') && (
              <PricingChoiceButton
                disabled={saving}
                selected={draft.howCharged === 'kilo'}
                title={pricingAssistantCopy.invoiceStyle.perKg}
                subtitle={pricingAssistantCopy.invoiceStyle.perKgSub}
                onClick={() => handlePickHowCharged('kilo')}
              />
            )}
            {allowedHowChargedOptionsForCategory(draft.category).includes('litro') && (
              <PricingChoiceButton
                disabled={saving}
                selected={draft.howCharged === 'litro'}
                title={pricingAssistantCopy.invoiceStyle.perL}
                subtitle={pricingAssistantCopy.invoiceStyle.perLSub}
                onClick={() => handlePickHowCharged('litro')}
              />
            )}
            {allowedHowChargedOptionsForCategory(draft.category).includes('pack') && (
              <PricingChoiceButton
                disabled={saving}
                selected={draft.howCharged === 'pack'}
                title={pricingAssistantCopy.invoiceStyle.perPack}
                subtitle={pricingAssistantCopy.invoiceStyle.perPackSub}
                onClick={() => handlePickHowCharged('pack')}
              />
            )}
            {allowedHowChargedOptionsForCategory(draft.category).includes('unidad') && (
              <PricingChoiceButton
                disabled={saving}
                selected={draft.howCharged === 'unidad'}
                title={pricingAssistantCopy.invoiceStyle.perUnit}
                subtitle={pricingAssistantCopy.invoiceStyle.perUnitSub}
                onClick={() => handlePickHowCharged('unidad')}
              />
            )}
          </div>

          {needsLiquidQuestion(draft.howCharged ?? 'kilo') &&
            (draft.howCharged === 'pack' || draft.howCharged === 'unidad') &&
            draft.containsLiquid == null && (
              <div className="rounded-2xl border border-zinc-100 bg-white p-4 space-y-3">
                <PricingStepHeader title={pricingAssistantCopy.baseMeasure.title} hint={pricingAssistantCopy.baseMeasure.hint} />
                <div className="grid grid-cols-1 gap-2">
                  <PricingChoiceButton
                    disabled={saving}
                    title={pricingAssistantCopy.baseMeasure.weight}
                    subtitle={pricingAssistantCopy.baseMeasure.weightSub}
                    onClick={() => {
                      const h = draft.howCharged as IngredientWizardHowCharged
                      void finalizeHowChargedAndAdvance({
                        howCharged: h,
                        pricingMode: pricingModeForHowCharged(h, 'kg'),
                        baseUnit: 'kg',
                        containsLiquid: false,
                      })
                    }}
                  />
                  <PricingChoiceButton
                    disabled={saving}
                    title={pricingAssistantCopy.baseMeasure.volume}
                    subtitle={pricingAssistantCopy.baseMeasure.volumeSub}
                    onClick={() => {
                      const h = draft.howCharged as IngredientWizardHowCharged
                      void finalizeHowChargedAndAdvance({
                        howCharged: h,
                        pricingMode: pricingModeForHowCharged(h, 'l'),
                        baseUnit: 'l',
                        containsLiquid: true,
                      })
                    }}
                  />
                  <PricingChoiceButton
                    disabled={saving}
                    title={pricingAssistantCopy.baseMeasure.count}
                    subtitle={pricingAssistantCopy.baseMeasure.countSub}
                    onClick={() => {
                      const h = draft.howCharged as IngredientWizardHowCharged
                      void finalizeHowChargedAndAdvance({
                        howCharged: h,
                        pricingMode: pricingModeForHowCharged(h, 'ud'),
                        baseUnit: 'ud',
                        containsLiquid: false,
                      })
                    }}
                  />
                </div>
              </div>
            )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={back}
              className="min-h-12 flex-1 rounded-xl bg-rose-600 text-white font-black hover:bg-rose-700"
            >
              Atrás
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                // Añadir más tarde: saltamos directamente al paso de imagen.
                await skipPricing()
              }}
              className="min-h-12 flex-1 rounded-xl bg-zinc-200 text-zinc-800 font-black hover:bg-zinc-300 disabled:opacity-50"
            >
              {pricingAssistantCopy.invoiceStyle.skipLater}
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3">
          {(mode === 'editPricing' || mode === 'editFull') && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-bold leading-snug text-emerald-950">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-emerald-800/90">
                Configuración actual en catálogo
              </span>
              {formatWizardPricingSummary(draft)}
            </div>
          )}
          <PricingStepHeader title={pricingAssistantCopy.amounts.title} hint={pricingAssistantCopy.amounts.hint} />
          <label className="block space-y-1">
            <span className="text-xs font-bold text-zinc-700">
              {draft.pricingMode === 'per_pack'
                ? pricingAssistantCopy.amounts.packFullPrice
                : pricingAssistantCopy.amounts.priceEur}
            </span>
            <input
              type="number"
              step="0.01"
              value={draft.supplierPrice || ''}
              onChange={(e) => setDraft((d) => ({ ...d, supplierPrice: toNumber(e.target.value) }))}
              className="w-full min-h-12 rounded-xl border border-zinc-200 px-3 text-sm font-mono"
            />
          </label>

          {draft.pricingMode === 'per_pack' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="text-sm font-black text-zinc-900">{pricingAssistantCopy.amounts.howManyInPack}</div>
                <p className="text-xs leading-snug text-zinc-600">{pricingAssistantCopy.amounts.howManyInPackHint}</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(isCountableCategory(draft.category) ? COUNTABLE_PACK_UNITS_PRESETS : PACK_UNITS_PRESETS).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setDraft((d) => ({ ...d, unitsInside: n }))}
                    className={cn(
                      'min-h-12 rounded-xl border px-2 text-sm font-black',
                      draft.unitsInside === n ? 'border-[#36606F] bg-[#36606F]/5 text-[#36606F]' : 'border-zinc-200 bg-white'
                    )}
                  >
                    {n}
                  </button>
                ))}
                <input
                  type="number"
                  step="1"
                  placeholder="Otro"
                  value={draft.unitsInside ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, unitsInside: e.target.value === '' ? null : toNumber(e.target.value) }))}
                  className="min-h-12 rounded-xl border border-zinc-200 px-3 text-sm font-mono"
                />
              </div>

              <div className="space-y-2">
                <div>
                  <div className="text-sm font-bold text-zinc-800">{pricingAssistantCopy.amounts.eachPiece}</div>
                  <p className="mt-0.5 text-xs leading-snug text-zinc-600">{pricingAssistantCopy.amounts.eachPieceHint}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block space-y-1">
                    <span className="text-[10px] font-bold uppercase text-zinc-400">Cantidad</span>
                    <input
                      type="number"
                      step="0.001"
                      value={draft.contentPerUnitQty ?? ''}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, contentPerUnitQty: e.target.value === '' ? null : toNumber(e.target.value) }))
                      }
                      className="w-full min-h-12 rounded-xl border border-zinc-200 px-3 text-sm font-mono"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[10px] font-bold uppercase text-zinc-400">Medida</span>
                    <select
                      value={draft.contentPerUnitUnit}
                      onChange={(e) => setDraft((d) => ({ ...d, contentPerUnitUnit: e.target.value as any }))}
                      className="w-full min-h-12 rounded-xl border border-zinc-200 px-3 text-sm bg-white"
                    >
                      {draft.baseUnit === 'ud' && draft.howCharged === 'pack' ? (
                        <option value="ud">ud (unidad)</option>
                      ) : draft.baseUnit === 'l' ? (
                        <>
                          <option value="ml">ml</option>
                          <option value="cl">cl</option>
                          <option value="l">L</option>
                        </>
                      ) : draft.baseUnit === 'kg' ? (
                        <>
                          <option value="g">g</option>
                          <option value="kg">kg</option>
                        </>
                      ) : (
                        <>
                          <option value="ml">ml</option>
                          <option value="cl">cl</option>
                          <option value="l">L</option>
                          <option value="g">g</option>
                          <option value="kg">kg</option>
                          <option value="ud">ud</option>
                        </>
                      )}
                    </select>
                  </label>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-sm">
                <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  {pricingAssistantCopy.amounts.shortcuts}
                </div>
                {draft.baseUnit === 'l' && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {VOLUME_PRESETS.slice(0, 6).map((p) => (
                      <button
                        key={`${p.qty}-${p.unit}`}
                        type="button"
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            contentPerUnitQty: p.qty,
                            contentPerUnitUnit: p.unit as any,
                          }))
                        }
                        className="min-h-12 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-black"
                      >
                        {p.qty}
                        {p.unit}
                      </button>
                    ))}
                  </div>
                )}
                {draft.baseUnit === 'kg' && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {MASS_PRESETS.map((p) => (
                      <button
                        key={`${p.qty}-${p.unit}`}
                        type="button"
                        onClick={() =>
                          setDraft((d) => ({
                            ...d,
                            contentPerUnitQty: p.qty,
                            contentPerUnitUnit: p.unit as any,
                          }))
                        }
                        className="min-h-12 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-black"
                      >
                        {p.qty}
                        {p.unit}
                      </button>
                    ))}
                  </div>
                )}
                {draft.baseUnit === 'ud' && draft.howCharged === 'pack' ? (
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        contentPerUnitQty: 1,
                        contentPerUnitUnit: 'ud',
                      }))
                    }
                    className="mt-2 min-h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-black"
                  >
                    1 ud por pieza
                  </button>
                ) : draft.baseUnit === 'ud' ? (
                  <div className="mt-2 space-y-3">
                    <div>
                      <div className="text-[10px] font-bold uppercase text-zinc-500 mb-1.5">Volumen</div>
                      <div className="grid grid-cols-2 gap-2">
                        {VOLUME_PRESETS.map((p) => (
                          <button
                            key={`${p.qty}-${p.unit}`}
                            type="button"
                            onClick={() =>
                              setDraft((d) => ({
                                ...d,
                                contentPerUnitQty: p.qty,
                                contentPerUnitUnit: p.unit as any,
                              }))
                            }
                            className="min-h-12 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-black"
                          >
                            {p.qty}
                            {p.unit}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase text-zinc-500 mb-1.5">Masa</div>
                      <div className="grid grid-cols-2 gap-2">
                        {MASS_PRESETS.map((p) => (
                          <button
                            key={`m-${p.qty}-${p.unit}`}
                            type="button"
                            onClick={() =>
                              setDraft((d) => ({
                                ...d,
                                contentPerUnitQty: p.qty,
                                contentPerUnitUnit: p.unit as any,
                              }))
                            }
                            className="min-h-12 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-black"
                          >
                            {p.qty}
                            {p.unit}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={back}
              className="min-h-12 flex-1 rounded-xl bg-rose-600 text-white font-black hover:bg-rose-700"
            >
              Atrás
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={skipPricing}
              className="min-h-12 flex-1 rounded-xl bg-zinc-200 text-zinc-800 font-black hover:bg-zinc-300 disabled:opacity-50"
            >
              {pricingAssistantCopy.amounts.skipLater}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSavePricingAndAdvance}
              className="min-h-12 flex-1 rounded-xl bg-[#36606F] text-white font-black disabled:opacity-50"
            >
              {pricingAssistantCopy.amounts.save}
            </button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-3">
          <div className="text-xs font-black text-zinc-700 uppercase tracking-widest">Imagen (opcional)</div>
          <label className="block">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleUploadImage(f)
                e.target.value = ''
              }}
            />
            <span className="inline-flex w-full min-h-12 items-center justify-center rounded-xl border border-zinc-200 bg-white font-black text-sm cursor-pointer hover:bg-zinc-50">
              Subir imagen
            </span>
          </label>
          <div className="rounded-2xl border border-zinc-100 bg-white p-4 space-y-3">
            <div className="text-xs font-black text-zinc-700 uppercase tracking-widest">Opcional</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase text-zinc-400">% Merma</span>
                <input
                  type="number"
                  step="0.01"
                  value={draft.wastePercentage ?? ''}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      wastePercentage: e.target.value === '' ? null : toNumber(e.target.value),
                    }))
                  }
                  className="w-full min-h-12 rounded-xl border border-zinc-200 px-3 text-sm font-mono"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase text-zinc-400">U. pedido</span>
                <select
                  value={draft.orderUnit ?? 'unidad'}
                  onChange={(e) => setDraft((d) => ({ ...d, orderUnit: e.target.value }))}
                  className="w-full min-h-12 rounded-xl border border-zinc-200 px-3 text-sm bg-white font-bold"
                >
                  {ORDER_UNIT_OPTIONS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 col-span-2">
                <span className="text-[10px] font-bold uppercase text-zinc-400">U. en receta</span>
                <select
                  value={draft.recipeUnit ?? defaultRecipeUnitFromPurchase(draft.baseUnit)}
                  onChange={(e) => setDraft((d) => ({ ...d, recipeUnit: e.target.value }))}
                  className="w-full min-h-12 rounded-xl border border-zinc-200 px-3 text-sm bg-white font-bold"
                >
                  {RECIPE_UNIT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-[10px] font-bold uppercase text-zinc-400">Stock recomendado</span>
              <input
                type="number"
                step="1"
                value={draft.recommendedStock ?? ''}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    recommendedStock: e.target.value === '' ? null : toNumber(e.target.value),
                  }))
                }
                className="w-full min-h-12 rounded-xl border border-zinc-200 px-3 text-sm font-mono"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] font-bold uppercase text-zinc-400">Proveedor (opcional)</span>
              {orphanedSupplier1 ? (
                <OrphanedSupplierAlert
                  supplierName={orphanedSupplier1}
                  onPickFromList={() => {
                    setIsCustomSupplier(false)
                    setCustomSupplierName('')
                    setDraft((d) => ({ ...d, supplier: null }))
                  }}
                  onClear={() => {
                    setIsCustomSupplier(false)
                    setCustomSupplierName('')
                    setDraft((d) => ({ ...d, supplier: null }))
                  }}
                />
              ) : null}
              {!isCustomSupplier ? (
                <select
                  value={draft.supplier ?? ''}
                  onChange={(e) => {
                    if (e.target.value === 'custom') {
                      setIsCustomSupplier(true)
                      setCustomSupplierName('')
                      setDraft((d) => ({ ...d, supplier: null }))
                    } else {
                      setDraft((d) => ({ ...d, supplier: e.target.value || null }))
                    }
                  }}
                  className={cn(
                    'w-full min-h-12 rounded-xl border border-zinc-200 px-3 text-sm font-bold bg-white'
                  )}
                >
                  <option value="">Proveedor...</option>
                  {dbSuppliers.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                  <option value="custom">+ Nuevo...</option>
                </select>
              ) : (
                <div className="flex gap-2 items-center">
                  <input
                    value={customSupplierName}
                    onChange={(e) => {
                      setCustomSupplierName(e.target.value)
                      setDraft((d) => ({ ...d, supplier: e.target.value || null }))
                    }}
                    className="flex-1 min-h-12 rounded-xl border border-zinc-200 px-3 text-sm font-bold"
                    placeholder="Proveedor"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomSupplier(false)
                      setCustomSupplierName('')
                      setDraft((d) => ({ ...d, supplier: null }))
                    }}
                    className="shrink-0 text-xs font-black text-rose-500 px-2"
                  >
                    X
                  </button>
                </div>
              )}
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] font-bold uppercase text-zinc-400">Proveedor 2 (opcional)</span>
              {orphanedSupplier2 ? (
                <OrphanedSupplierAlert
                  supplierName={orphanedSupplier2}
                  label="Proveedor 2"
                  onPickFromList={() => {
                    setIsCustomSupplier2(false)
                    setCustomSupplier2Name('')
                    setDraft((d) => ({ ...d, supplier2: null }))
                  }}
                  onClear={() => {
                    setIsCustomSupplier2(false)
                    setCustomSupplier2Name('')
                    setDraft((d) => ({ ...d, supplier2: null }))
                  }}
                />
              ) : null}
              {!isCustomSupplier2 ? (
                <select
                  value={draft.supplier2 ?? ''}
                  onChange={(e) => {
                    if (e.target.value === 'custom') {
                      setIsCustomSupplier2(true)
                      setCustomSupplier2Name('')
                      setDraft((d) => ({ ...d, supplier2: null }))
                    } else {
                      setDraft((d) => ({ ...d, supplier2: e.target.value || null }))
                    }
                  }}
                  className={cn(
                    'w-full min-h-12 rounded-xl border border-zinc-200 px-3 text-sm font-bold bg-white'
                  )}
                >
                  <option value="">Proveedor 2...</option>
                  {dbSuppliers.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                  <option value="custom">+ Nuevo...</option>
                </select>
              ) : (
                <div className="flex gap-2 items-center">
                  <input
                    value={customSupplier2Name}
                    onChange={(e) => {
                      setCustomSupplier2Name(e.target.value)
                      setDraft((d) => ({ ...d, supplier2: e.target.value || null }))
                    }}
                    className="flex-1 min-h-12 rounded-xl border border-zinc-200 px-3 text-sm font-bold"
                    placeholder="Proveedor 2"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomSupplier2(false)
                      setCustomSupplier2Name('')
                      setDraft((d) => ({ ...d, supplier2: null }))
                    }}
                    className="shrink-0 text-xs font-black text-rose-500 px-2"
                  >
                    X
                  </button>
                </div>
              )}
            </label>
          </div>
          <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2">
            <input
              type="checkbox"
              checked={draft.priceLocked}
              onChange={(e) => setDraft((d) => ({ ...d, priceLocked: e.target.checked }))}
              className="h-5 w-5 shrink-0 rounded border-zinc-300"
            />
            <span className="text-xs font-bold leading-snug text-zinc-800">
              Precio fijo: no actualizar desde albaranes
            </span>
          </label>
          <div className="rounded-2xl border border-zinc-100 bg-white p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
              {pricingAssistantCopy.amounts.costPreview}
            </div>
            <div className="text-2xl font-black text-[#36606F] mt-1">
              {unitCost == null
                ? '—'
                : `${unitCost.toFixed(4)}€ / ${
                    draft.pricingMode === 'per_pack'
                      ? toWizardPurchaseBase(
                          resolveDeclaredPurchaseUnitWithPackContent(draft.baseUnit, draft.contentPerUnitUnit ?? 'ud')
                        )
                      : draft.baseUnit
                  }`}
            </div>
          </div>
          <button
            type="button"
            onClick={saveOptionalFieldsAndClose}
            className="w-full min-h-12 rounded-xl bg-emerald-600 text-white font-black"
          >
            Terminar
          </button>
          <button
            type="button"
            onClick={closeWithoutSavingOptional}
            className="w-full min-h-12 rounded-xl bg-zinc-200 text-zinc-800 font-black hover:bg-zinc-300"
          >
            Cerrar sin tocar
          </button>
        </div>
      )}
    </div>
  )
}
