import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'

export type IngredientWizardCategory = 'Bebida' | 'Comida' | 'Packaging'
export type IngredientWizardHowCharged = 'kilo' | 'litro' | 'pack' | 'unidad'
export type IngredientWizardPricing = 'per_purchase_unit' | 'per_pack'
export type WizardBaseUnit = 'kg' | 'l' | 'ud'

export type WizardDraft = {
  name: string
  category: IngredientWizardCategory | null
  howCharged: IngredientWizardHowCharged | null
  pricingMode: IngredientWizardPricing | null
  // Precio según proveedor:
  supplierPrice: number
  // Si viene por formato/caja:
  unitsInside: number | null
  contentPerUnitQty: number | null
  contentPerUnitUnit: 'ud' | 'ml' | 'cl' | 'l' | 'g' | 'kg'
  // Unidad base (para coste/recetas):
  baseUnit: WizardBaseUnit
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

const PACK_UNITS_PRESETS = [6, 12, 24, 48, 72, 96]
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
  return 'kg'
}

export function IngredientWizard({
  ingredientId: initialIngredientId,
  initialName,
  initialCategory,
  initialHowCharged,
  initialPricingMode,
  onClose,
}: {
  ingredientId?: string | null
  initialName?: string
  initialCategory?: IngredientWizardCategory | null
  initialHowCharged?: IngredientWizardHowCharged | null
  initialPricingMode?: IngredientWizardPricing | null
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
    supplierPrice: 0,
    unitsInside: null,
    contentPerUnitQty: null,
    contentPerUnitUnit: 'ud',
    baseUnit: initialCategory ? primaryBaseUnitForCategory(initialCategory) : 'l',
  }))

  const unitCost = useMemo(() => computeUnitCost(draft), [draft])

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
      advance()
    } catch (e: any) {
      toast.error(e?.message || 'Error guardando nombre')
    }
  }

  async function handlePickCategory(cat: IngredientWizardCategory) {
    const dbCategory = cat === 'Bebida' ? 'Bebidas' : cat === 'Packaging' ? 'Packaging' : 'Alimentos'
    try {
      await upsertDraft({ category: cat, baseUnit: primaryBaseUnitForCategory(cat) })
      await savePatch({ category: dbCategory })
      advance()
    } catch (e: any) {
      toast.error(e?.message || 'Error guardando categoría')
    }
  }

  async function handlePickHowCharged(h: IngredientWizardHowCharged) {
    try {
      let pricingMode: IngredientWizardPricing = h === 'pack' ? 'per_pack' : 'per_purchase_unit'
      let baseUnit: WizardBaseUnit = draft.baseUnit
      if (h === 'kilo') baseUnit = 'kg'
      if (h === 'litro') baseUnit = 'l'
      if (h === 'unidad') baseUnit = 'ud'
      if (h === 'pack') {
        baseUnit = primaryBaseUnitForCategory(draft.category ?? 'Bebida')
      }

      await upsertDraft({
        howCharged: h,
        pricingMode,
        baseUnit,
        unitsInside: h === 'pack' ? (draft.unitsInside ?? 1) : null,
        contentPerUnitQty:
          h === 'pack'
            ? (draft.contentPerUnitQty ?? (draft.category === 'Bebida' ? 330 : 1))
            : null,
        contentPerUnitUnit:
          h === 'pack'
            ? (draft.category === 'Bebida' ? 'ml' : 'ud')
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
      const qty = draft.contentPerUnitQty ?? 1
      const unit = draft.contentPerUnitUnit ?? 'ud'
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

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm p-4 space-y-4">
      {step === 1 ? (
        <div className="space-y-3">
          <label className="block space-y-2">
            <span className="text-xs font-black text-zinc-700 uppercase tracking-widest">Nombre</span>
            <input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder=""
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
            Continuar
          </button>
        </div>
      ) : (
        <div className="min-h-12 rounded-xl border border-zinc-100 bg-zinc-50 px-3 flex items-center shrink-0">
          <span className="font-black text-zinc-900">{draft.name || '—'}</span>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <div className="text-xs font-black text-zinc-700 uppercase tracking-widest">¿Qué es?</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => handlePickCategory('Bebida')}
              className="min-h-12 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-black"
            >
              Bebida
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handlePickCategory('Comida')}
              className="min-h-12 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-black"
            >
              Comida
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => handlePickCategory('Packaging')}
              className="col-span-2 min-h-12 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-black"
            >
              Packaging
            </button>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={back} className="min-h-12 flex-1 rounded-xl border border-zinc-200 font-bold">
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
              className="min-h-12 flex-1 rounded-xl border border-zinc-200 bg-white font-black text-zinc-700 disabled:opacity-50"
            >
              Añadir más tarde
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <div className="text-xs font-black text-zinc-700 uppercase tracking-widest">¿Cómo lo cobra el proveedor?</div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={saving} onClick={() => handlePickHowCharged('kilo')} className="min-h-12 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-black">
              Por kilo
            </button>
            <button type="button" disabled={saving} onClick={() => handlePickHowCharged('litro')} className="min-h-12 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-black">
              Por litro
            </button>
            <button type="button" disabled={saving} onClick={() => handlePickHowCharged('pack')} className="min-h-12 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-black">
              Por pack
            </button>
            <button type="button" disabled={saving} onClick={() => handlePickHowCharged('unidad')} className="min-h-12 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-black">
              Por unidad
            </button>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={back} className="min-h-12 flex-1 rounded-xl border border-zinc-200 font-bold">
              Atrás
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                // Añadir más tarde: saltamos directamente al paso de imagen.
                await skipPricing()
              }}
              className="min-h-12 flex-1 rounded-xl border border-zinc-200 bg-white font-black text-zinc-700 disabled:opacity-50"
            >
              Añadir más tarde
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3">
          <div className="text-xs font-black text-zinc-700 uppercase tracking-widest">Precio</div>
          <label className="block space-y-1">
            <span className="text-[10px] font-bold uppercase text-zinc-400">Precio (€)</span>
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
              <div className="text-xs font-black text-zinc-700 uppercase tracking-widest">Contenido del pack</div>
              <label className="block space-y-1">
                <span className="text-[10px] font-bold uppercase text-zinc-400">Unidades dentro</span>
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
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1">
                  <span className="text-[10px] font-bold uppercase text-zinc-400">Contenido por unidad</span>
                  <input
                    type="number"
                    step="0.001"
                    value={draft.contentPerUnitQty ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, contentPerUnitQty: e.target.value === '' ? null : toNumber(e.target.value) }))}
                    className="w-full min-h-12 rounded-xl border border-zinc-200 px-3 text-sm font-mono"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[10px] font-bold uppercase text-zinc-400">Unidad contenido</span>
                  <select
                    value={draft.contentPerUnitUnit}
                    onChange={(e) => setDraft((d) => ({ ...d, contentPerUnitUnit: e.target.value as any }))}
                    className="w-full min-h-12 rounded-xl border border-zinc-200 px-3 text-sm bg-white"
                  >
                    <option value="ud">ud</option>
                    <option value="ml">ml</option>
                    <option value="cl">cl</option>
                    <option value="l">L</option>
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                  </select>
                </label>
              </div>

              <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-sm">
                <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Atajos</div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {(draft.category === 'Bebida' ? VOLUME_PRESETS : MASS_PRESETS).slice(0, 6).map((p) => (
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
            </div>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={back} className="min-h-12 flex-1 rounded-xl border border-zinc-200 font-bold">
              Atrás
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={skipPricing}
              className="min-h-12 flex-1 rounded-xl border border-zinc-200 bg-white font-black text-zinc-700 disabled:opacity-50"
            >
              Añadir más tarde
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSavePricingAndAdvance}
              className="min-h-12 flex-1 rounded-xl bg-[#36606F] text-white font-black disabled:opacity-50"
            >
              Guardar
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
          <div className="rounded-2xl border border-zinc-100 bg-white p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Coste unitario (auto)</div>
            <div className="text-2xl font-black text-[#36606F] mt-1">
              {unitCost == null ? '—' : `${unitCost.toFixed(4)}€ / ${draft.baseUnit}`}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onClose?.()}
            className="w-full min-h-12 rounded-xl bg-emerald-600 text-white font-black"
          >
            Terminar
          </button>
          <button
            type="button"
            onClick={() => onClose?.()}
            className="w-full min-h-12 rounded-xl border border-zinc-200 bg-white font-black text-zinc-700"
          >
            Añadir más tarde
          </button>
        </div>
      )}
    </div>
  )
}

