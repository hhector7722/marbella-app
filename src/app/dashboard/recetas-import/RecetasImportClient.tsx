'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  BookOpen,
  Check,
  FileImage,
  FileText,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  applyValidatedRecipesAction,
  extractRecipesFromDocumentAction,
  type ExtractedIngredientLine,
  type ExtractedRecipeProposal,
  type ValidatedRecipePayload,
} from './actions'

type IngredientOption = { id: string; name: string }

type RowState = ExtractedRecipeProposal & {
  decision: 'pending' | 'accepted' | 'discarded'
  has_half_ration: boolean
}

function toRowState(r: ExtractedRecipeProposal): RowState {
  return {
    ...r,
    decision: 'pending',
    has_half_ration: false,
  }
}

export default function RecetasImportClient({ allIngredients }: { allIngredients: IngredientOption[] }) {
  const nameToId = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of allIngredients) {
      m.set(i.name.toLowerCase().trim(), i.id)
    }
    return m
  }, [allIngredients])

  const [rows, setRows] = useState<RowState[]>([])
  const [extracting, setExtracting] = useState(false)
  const [applying, setApplying] = useState(false)
  const [statusLine, setStatusLine] = useState<string | null>(null)

  const accepted = useMemo(() => rows.filter((r) => r.decision === 'accepted'), [rows])

  function updateRow(proposalId: string, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r) => (r.proposalId === proposalId ? { ...r, ...patch } : r)))
  }

  function updateIngredient(proposalId: string, index: number, patch: Partial<ExtractedIngredientLine>) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.proposalId !== proposalId) return r
        const next = [...r.ingredientes]
        next[index] = { ...next[index]!, ...patch }
        return { ...r, ingredientes: next }
      })
    )
  }

  function addIngredient(proposalId: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.proposalId === proposalId
          ? { ...r, ingredientes: [...r.ingredientes, { nombre: '', cantidad: 1, unidad: 'kg' }] }
          : r
      )
    )
  }

  function removeIngredient(proposalId: string, index: number) {
    setRows((prev) =>
      prev.map((r) =>
        r.proposalId === proposalId
          ? { ...r, ingredientes: r.ingredientes.filter((_, i) => i !== index) }
          : r
      )
    )
  }

  function missingForRow(r: RowState): string[] {
    const miss: string[] = []
    for (const line of r.ingredientes) {
      const n = line.nombre.trim()
      if (!n) continue
      if (!nameToId.has(n.toLowerCase())) miss.push(n)
    }
    return [...new Set(miss)]
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setExtracting(true)
    setRows([])
    setStatusLine('Leyendo documento con IA…')
    try {
      const fd = new FormData()
      fd.set('file', file)
      const res = await extractRecipesFromDocumentAction(fd)
      if (!res.success) {
        setStatusLine(res.message)
        toast.error(res.message)
        return
      }
      setRows(res.recipes.map(toRowState))
      const msg = `Se propusieron ${res.recipes.length} receta(s). Revisa y acepta las que quieras guardar.`
      setStatusLine(msg)
      toast.success(msg)
    } catch (err) {
      const m =
        err instanceof Error ? err.message : 'Error al procesar el archivo. Prueba un PDF o imagen más pequeña.'
      setStatusLine(m)
      toast.error(m)
    } finally {
      setExtracting(false)
      e.target.value = ''
    }
  }

  async function runImport() {
    const payload: ValidatedRecipePayload[] = accepted.map((r) => ({
      nombre: r.nombre.trim(),
      categoria: r.categoria.trim() || 'Principales',
      sale_price: r.precio_barra,
      sales_price_pavello: r.precio_pavello,
      servings: r.raciones,
      elaboration: r.elaboracion,
      presentation: r.presentacion,
      has_half_ration: r.has_half_ration,
      ingredientes: r.ingredientes.filter((i) => i.nombre.trim() !== ''),
    }))

    if (payload.length === 0) {
      toast.error('Marca al menos una receta como aceptada')
      return
    }

    setApplying(true)
    setStatusLine('Guardando en base de datos…')
    try {
      const res = await applyValidatedRecipesAction(payload)
      if (!res.success) {
        toast.error(res.message)
        if (res.errors?.length) {
          res.errors.slice(0, 8).forEach((e) => toast.error(e))
        }
        setStatusLine(res.message)
        return
      }
      toast.success(res.message)
      if (res.errors?.length) {
        res.errors.forEach((e) => toast.message(e, { duration: 6000 }))
      }
      setRows((prev) => prev.filter((r) => r.decision !== 'accepted'))
      setStatusLine(res.message + (res.errors?.length ? ' (revisa avisos en toasts)' : ''))
    } catch {
      toast.error('Error al guardar')
      setStatusLine('Error al guardar')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="min-h-screen bg-white pb-24">
      <div className="max-w-4xl mx-auto px-4 pt-6 space-y-6">
        <div className="flex items-start gap-4">
          <Link
            href="/dashboard/import"
            className={cn(
              'shrink-0 inline-flex items-center justify-center min-h-12 min-w-12 rounded-xl border border-zinc-100 bg-white shadow-sm',
              'text-[#36606F] hover:bg-zinc-50'
            )}
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Importar recetas (IA + validación)</h1>
            <p className="text-zinc-500 text-sm mt-1">
              Sube un PDF o una foto de fichas de recetas. La IA extrae ingredientes, elaboración y presentación; tú
              revisas antes de guardar. Los nombres de ingrediente deben coincidir con la base de datos.
            </p>
          </div>
        </div>

        <div
          className={cn(
            'rounded-xl border border-zinc-100 bg-white shadow-sm p-6',
            'flex flex-col items-center justify-center gap-4 min-h-[140px]'
          )}
        >
          <div className="flex gap-3 text-zinc-400">
            <FileText className="w-8 h-8" />
            <FileImage className="w-8 h-8" />
          </div>
          <p className="text-sm text-zinc-600 text-center">
            PDF o imagen (JPG, PNG, WebP) · máx. 12 MB · requiere <code className="text-xs bg-zinc-100 px-1 rounded">GEMINI_API_KEY</code>
          </p>
          <label
            className={cn(
              'inline-flex items-center justify-center gap-2 min-h-12 px-6 rounded-xl font-medium cursor-pointer',
              'bg-[#36606F] text-white hover:bg-[#2A4C58] shadow-sm shrink-0',
              extracting && 'opacity-60 pointer-events-none'
            )}
          >
            {extracting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
            {extracting ? 'Extrayendo…' : 'Elegir PDF o imagen'}
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={onFile}
            />
          </label>
          {statusLine ? <p className="text-sm text-center text-zinc-700 max-w-lg">{statusLine}</p> : null}
        </div>

        {rows.length > 0 && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-zinc-900 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-[#36606F]" />
                Propuestas
              </h2>
              <button
                type="button"
                onClick={runImport}
                disabled={applying || accepted.length === 0}
                className={cn(
                  'inline-flex items-center justify-center gap-2 min-h-12 px-5 rounded-xl font-medium',
                  'bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 shrink-0'
                )}
              >
                {applying ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                Importar aceptadas ({accepted.length})
              </button>
            </div>

            {rows.map((r) => {
              const missing = missingForRow(r)
              return (
                <div
                  key={r.proposalId}
                  className={cn(
                    'rounded-xl border p-4 space-y-4 shadow-sm',
                    r.decision === 'accepted' && 'border-emerald-200 bg-emerald-50/30',
                    r.decision === 'discarded' && 'opacity-40 border-zinc-100'
                  )}
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="text-xs font-bold uppercase text-zinc-400">Receta</span>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => updateRow(r.proposalId, { decision: 'accepted' })}
                        className={cn(
                          'min-h-12 px-4 rounded-xl border text-sm font-medium',
                          r.decision === 'accepted'
                            ? 'border-emerald-500 bg-emerald-100 text-emerald-900'
                            : 'border-zinc-200 bg-white'
                        )}
                      >
                        Aceptar
                      </button>
                      <button
                        type="button"
                        onClick={() => updateRow(r.proposalId, { decision: 'discarded' })}
                        className={cn(
                          'min-h-12 px-4 rounded-xl border text-sm font-medium',
                          r.decision === 'discarded' ? 'border-red-200 bg-red-50' : 'border-zinc-200 bg-white'
                        )}
                      >
                        Descartar
                      </button>
                    </div>
                  </div>

                  <input
                    value={r.nombre}
                    onChange={(e) => updateRow(r.proposalId, { nombre: e.target.value })}
                    className="w-full min-h-12 rounded-xl border border-zinc-200 px-3 text-base font-semibold"
                    placeholder="Nombre del plato"
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="space-y-1 block">
                      <span className="text-[10px] font-bold uppercase text-zinc-400">Categoría</span>
                      <input
                        value={r.categoria}
                        onChange={(e) => updateRow(r.proposalId, { categoria: e.target.value })}
                        className="w-full min-h-12 rounded-xl border border-zinc-200 px-3 text-sm"
                      />
                    </label>
                    <label className="space-y-1 block">
                      <span className="text-[10px] font-bold uppercase text-zinc-400">Raciones</span>
                      <input
                        type="number"
                        min={1}
                        value={r.raciones}
                        onChange={(e) =>
                          updateRow(r.proposalId, { raciones: Math.max(1, parseInt(e.target.value, 10) || 1) })
                        }
                        className="w-full min-h-12 rounded-xl border border-zinc-200 px-3 text-sm"
                      />
                    </label>
                    <label className="space-y-1 block">
                      <span className="text-[10px] font-bold uppercase text-zinc-400">Precio barra (€)</span>
                      <input
                        type="number"
                        step="0.01"
                        value={r.precio_barra}
                        onChange={(e) =>
                          updateRow(r.proposalId, { precio_barra: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full min-h-12 rounded-xl border border-zinc-200 px-3 text-sm"
                      />
                    </label>
                    <label className="space-y-1 block">
                      <span className="text-[10px] font-bold uppercase text-zinc-400">Precio Pavelló (€)</span>
                      <input
                        type="number"
                        step="0.01"
                        value={r.precio_pavello}
                        onChange={(e) =>
                          updateRow(r.proposalId, { precio_pavello: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full min-h-12 rounded-xl border border-zinc-200 px-3 text-sm"
                      />
                    </label>
                  </div>

                  <label className="flex items-center gap-2 min-h-12 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={r.has_half_ration}
                      onChange={(e) => updateRow(r.proposalId, { has_half_ration: e.target.checked })}
                      className="h-5 w-5 rounded border-zinc-300"
                    />
                    <span className="text-sm text-zinc-700">Tiene media ración (información; precios ½ se editan en la ficha)</span>
                  </label>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="space-y-1 block">
                      <span className="text-[10px] font-bold uppercase text-zinc-400">Elaboración</span>
                      <textarea
                        value={r.elaboracion}
                        onChange={(e) => updateRow(r.proposalId, { elaboracion: e.target.value })}
                        rows={6}
                        className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm min-h-[120px]"
                        placeholder="Pasos de elaboración (uno por línea)"
                      />
                    </label>
                    <label className="space-y-1 block">
                      <span className="text-[10px] font-bold uppercase text-zinc-400">Presentación</span>
                      <textarea
                        value={r.presentacion}
                        onChange={(e) => updateRow(r.proposalId, { presentacion: e.target.value })}
                        rows={6}
                        className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm min-h-[120px]"
                        placeholder="Emplatado y presentación"
                      />
                    </label>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase text-zinc-400">Ingredientes (nombre = BD)</span>
                      <button
                        type="button"
                        onClick={() => addIngredient(r.proposalId)}
                        className="inline-flex items-center gap-1 min-h-10 px-3 rounded-lg text-sm border border-zinc-200 bg-white"
                      >
                        <Plus className="w-4 h-4" /> Añadir línea
                      </button>
                    </div>
                    {missing.length > 0 && (
                      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1">
                        Sin coincidencia en BD: {missing.join(', ')}
                      </p>
                    )}
                    <div className="space-y-2">
                      {r.ingredientes.map((line, idx) => (
                        <div key={idx} className="flex flex-wrap gap-2 items-end">
                          <input
                            value={line.nombre}
                            onChange={(e) => updateIngredient(r.proposalId, idx, { nombre: e.target.value })}
                            className="flex-1 min-w-[140px] min-h-12 rounded-xl border border-zinc-200 px-2 text-sm"
                            placeholder="Nombre ingrediente"
                          />
                          <input
                            type="number"
                            step="0.001"
                            value={line.cantidad}
                            onChange={(e) =>
                              updateIngredient(r.proposalId, idx, {
                                cantidad: parseFloat(e.target.value) || 0,
                              })
                            }
                            className="w-24 min-h-12 rounded-xl border border-zinc-200 px-2 text-sm"
                          />
                          <input
                            value={line.unidad}
                            onChange={(e) => updateIngredient(r.proposalId, idx, { unidad: e.target.value })}
                            className="w-20 min-h-12 rounded-xl border border-zinc-200 px-2 text-sm"
                            placeholder="kg"
                          />
                          <button
                            type="button"
                            onClick={() => removeIngredient(r.proposalId, idx)}
                            className="min-h-12 min-w-12 inline-flex items-center justify-center rounded-xl border border-zinc-200 text-zinc-500"
                            aria-label="Quitar línea"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
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
