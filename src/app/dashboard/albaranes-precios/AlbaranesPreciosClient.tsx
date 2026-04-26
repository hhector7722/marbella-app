'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Camera, Check, Loader2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  applyAlbaranPriceUpdatesAction,
  extractAlbaranPricesFromImageAction,
  type ProposalLine,
} from './actions'

const UNIT_OPTIONS = ['kg', 'g', 'l', 'ml', 'cl', 'ud'] as const

type WizardCategory = 'Bebida' | 'Comida' | 'Packaging'
type HowCharged = 'kilo' | 'litro' | 'pack' | 'unidad'

const PACK_UNITS_PRESETS = [6, 12, 24, 48, 72, 96] as const
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

function primaryBaseUnit(cat: WizardCategory): 'kg' | 'l' | 'ud' {
  if (cat === 'Bebida') return 'l'
  if (cat === 'Packaging') return 'ud'
  return 'kg'
}

type RowState = ProposalLine & {
  selectedIngredientId: string | null
  editedPrice: number
  editedUnit: string
  pricingMode: 'per_purchase_unit' | 'per_pack'
  packUnits: number | null
  packUnitSizeQty: number | null
  packUnitSizeUnit: string
  showExpert: boolean
  decision: 'pending' | 'accepted' | 'discarded'
  /** 1=ingrediente, 2=qué es, 3=cómo cobra, 4=precio */
  wizardStep: 1 | 2 | 3 | 4
  wizardCategory: WizardCategory | null
  howCharged: HowCharged | null
}

function lineToRowState(p: ProposalLine): RowState {
  const selected =
    p.suggestedIngredientId ?? p.candidates[0]?.id ?? null
  return {
    ...p,
    selectedIngredientId: selected,
    editedPrice: p.proposedPrice,
    editedUnit: p.proposedUnit,
    pricingMode: 'per_purchase_unit',
    packUnits: null,
    packUnitSizeQty: null,
    packUnitSizeUnit: 'ud',
    showExpert: false,
    decision: 'pending',
    wizardStep: selected ? 2 : 1,
    wizardCategory: null,
    howCharged: null,
  }
}

function applyHowCharged(
  cat: WizardCategory | null,
  h: HowCharged,
  cantidad: number | null
): Pick<
  RowState,
  'pricingMode' | 'editedUnit' | 'packUnits' | 'packUnitSizeQty' | 'packUnitSizeUnit' | 'howCharged'
> {
  const c = cat ?? 'Comida'
  if (h === 'kilo') {
    return {
      howCharged: h,
      pricingMode: 'per_purchase_unit',
      editedUnit: 'kg',
      packUnits: null,
      packUnitSizeQty: null,
      packUnitSizeUnit: 'ud',
    }
  }
  if (h === 'litro') {
    return {
      howCharged: h,
      pricingMode: 'per_purchase_unit',
      editedUnit: 'l',
      packUnits: null,
      packUnitSizeQty: null,
      packUnitSizeUnit: 'ud',
    }
  }
  if (h === 'unidad') {
    return {
      howCharged: h,
      pricingMode: 'per_purchase_unit',
      editedUnit: 'ud',
      packUnits: null,
      packUnitSizeQty: null,
      packUnitSizeUnit: 'ud',
    }
  }
  const base = primaryBaseUnit(c)
  return {
    howCharged: h,
    pricingMode: 'per_pack',
    editedUnit: base,
    packUnits: cantidad != null && cantidad > 0 ? cantidad : 1,
    packUnitSizeQty: c === 'Bebida' ? 330 : 1,
    packUnitSizeUnit: c === 'Bebida' ? 'ml' : 'ud',
  }
}

type IngredientOption = { id: string; name: string; current_price: number; purchase_unit: string }

