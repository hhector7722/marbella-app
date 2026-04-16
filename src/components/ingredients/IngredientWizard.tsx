import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'

export type IngredientWizardCategory = 'Bebida' | 'Comida' | 'Packaging'
export type IngredientWizardPricing = 'per_purchase_unit' | 'per_pack'
export type WizardBaseUnit = 'kg' | 'l' | 'ud'

export type WizardDraft = {
  category: IngredientWizardCategory
  pricingMode: IngredientWizardPricing
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
  initialName,
  onDone,
}: {
  initialName?: string
  onDone: (result: WizardResult) => void
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [draft, setDraft] = useState<WizardDraft>(() => ({
    category: 'Bebida',
    pricingMode: 'per_purchase_unit',
    supplierPrice: 0,
    unitsInside: null,
    contentPerUnitQty: null,
    contentPerUnitUnit: 'ud',
    baseUnit: 'l',
  }))

  const unitCost = useMemo(() => computeUnitCost(draft), [draft])

  const chips = (items: Array<{ id: string; label: string; onClick: () => void }>) => (
    <div className="grid grid-cols-2 gap-2">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={it.onClick}
          className={cn(
            'min-h-12 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-bold text-zinc-800',
            'hover:bg-zinc-50 active:scale-[0.99]'
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  )

  function next() {
    setStep((s) => (s === 4 ? 4 : ((s + 1) as any)))
  }
  function back() {
    setStep((s) => (s === 1 ? 1 : ((s - 1) as any)))
  }

  function commit() {
    if (draft.pricingMode === 'per_purchase_unit') {
      onDone({
        supplier_pricing_mode: 'per_purchase_unit',
        purchase_unit: draft.baseUnit,
        current_price: unitCost ?? 0,
      })
      return
    }
    onDone({
      supplier_pricing_mode: 'per_pack',
      purchase_unit: draft.baseUnit,
      pack_price: draft.supplierPrice,
      pack_units: draft.unitsInside,
      pack_unit_size_qty: draft.contentPerUnitQty ?? 1,
      pack_unit_size_unit: draft.contentPerUnitUnit ?? 'ud',
    })
  }

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm p-4 space-y-4">
      <div className="space-y-1">
        <div className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-400">Asistente</div>
        <div className="text-lg font-black text-zinc-900 leading-tight">
          {initialName ? `Configurar “${initialName}”` : 'Configurar ingrediente'}
        </div>
      </div>

      {step === 1 && (
        <div className="space-y-3">
          <div className="text-xs font-black text-zinc-700 uppercase tracking-widest">¿Qué es?</div>
          {chips([
            {
              id: 'Bebida',
              label: 'Bebida',
              onClick: () =>
                setDraft((d) => ({
                  ...d,
                  category: 'Bebida',
                  baseUnit: 'l',
                  contentPerUnitUnit: 'ml',
                  contentPerUnitQty: d.contentPerUnitQty ?? 330,
                })),
            },
            {
              id: 'Comida',
              label: 'Comida',
              onClick: () =>
                setDraft((d) => ({
                  ...d,
                  category: 'Comida',
                  baseUnit: 'kg',
                  contentPerUnitUnit: 'g',
                  contentPerUnitQty: d.contentPerUnitQty ?? 250,
                })),
            },
            {
              id: 'Packaging',
              label: 'Packaging / consumible',
              onClick: () =>
                setDraft((d) => ({
                  ...d,
                  category: 'Packaging',
                  baseUnit: 'ud',
                  contentPerUnitUnit: 'ud',
                  contentPerUnitQty: 1,
                })),
            },
            {
              id: 'Siguiente',
              label: 'Siguiente',
              onClick: () => {
                setDraft((d) => ({ ...d, baseUnit: primaryBaseUnitForCategory(d.category) }))
                next()
              },
            },
          ])}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <div className="text-xs font-black text-zinc-700 uppercase tracking-widest">¿Cómo viene en el albarán?</div>
          {chips([
            {
              id: 'Directo',
              label: 'Directo (€/kg, €/L, €/ud)',
              onClick: () => setDraft((d) => ({ ...d, pricingMode: 'per_purchase_unit' })),
            },
            {
              id: 'Formato',
              label: 'Botella / lata / caja',
              onClick: () => setDraft((d) => ({ ...d, pricingMode: 'per_pack', unitsInside: d.unitsInside ?? 1 })),
            },
          ])}
          <div className="flex gap-2">
            <button type="button" onClick={back} className="min-h-12 px-4 rounded-xl border border-zinc-200 font-bold">
              Atrás
            </button>
            <button type="button" onClick={next} className="min-h-12 flex-1 px-4 rounded-xl bg-[#36606F] text-white font-black">
              Continuar
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <div className="text-xs font-black text-zinc-700 uppercase tracking-widest">Precio del albarán</div>
          <div className="grid grid-cols-2 gap-2">
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
            <label className="block space-y-1">
              <span className="text-[10px] font-bold uppercase text-zinc-400">Unidad base (recetas)</span>
              <select
                value={draft.baseUnit}
                onChange={(e) => setDraft((d) => ({ ...d, baseUnit: e.target.value as WizardBaseUnit }))}
                className="w-full min-h-12 rounded-xl border border-zinc-200 px-3 text-sm bg-white"
              >
                <option value="kg">kg</option>
                <option value="l">L</option>
                <option value="ud">ud</option>
              </select>
            </label>
          </div>

          {draft.pricingMode === 'per_pack' && (
            <div className="space-y-3">
              <div className="text-xs font-black text-zinc-700 uppercase tracking-widest">Contenido del formato</div>
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
            <button type="button" onClick={back} className="min-h-12 px-4 rounded-xl border border-zinc-200 font-bold">
              Atrás
            </button>
            <button type="button" onClick={next} className="min-h-12 flex-1 px-4 rounded-xl bg-[#36606F] text-white font-black">
              Continuar
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3">
          <div className="text-xs font-black text-zinc-700 uppercase tracking-widest">Resumen</div>
          <div className="rounded-2xl border border-zinc-100 bg-white p-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Coste unitario (auto)</div>
            <div className="text-2xl font-black text-[#36606F] mt-1">
              {unitCost == null ? '—' : `${unitCost.toFixed(4)}€ / ${draft.baseUnit}`}
            </div>
            <div className="text-xs text-zinc-500 mt-2">
              Esto es lo que usará el escandallo al convertir desde recetas (ml/g/ud) a la unidad base.
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={back} className="min-h-12 px-4 rounded-xl border border-zinc-200 font-bold">
              Atrás
            </button>
            <button type="button" onClick={commit} className="min-h-12 flex-1 px-4 rounded-xl bg-emerald-600 text-white font-black">
              Guardar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

