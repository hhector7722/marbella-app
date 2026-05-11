// SSOT precios ingredientes / albaranes: context/INGREDIENTS_PRECIOS_Y_ALBARANES.md
import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { pricingAssistantCopy } from '@/lib/ingredient-pricing-assistant-copy'
import { PricingChoiceButton, PricingStepHeader } from '@/components/ingredients/PricingAssistantControls'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'

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
  recommendedStock: number | null
  supplier: string | null
  supplier2: string | null
  /** Si true, los albaranes no actualizan `current_price` en catálogo. */
  priceLocked: boolean
}

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
const VOLUME_PRESETS = [
  { qty: 200, unit: 'ml' as const },
  { qty: 250, unit: 'ml' as const },
  { qty: 330, unit: 'ml' as const },
  { qty: 500, unit: 'ml' as const },
  { qty: 700, unit: 'ml' as const },
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
  const converted = convertQty(perUnitQty, d.contentPerUnitUnit, d.baseUnit)
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

export function IngredientWizard({
  ingredientId: initialIngredientId,
  initialName,
  initialCategory,
  initialHowCharged,
  initialPricingMode,
  mode,
  onSaved,
  onClose,
}: {
  ingredientId?: string | null
  initialName?: string
  initialCategory?: IngredientWizardCategory | null
  initialHowCharged?: IngredientWizardHowCharged | null
  initialPricingMode?: IngredientWizardPricing | null
  mode?: 'create' | 'editPricing' | 'editFull'
  onSaved?: (ingredientId: string) => void
  onClose?: () => void
}) {
  const supabase = createClient()
  const [ingredientId, setIngredientId] = useState<string | null>(initialIngredientId ?? null)
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<WizardDraft>(() => ({
    name: String(initialName ?? '').trim(),
    category: initialCategory ?? null,
    howCharged: initialHowCharged ?? null,
    pricingMode: initialPricingMode ?? null,
    containsLiquid: null,
    supplierPrice: 0,
    unitsInside: null,
    contentPerUnitQty: null,
    contentPerUnitUnit: 'ud',
    baseUnit: initialCategory ? primaryBaseUnitForCategory(initialCategory) : 'l',
    wastePercentage: 0,
    orderUnit: 'unidad',
    recommendedStock: null,
    supplier: null,
    supplier2: null,
    priceLocked: false,
  }))

  const unitCost = useMemo(() => computeUnitCost(draft), [draft])

  const [dbSuppliers, setDbSuppliers] = useState<{ id: number; name: string }[]>([])
  const [isCustomSupplier, setIsCustomSupplier] = useState(false)
  const [isCustomSupplier2, setIsCustomSupplier2] = useState(false)
  const [customSupplierName, setCustomSupplierName] = useState('')
  const [customSupplier2Name, setCustomSupplier2Name] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase.from('suppliers').select('id,name').order('name')
      if (cancelled) return
      if (error) {
        toast.error('No se pudieron cargar los proveedores')
        return
      }
      if (data) setDbSuppliers(data as { id: number; name: string }[])
    })()
    return () => {
      cancelled = true
    }
  }, [supabase])

  useEffect(() => {
    const id = initialIngredientId ?? null
    if (!id) return
    let cancelled = false

    async function loadExistingIngredient() {
      setSaving(true)
      try {
        const [supRes, ingRes] = await Promise.all([
          supabase.from('suppliers').select('id,name').order('name'),
          supabase
            .from('ingredients')
            .select(
              'id,name,category,supplier_pricing_mode,purchase_unit,current_price,pack_price,pack_units,pack_unit_size_qty,pack_unit_size_unit,waste_percentage,order_unit,recommended_stock,supplier,supplier_2,price_locked'
            )
            .eq('id', id)
            .maybeSingle(),
        ])
        const { data: supRows, error: supErr } = supRes
        const { data, error } = ingRes
        if (cancelled) return
        if (supErr) toast.error('No se pudieron cargar los proveedores')
        if (supRows?.length) setDbSuppliers(supRows as { id: number; name: string }[])
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
        const baseUnit: WizardBaseUnit = purchaseUnit === 'l' ? 'l' : purchaseUnit === 'ud' ? 'ud' : 'kg'

        const spm = ((data as any).supplier_pricing_mode ?? 'per_purchase_unit') as IngredientWizardPricing
        const pricingMode: IngredientWizardPricing = spm === 'per_pack' ? 'per_pack' : 'per_purchase_unit'

        const howCharged: IngredientWizardHowCharged =
          pricingMode === 'per_pack' ? 'pack' : baseUnit === 'kg' ? 'kilo' : baseUnit === 'l' ? 'litro' : 'unidad'

        const packPrice = (data as any).pack_price == null ? null : Number((data as any).pack_price)
        const currentPrice = (data as any).current_price == null ? 0 : Number((data as any).current_price)
        const supplierPrice = pricingMode === 'per_pack' ? (Number.isFinite(packPrice as any) ? (packPrice as number) : 0) : currentPrice

        setDraft((d) => ({
          ...d,
          name: String((data as any).name ?? '').trim(),
          category: cat,
          pricingMode,
          howCharged,
          containsLiquid: baseUnit === 'l' ? true : d.containsLiquid,
          supplierPrice: Number.isFinite(supplierPrice) ? supplierPrice : 0,
          unitsInside: (data as any).pack_units == null ? null : Number((data as any).pack_units),
          contentPerUnitQty: (data as any).pack_unit_size_qty == null ? null : Number((data as any).pack_unit_size_qty),
          contentPerUnitUnit: (() => {
            const raw = String((data as any).pack_unit_size_unit ?? 'ud').toLowerCase()
            // Si la unidad base es litros, nunca permitir ud.
            if (baseUnit === 'l' && raw === 'ud') return 'ml'
            return (raw as any) || 'ud'
          })(),
          baseUnit,
          wastePercentage: (data as any).waste_percentage == null ? 0 : Number((data as any).waste_percentage),
          orderUnit: String((data as any).order_unit ?? 'unidad'),
          recommendedStock: (data as any).recommended_stock == null ? null : Number((data as any).recommended_stock),
          supplier: (data as any).supplier ?? null,
          supplier2: (data as any).supplier_2 ?? null,
          priceLocked: (data as any).price_locked === true,
        }))

        const rawS1 = (data as any).supplier
        const rawS2 = (data as any).supplier_2
        const s1 = rawS1 != null ? String(rawS1).trim() : null
        const s2 = rawS2 != null ? String(rawS2).trim() : null
        setIsCustomSupplier(!!s1 && !nameSet.has(s1))
        setCustomSupplierName(!!s1 && !nameSet.has(s1) ? s1 : '')
        setIsCustomSupplier2(!!s2 && !nameSet.has(s2))
        setCustomSupplier2Name(!!s2 && !nameSet.has(s2) ? s2 : '')

        // Si el objetivo es editar precio, entrar en el asistente de cobro (paso 3)
        // para replicar el flujo completo de /ingredients (cómo lo cobra → precio).
        const m = mode ?? 'create'
        if (m === 'editPricing') setStep(3)
        else if (m === 'editFull') setStep(2)
      } catch (e: any) {
        toast.error(e?.message || 'Error cargando ingrediente')
      } finally {
        if (!cancelled) setSaving(false)
      }
    }

    void loadExistingIngredient()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialIngredientId])

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
    setStep((s) => (s === 5 ? 5 : ((s + 1) as any)))
  }

  function back() {
    setStep((s) => (s === 1 ? 1 : ((s - 1) as any)))
  }

  async function handleConfirmName() {
    const clean = String(draft.name || '').trim()
    if (!clean) return toast.error('Nombre requerido')
    try {
      const id = await ensureIngredientId(clean)
      await supabase.from('ingredients').update({ name: clean }).eq('id', id)
      onSaved?.(id)
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

  function needsLiquidQuestion(h: IngredientWizardHowCharged): boolean {
    return h === 'pack' || h === 'unidad'
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
        // Solo pedimos contenido por unidad si es líquido. Si NO es líquido, fijamos 1 ud.
        contentPerUnitQty: perPack ? (shouldAskContent ? (draft.contentPerUnitQty ?? null) : 1) : null,
        contentPerUnitUnit: perPack ? (shouldAskContent ? (draft.contentPerUnitUnit ?? 'ml') : 'ud') : 'ud',
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

    if (needsLiquidQuestion(h)) {
      // guardamos selección y esperamos a la respuesta Sí/No para decidir la lógica
      await upsertDraft({
        howCharged: h,
        containsLiquid: null,
        // resetea configuración de pack para evitar confusión visual previa
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
      if (!draft.pricingMode) return toast.error('Falta seleccionar cómo cobra el proveedor')
      if (draft.pricingMode === 'per_purchase_unit') {
        if (!Number.isFinite(draft.supplierPrice) || draft.supplierPrice < 0) return toast.error('Precio inválido')
        await savePatch({
          supplier_pricing_mode: 'per_purchase_unit',
          current_price: draft.supplierPrice,
          purchase_unit: draft.baseUnit,
          unit_type: draft.baseUnit,
          pack_price: null,
          pack_units: null,
          pack_unit_size_qty: null,
          pack_unit_size_unit: null,
        })
        advance()
        return
      }

      // per_pack
      if (!Number.isFinite(draft.supplierPrice) || draft.supplierPrice < 0) return toast.error('Precio inválido')
      if (!draft.unitsInside || draft.unitsInside <= 0) return toast.error('Unidades dentro inválido')
      if (draft.containsLiquid === true) {
        if (!Number.isFinite(draft.contentPerUnitQty ?? NaN) || Number(draft.contentPerUnitQty) <= 0) {
          return toast.error('Falta el contenido por unidad (ej. 330 ml)')
        }
      }
      const qty = draft.contentPerUnitQty ?? 1
      const unit = draft.contentPerUnitUnit ?? 'ud'

      // Blindaje: evitar estados imposibles (ej. ud -> l).
      const converted = convertQty(qty, unit, draft.baseUnit)
      if (converted == null) {
        return toast.error(`Conversión no soportada: ${unit} -> ${draft.baseUnit}`)
      }

      await savePatch({
        supplier_pricing_mode: 'per_pack',
        pack_price: draft.supplierPrice,
        pack_units: draft.unitsInside,
        pack_unit_size_qty: qty,
        pack_unit_size_unit: unit,
        purchase_unit: draft.baseUnit,
        unit_type: draft.baseUnit,
      })
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
      const supplier = String(draft.supplier ?? '').trim() || null
      const supplier_2 = String(draft.supplier2 ?? '').trim() || null

      await savePatch({
        waste_percentage,
        order_unit,
        recommended_stock: rs,
        supplier,
        supplier_2,
        price_locked: draft.priceLocked === true,
      })
      // Notificar al padre el ID final para enlazarlo (ej. mapeo desde albaranes)
      if (ingredientId) onSaved?.(ingredientId)
      onClose?.()
    } catch (e: any) {
      toast.error(e?.message || 'Error al guardar')
    }
  }

  function closeWithoutSavingOptional() {
    if (ingredientId) onSaved?.(ingredientId)
    onClose?.()
  }

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm p-4 space-y-4">
      {step === 1 ? (
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
          <PricingStepHeader title={pricingAssistantCopy.invoiceStyle.title} hint={pricingAssistantCopy.invoiceStyle.hint} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {allowedHowChargedOptionsForCategory(draft.category).includes('kilo') && (
              <PricingChoiceButton
                disabled={saving}
                title={pricingAssistantCopy.invoiceStyle.perKg}
                subtitle={pricingAssistantCopy.invoiceStyle.perKgSub}
                onClick={() => handlePickHowCharged('kilo')}
              />
            )}
            {allowedHowChargedOptionsForCategory(draft.category).includes('litro') && (
              <PricingChoiceButton
                disabled={saving}
                title={pricingAssistantCopy.invoiceStyle.perL}
                subtitle={pricingAssistantCopy.invoiceStyle.perLSub}
                onClick={() => handlePickHowCharged('litro')}
              />
            )}
            {allowedHowChargedOptionsForCategory(draft.category).includes('pack') && (
              <PricingChoiceButton
                disabled={saving}
                title={pricingAssistantCopy.invoiceStyle.perPack}
                subtitle={pricingAssistantCopy.invoiceStyle.perPackSub}
                onClick={() => handlePickHowCharged('pack')}
              />
            )}
            {allowedHowChargedOptionsForCategory(draft.category).includes('unidad') && (
              <PricingChoiceButton
                disabled={saving}
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
                      void finalizeHowChargedAndAdvance({
                        howCharged: draft.howCharged as any,
                        pricingMode: draft.howCharged === 'pack' ? 'per_pack' : 'per_purchase_unit',
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
                      void finalizeHowChargedAndAdvance({
                        howCharged: draft.howCharged as any,
                        pricingMode: draft.howCharged === 'pack' ? 'per_pack' : 'per_purchase_unit',
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
                      void finalizeHowChargedAndAdvance({
                        howCharged: draft.howCharged as any,
                        pricingMode: draft.howCharged === 'pack' ? 'per_pack' : 'per_purchase_unit',
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
                {PACK_UNITS_PRESETS.map((n) => (
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

              {draft.baseUnit !== 'ud' ? (
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
                      onChange={(e) => setDraft((d) => ({ ...d, contentPerUnitQty: e.target.value === '' ? null : toNumber(e.target.value) }))}
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
                      {draft.baseUnit === 'l' ? (
                        <>
                          <option value="ml">ml</option>
                          <option value="cl">cl</option>
                          <option value="l">L</option>
                        </>
                      ) : (
                        <>
                          <option value="g">g</option>
                          <option value="kg">kg</option>
                        </>
                      )}
                    </select>
                  </label>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-sm">
                  <div className="text-xs font-bold text-zinc-800">{pricingAssistantCopy.amounts.eachPiece}</div>
                  <div className="mt-1 text-sm text-zinc-600">{pricingAssistantCopy.amounts.noPerPiece}</div>
                </div>
              )}

              {draft.baseUnit !== 'ud' && (
                <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-sm">
                  <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    {pricingAssistantCopy.amounts.shortcuts}
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {(draft.baseUnit === 'l' ? VOLUME_PRESETS.slice(0, 6) : MASS_PRESETS).map((p) => (
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
              )}
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
              {unitCost == null ? '—' : `${unitCost.toFixed(4)}€ / ${draft.baseUnit}`}
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

