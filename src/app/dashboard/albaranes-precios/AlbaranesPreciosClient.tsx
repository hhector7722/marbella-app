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

type RowState = ProposalLine & {
  selectedIngredientId: string | null
  editedPrice: number
  editedUnit: string
  pricingMode: 'per_purchase_unit' | 'per_pack'
  packUnits: number | null
  packUnitSizeQty: number | null
  packUnitSizeUnit: string
  decision: 'pending' | 'accepted' | 'discarded'
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
    decision: 'pending',
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
    <div className="min-h-screen bg-white pb-24">
      <div className="max-w-4xl mx-auto px-4 pt-6 space-y-6">
        <div className="flex items-start gap-4">
          <Link
            href="/dashboard"
            className={cn(
              'shrink-0 inline-flex items-center justify-center min-h-12 min-w-12 rounded-xl border border-zinc-100 bg-white shadow-sm',
              'text-[#36606F] hover:bg-zinc-50'
            )}
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Precios desde albarán</h1>
            <p className="text-zinc-500 text-sm mt-1">
              Sube una foto del albarán. La IA propone precios y candidatos de ingrediente; tú validas antes de
              guardar.
            </p>
          </div>
        </div>

        <div
          className={cn(
            'rounded-xl border border-zinc-100 bg-white shadow-sm p-6',
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
              <h2 className="text-lg font-semibold text-zinc-900">Líneas propuestas</h2>
              <button
                type="button"
                onClick={applyBatch}
                disabled={applying || acceptedRows.length === 0}
                className={cn(
                  'inline-flex items-center justify-center gap-2 min-h-12 px-5 rounded-xl font-medium',
                  'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 shrink-0'
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
              return (
                <div
                  key={row.lineId}
                  className={cn(
                    'rounded-xl border p-4 space-y-3 shadow-sm',
                    row.decision === 'accepted' && 'border-emerald-200 bg-emerald-50/40',
                    row.decision === 'discarded' && 'opacity-45 border-zinc-100'
                  )}
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">Texto albarán</p>
                      <p className="font-semibold text-zinc-900">{row.extractedName}</p>
                      {row.notas ? <p className="text-xs text-amber-700 mt-1">{row.notas}</p> : null}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateRow(row.lineId, { decision: 'accepted' })}
                        className={cn(
                          'min-h-12 px-4 rounded-xl border text-sm font-medium',
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
                          'min-h-12 px-4 rounded-xl border text-sm font-medium inline-flex items-center gap-1',
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block space-y-1">
                      <span className="text-[10px] font-bold uppercase text-zinc-400">Ingrediente (BD)</span>
                      <select
                        value={row.selectedIngredientId ?? ''}
                        onChange={(e) =>
                          updateRow(row.lineId, {
                            selectedIngredientId: e.target.value || null,
                          })
                        }
                        className="w-full min-h-12 rounded-xl border border-zinc-200 px-3 text-sm bg-white"
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
                      {row.candidates.length === 0 && (
                        <p className="text-xs text-amber-700">Sin coincidencias automáticas; elige manualmente si añades el ingrediente en /ingredients.</p>
                      )}
                    </label>
                    <div className="space-y-2">
                      <label className="block space-y-1">
                        <span className="text-[10px] font-bold uppercase text-zinc-400">Cómo viene el precio</span>
                        <select
                          value={row.pricingMode}
                          onChange={(e) =>
                            updateRow(row.lineId, {
                              pricingMode: e.target.value as RowState['pricingMode'],
                              // Defaults seguros para pack:
                              packUnits: e.target.value === 'per_pack' ? (row.packUnits ?? row.cantidad ?? 1) : null,
                              packUnitSizeQty: e.target.value === 'per_pack' ? (row.packUnitSizeQty ?? 1) : null,
                              packUnitSizeUnit: e.target.value === 'per_pack' ? (row.packUnitSizeUnit ?? 'ud') : 'ud',
                            })
                          }
                          className="w-full min-h-12 rounded-xl border border-zinc-200 px-3 text-sm bg-white"
                        >
                          <option value="per_purchase_unit">Por unidad (€/kg, €/L, €/ud)</option>
                          <option value="per_pack">Por pack / caja (precio total del pack)</option>
                        </select>
                      </label>

                      {row.pricingMode === 'per_pack' && (
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block space-y-1">
                            <span className="text-[10px] font-bold uppercase text-zinc-400">Unidades por pack</span>
                            <input
                              type="number"
                              step="1"
                              value={row.packUnits ?? ''}
                              onChange={(e) =>
                                updateRow(row.lineId, { packUnits: e.target.value === '' ? null : Number(e.target.value) })
                              }
                              className="w-full min-h-12 rounded-xl border border-zinc-200 px-3 text-sm font-mono"
                              placeholder="Ej: 24"
                            />
                          </label>
                          <label className="block space-y-1">
                            <span className="text-[10px] font-bold uppercase text-zinc-400">Tamaño por unidad</span>
                            <input
                              type="number"
                              step="0.001"
                              value={row.packUnitSizeQty ?? ''}
                              onChange={(e) =>
                                updateRow(row.lineId, { packUnitSizeQty: e.target.value === '' ? null : Number(e.target.value) })
                              }
                              className="w-full min-h-12 rounded-xl border border-zinc-200 px-3 text-sm font-mono"
                              placeholder="Ej: 330"
                            />
                          </label>
                          <label className="block space-y-1">
                            <span className="text-[10px] font-bold uppercase text-zinc-400">Unidad tamaño</span>
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
                          <div className="col-span-1" />
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
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
                        <span className="text-[10px] font-bold uppercase text-zinc-400">Unidad precio</span>
                        <select
                          value={row.editedUnit}
                          onChange={(e) => updateRow(row.lineId, { editedUnit: e.target.value })}
                          className="w-full min-h-12 rounded-xl border border-zinc-200 px-3 text-sm bg-white"
                        >
                          {UNIT_OPTIONS.map((u) => (
                            <option key={u} value={u}>
                              € / {u}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 text-xs text-zinc-600 border-t border-zinc-100 pt-2">
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
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