export default function AlbaranesPreciosClient({
  allIngredients,
}: {
  allIngredients: IngredientOption[]
}) {
  const [rows, setRows] = useState<RowState[]>([])
  const [extracting, setExtracting] = useState(false)
  const [applying, setApplying] = useState(false)
  /** Mensaje visible siempre bajo el botón (complemento a sonner). */
  const [statusLine, setStatusLine] = useState<string | null>(null)

  const acceptedRows = useMemo(() => rows.filter((r) => r.decision === 'accepted'), [rows])

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setExtracting(true)
    setRows([])
    setStatusLine('Enviando imagen al servidor…')
    try {
      const fd = new FormData()
      fd.set('file', file)
      const res = await extractAlbaranPricesFromImageAction(fd)
      if (!res.success) {
        setStatusLine(res.message)
        toast.error(res.message)
        return
      }
      setRows(res.lines.map(lineToRowState))
      const okMsg = `Se interpretaron ${res.lines.length} líneas. Revisa y marca las que quieras aplicar.`
      setStatusLine(okMsg)
      toast.success(okMsg)
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Error al procesar la imagen (¿archivo muy grande? Redimensiona o sube otra).'
      setStatusLine(msg)
      toast.error(msg)
    } finally {
      setExtracting(false)
      e.target.value = ''
    }
  }

  function updateRow(lineId: string, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r) => (r.lineId === lineId ? { ...r, ...patch } : r)))
  }

  function baselineRow(row: RowState): { current_price: number; purchase_unit: string } | null {
    const sid = row.selectedIngredientId
    if (!sid) return null
    const fromCand = row.candidates.find((c) => c.id === sid)
    if (fromCand) return { current_price: fromCand.current_price, purchase_unit: fromCand.purchase_unit }
    const fromAll = allIngredients.find((i) => i.id === sid)
    if (fromAll) {
      return {
        current_price: Number(fromAll.current_price) || 0,
        purchase_unit: fromAll.purchase_unit ?? 'kg',
      }
    }
    return null
  }

  async function applyBatch() {
    const payload = acceptedRows
      .filter((r) => r.selectedIngredientId)
      .map((r) => ({
        ingredientId: r.selectedIngredientId!,
        pricingMode: r.pricingMode,
        // En per_purchase_unit, esto es current_price. En per_pack, es pack_price.
        price: r.editedPrice,
        purchaseUnit: r.editedUnit,
        packUnits: r.pricingMode === 'per_pack' ? r.packUnits : null,
        packUnitSizeQty: r.pricingMode === 'per_pack' ? r.packUnitSizeQty : null,
        packUnitSizeUnit: r.pricingMode === 'per_pack' ? r.packUnitSizeUnit : null,
      }))
    if (payload.length === 0) {
      toast.error('Marca al menos una línea como aceptada con ingrediente seleccionado')
      return
    }
    setApplying(true)
    try {
      const res = await applyAlbaranPriceUpdatesAction(payload)
      if (!res.success) {
        toast.error(res.message)
        if (res.errors?.length) toast.error(res.errors.slice(0, 3).join(' · '))
        return
      }
      toast.success(res.message)
      setRows((prev) => prev.filter((r) => r.decision !== 'accepted'))
    } catch {
      toast.error('Error al guardar')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="min-h-screen w-full bg-[#5F7F99] pb-24">
      <div className="max-w-4xl mx-auto px-4 md:px-6 pt-6 space-y-6">
        <div className="bg-[#36606F] rounded-2xl px-4 md:px-6 py-4 md:py-5 shadow-sm">
          <div className="flex items-start gap-4">
            <Link
              href="/dashboard"
              className={cn(
                'shrink-0 inline-flex items-center justify-center min-h-12 min-w-12 rounded-xl border border-white/20 bg-white/10 shadow-sm',
                'text-white hover:bg-white/20'
              )}
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-white uppercase tracking-widest">
                Precios desde albarán
              </h1>
              <p className="text-white/85 text-sm mt-1">
                Sube una foto del albarán. La IA propone líneas; confirma ingrediente y precio con el mismo
                asistente que en Ingredientes.
              </p>
            </div>
          </div>
        </div>

        <div
          className={cn(
            'rounded-2xl border border-zinc-100 bg-white shadow-sm p-6',
            'flex flex-col items-center justify-center gap-4 min-h-[160px]'
          )}
        >
          <div className="w-14 h-14 rounded-full bg-zinc-50 flex items-center justify-center">
            <Camera className="w-7 h-7 text-zinc-400" />
          </div>
          <div className="text-center space-y-1">
            <p className="font-semibold text-zinc-800">Imagen (JPG, PNG, WebP)</p>
            <p className="text-xs text-zinc-500">Máximo 10 MB</p>
          </div>
          <label
            className={cn(
              'inline-flex items-center justify-center gap-2 min-h-12 px-6 rounded-xl font-medium cursor-pointer',
              'bg-[#36606F] text-white hover:bg-[#2A4C58] shadow-sm shrink-0',
              extracting && 'opacity-60 pointer-events-none'
            )}
          >
            {extracting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
            {extracting ? 'Interpretando…' : 'Seleccionar imagen'}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onFile} />
          </label>
          {statusLine ? (
            <p
              className={cn(
                'text-sm text-center max-w-md',
                statusLine.includes('interpretaron') ? 'text-emerald-800' : 'text-zinc-700'
              )}
            >
              {statusLine}
            </p>
          ) : null}
        </div>

        {rows.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-black text-white uppercase tracking-widest">Líneas propuestas</h2>
              <button
                type="button"
                onClick={applyBatch}
                disabled={applying || acceptedRows.length === 0}
                className={cn(
                  'inline-flex items-center justify-center gap-2 min-h-12 px-5 rounded-xl font-black text-sm',
                  'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 shrink-0 shadow-sm'
                )}
              >
                {applying ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                Aplicar aceptadas ({acceptedRows.length})
              </button>
            </div>

            {rows.map((row) => {
              const cand = baselineRow(row)
              const oldP = cand?.current_price ?? 0
              const diff =
                cand && row.editedPrice !== oldP ? (row.editedPrice - oldP).toFixed(2) : ''
              const cat = row.wizardCategory
              const presets = cat === 'Bebida' ? VOLUME_PRESETS : MASS_PRESETS
              const linkedName =
                row.selectedIngredientId &&
                (row.candidates.find((c) => c.id === row.selectedIngredientId)?.name ??
                  allIngredients.find((i) => i.id === row.selectedIngredientId)?.name)
              return (
                <div
                  key={row.lineId}
                  className={cn(
                    'rounded-2xl border border-zinc-100 bg-white shadow-sm p-4 space-y-4',
                    row.decision === 'accepted' && 'border-emerald-200 ring-2 ring-emerald-100',
                    row.decision === 'discarded' && 'opacity-45 border-zinc-100'
                  )}
                >
                  <div className="flex flex-wrap justify-between gap-2 gap-y-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Texto albarán</p>
                      <p className="font-black text-zinc-900">{row.extractedName}</p>
                      {row.wizardStep >= 2 && linkedName ? (
                        <p className="text-xs font-bold text-[#36606F] mt-1">Ingrediente: {linkedName}</p>
                      ) : null}
                      {row.notas ? <p className="text-xs text-amber-800 mt-1">{row.notas}</p> : null}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateRow(row.lineId, { decision: 'accepted' })}
                        className={cn(
                          'min-h-12 px-4 rounded-xl border text-sm font-black',
                          row.decision === 'accepted'
                            ? 'border-emerald-500 bg-emerald-100 text-emerald-900'
                            : 'border-zinc-200 bg-white hover:bg-zinc-50'
                        )}
                      >
                        Aceptar
                      </button>
                      <button
                        type="button"
                        onClick={() => updateRow(row.lineId, { decision: 'discarded' })}
                        className={cn(
                          'min-h-12 px-4 rounded-xl border text-sm font-black inline-flex items-center gap-1',
                          row.decision === 'discarded'
                            ? 'border-red-200 bg-red-50 text-red-800'
                            : 'border-zinc-200 bg-white hover:bg-zinc-50'
                        )}
                      >
                        <X className="w-4 h-4" />
                        Descartar
                      </button>
                    </div>
                  </div>

                  {/* Paso 1 — Ingrediente (como enlace al producto de BD) */}
                  {row.wizardStep === 1 && (
                    <div className="space-y-3">
                      <label className="block space-y-1">
                        <span className="text-xs font-black uppercase tracking-widest text-zinc-700">Ingrediente</span>
                        <select
                          value={row.selectedIngredientId ?? ''}
                          onChange={(e) =>
                            updateRow(row.lineId, {
                              selectedIngredientId: e.target.value || null,
                            })
                          }
                          className="w-full min-h-12 rounded-xl border border-zinc-200 px-3 text-sm font-bold bg-white"
                        >
                          <option value="">— Elegir —</option>
                          {row.candidates.length > 0 && (
                            <optgroup label="Sugerencias">
                              {row.candidates.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name} ({c.score.toFixed(0)}%)
                                </option>
                              ))}
                            </optgroup>
                          )}
                          <optgroup label="Todos los ingredientes">
                            {allIngredients
                              .filter((i) => !row.candidates.some((c) => c.id === i.id))
                              .map((i) => (
                                <option key={i.id} value={i.id}>
                                  {i.name}
                                </option>
                              ))}
                          </optgroup>
                        </select>
                      </label>
                      {row.candidates.length === 0 && (
                        <p className="text-xs text-amber-800">
                          Sin coincidencias automáticas; elige manualmente o crea el ingrediente en /ingredients.
                        </p>
                      )}
                      <button
                        type="button"
                        disabled={!row.selectedIngredientId}
                        onClick={() => updateRow(row.lineId, { wizardStep: 2 })}
                        className="w-full min-h-12 rounded-xl bg-[#36606F] text-white font-black disabled:opacity-40"
                      >
                        Continuar
                      </button>
                    </div>
                  )}

                  {/* Paso 2 — ¿Qué es? (misma dinámica que Ingredientes: chip → avanza) */}
                  {row.wizardStep === 2 && (
                    <div className="space-y-3">
                      <div className="text-xs font-black text-zinc-700 uppercase tracking-widest">¿Qué es?</div>
                      <div className="grid grid-cols-2 gap-2">
                        {(['Bebida', 'Comida', 'Packaging'] as const).map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() =>
                              updateRow(row.lineId, {
                                wizardCategory: c,
                                wizardStep: 3,
                              })
                            }
                            className={cn(
                              'min-h-12 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-black',
                              c === 'Packaging' && 'col-span-2'
                            )}
                          >
                            {c === 'Packaging' ? 'Packaging' : c}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => updateRow(row.lineId, { wizardStep: 1 })}
                        className="min-h-12 w-full rounded-xl border border-zinc-200 font-bold"
                      >
                        Atrás
                      </button>
                    </div>
                  )}

                  {/* Paso 3 — ¿Cómo lo cobra el proveedor? */}
                  {row.wizardStep === 3 && (
                    <div className="space-y-3">
                      <div className="text-xs font-black text-zinc-700 uppercase tracking-widest">
                        ¿Cómo lo cobra el proveedor?
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {(['kilo', 'litro', 'pack', 'unidad'] as const).map((h) => (
                          <button
                            key={h}
                            type="button"
                            onClick={() => {
                              const wc = row.wizardCategory
                              if (!wc) return
                              updateRow(row.lineId, {
                                ...applyHowCharged(wc, h, row.cantidad),
                                wizardStep: 4,
                              })
                            }}
                            className="min-h-12 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-black"
                          >
                            {h === 'kilo'
                              ? 'Por kilo'
                              : h === 'litro'
                                ? 'Por litro'
                                : h === 'pack'
                                  ? 'Por pack'
                                  : 'Por unidad'}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => updateRow(row.lineId, { wizardStep: 2 })}
                        className="min-h-12 w-full rounded-xl border border-zinc-200 font-bold"
                      >
                        Atrás
                      </button>
                    </div>
                  )}

                  {/* Paso 4 — Precio (y pack si aplica) */}
                  {row.wizardStep === 4 && row.wizardCategory && row.howCharged && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-black text-zinc-700 uppercase tracking-widest">Precio</div>
                        <button
                          type="button"
                          onClick={() => updateRow(row.lineId, { showExpert: !row.showExpert })}
                          className="text-[10px] font-black uppercase tracking-widest text-[#36606F] hover:underline shrink-0"
                        >
                          {row.showExpert ? 'Ocultar experto' : 'Edición experta'}
                        </button>
                      </div>

                      {row.showExpert ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <label className="block space-y-1">
                            <span className="text-[10px] font-bold uppercase text-zinc-400">Modo precio</span>
                            <select
                              value={row.pricingMode}
                              onChange={(e) =>
                                updateRow(row.lineId, {
                                  pricingMode: e.target.value as RowState['pricingMode'],
                                  packUnits:
                                    e.target.value === 'per_pack' ? (row.packUnits ?? row.cantidad ?? 1) : null,
                                  packUnitSizeQty:
                                    e.target.value === 'per_pack' ? (row.packUnitSizeQty ?? 1) : null,
                                  packUnitSizeUnit:
                                    e.target.value === 'per_pack' ? (row.packUnitSizeUnit ?? 'ud') : 'ud',
                                })
                              }
                              className="w-full min-h-12 rounded-xl border border-zinc-200 px-3 text-sm bg-white font-bold"
                            >
                              <option value="per_purchase_unit">Por unidad base (€/kg, €/L, €/ud)</option>
                              <option value="per_pack">Por pack / caja</option>
                            </select>
                          </label>
                          <div />
                          <label className="block space-y-1">
                            <span className="text-[10px] font-bold uppercase text-zinc-400">Precio €</span>
                            <input
                              type="number"
                              step="0.0001"
                              value={row.editedPrice}
                              onChange={(e) =>
                                updateRow(row.lineId, { editedPrice: parseFloat(e.target.value) || 0 })
                              }
                              className="w-full min-h-12 rounded-xl border border-zinc-200 px-3 text-sm font-mono"
                            />
                          </label>
                          <label className="block space-y-1">
                            <span className="text-[10px] font-bold uppercase text-zinc-400">Unidad base</span>
                            <select
                              value={row.editedUnit}
                              onChange={(e) => updateRow(row.lineId, { editedUnit: e.target.value })}
                              className="w-full min-h-12 rounded-xl border border-zinc-200 px-3 text-sm bg-white font-bold"
                            >
                              {UNIT_OPTIONS.map((u) => (
                                <option key={u} value={u}>
                                  {u}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      ) : (
                        <label className="block space-y-1">
                          <span className="text-[10px] font-bold uppercase text-zinc-400">
                            {row.pricingMode === 'per_pack' ? 'Precio del pack (€)' : 'Precio (€)'}
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            value={row.editedPrice || ''}
                            onChange={(e) =>
                              updateRow(row.lineId, { editedPrice: parseFloat(e.target.value) || 0 })
                            }
                            className="w-full min-h-12 rounded-xl border border-zinc-200 px-3 text-sm font-mono font-bold"
                          />
                        </label>
                      )}

                      {row.pricingMode === 'per_pack' && !row.showExpert && (
                        <div className="space-y-3">
                          <div className="text-xs font-black text-zinc-700 uppercase tracking-widest">
                            Contenido del pack
                          </div>
                          <label className="block space-y-1">
                            <span className="text-[10px] font-bold uppercase text-zinc-400">Unidades dentro</span>
                            <div className="grid grid-cols-3 gap-2">
                              {PACK_UNITS_PRESETS.map((n) => (
                                <button
                                  key={n}
                                  type="button"
                                  onClick={() => updateRow(row.lineId, { packUnits: n })}
                                  className={cn(
                                    'min-h-12 rounded-xl border px-2 text-sm font-black',
                                    row.packUnits === n
                                      ? 'border-[#36606F] bg-[#36606F]/5 text-[#36606F]'
                                      : 'border-zinc-200 bg-white hover:bg-zinc-50'
                                  )}
                                >
                                  {n}
                                </button>
                              ))}
                              <input
                                type="number"
                                step="1"
                                value={row.packUnits ?? ''}
                                onChange={(e) =>
                                  updateRow(row.lineId, {
                                    packUnits: e.target.value === '' ? null : Number(e.target.value),
                                  })
                                }
                                className="min-h-12 rounded-xl border border-zinc-200 px-3 text-sm font-mono"
                                placeholder="Otro"
                              />
                            </div>
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="block space-y-1">
                              <span className="text-[10px] font-bold uppercase text-zinc-400">Contenido por unidad</span>
                              <input
                                type="number"
                                step="0.001"
                                value={row.packUnitSizeQty ?? ''}
                                onChange={(e) =>
                                  updateRow(row.lineId, {
                                    packUnitSizeQty: e.target.value === '' ? null : Number(e.target.value),
                                  })
                                }
                                className="w-full min-h-12 rounded-xl border border-zinc-200 px-3 text-sm font-mono"
                              />
                            </label>
                            <label className="block space-y-1">
                              <span className="text-[10px] font-bold uppercase text-zinc-400">Unidad contenido</span>
                              <select
                                value={row.packUnitSizeUnit}
                                onChange={(e) => updateRow(row.lineId, { packUnitSizeUnit: e.target.value })}
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
                          <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                            <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Atajos</div>
                            <div className="grid grid-cols-2 gap-2 mt-2">
                              {presets.slice(0, 6).map((p) => (
                                <button
                                  key={`${p.qty}-${p.unit}`}
                                  type="button"
                                  onClick={() =>
                                    updateRow(row.lineId, {
                                      packUnitSizeQty: p.qty,
                                      packUnitSizeUnit: p.unit,
                                    })
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

                      <button
                        type="button"
                        onClick={() => updateRow(row.lineId, { wizardStep: 3 })}
                        className="min-h-12 w-full rounded-xl border border-zinc-200 font-bold"
                      >
                        Atrás
                      </button>

                      <div className="flex flex-wrap gap-4 text-xs text-zinc-600 border-t border-zinc-100 pt-3">
                        <span>
                          IA: {row.precioUnidadRaw} € / {row.unidadRaw || '—'}
                        </span>
                        {cand && (
                          <>
                            <span>
                              Actual en BD: {oldP.toFixed(4)} € / {cand.purchase_unit}
                            </span>
                            {diff !== '' && (
                              <span className={Number(diff) > 0 ? 'text-amber-700' : 'text-emerald-700'}>
                                Δ {diff} €
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
