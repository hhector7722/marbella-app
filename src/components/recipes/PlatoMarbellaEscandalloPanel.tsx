'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { PLATO_MARBELLA_SLOTS, platoMarbellaSlotsForLang } from '@/lib/carta-plato-marbella'
import { recipeCostV2StatusLabel } from '@/lib/recipe-elaboration'
import {
  buildPlatoMarbellaEscandallo,
  type MarbellaEscandallo,
  type PlatoMarbellaCostRow,
  type RecipeCostPayload,
} from '@/lib/plato-marbella-escandallo'

const money = (amount: number | null): string =>
  amount === null || !Number.isFinite(amount)
    ? '—'
    : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount)

function issueLabel(problem: string): string {
  const [status, ...detail] = problem.split(': ')
  const name = recipeCostV2StatusLabel(status)
  return (name === status ? status : name) + (detail.length ? ': ' + detail.join(': ') : '')
}

type Props = {
  recipeId: string
  /** El resto de indicadores de Precio usan el máximo solo cuando el escandallo es completo. */
  onResolved: (recipeId: string, isPlatoMarbella: boolean, maximum: number | null) => void
}

/**
 * Escandallo virtual: lee las mismas opciones visibles de la carta, sin crear una receta por combinación.
 * No modifica el mapeo TPV ni los movimientos de inventario.
 */
export function PlatoMarbellaEscandalloPanel({ recipeId, onResolved }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<MarbellaEscandallo | null>(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true

    const load = async () => {
      const { data: launchers, error: lookupError } = await supabase
        .from('v_digital_menu_items')
        .select('articulo_id')
        .eq('recipe_id', recipeId)
        .eq('plato_marbella_is_menu_price', true)
        .limit(1)

      if (!active) return
      if (lookupError) {
        setVisible(false)
        onResolved(recipeId, false, null)
        return
      }
      if (!launchers?.length) {
        setVisible(false)
        onResolved(recipeId, false, null)
        return
      }

      setVisible(true)
      setLoading(true)
      setError(null)
      try {
        const { data, error: menuError } = await supabase
          .from('v_digital_menu_items')
          .select('articulo_id, carta_nombre, recipe_name, recipe_id, precio, plato_marbella_slot, plato_marbella_is_menu_price, tpv_factor_porcion, sort_order')
          .or('plato_marbella_slot.not.is.null,plato_marbella_is_menu_price.eq.true')
          .limit(500)
        if (menuError) throw menuError

        // La vista ya excluye is_hidden=true: exactamente las opciones ofrecidas en carta.
        const rows = (data ?? []) as PlatoMarbellaCostRow[]
        const uniqueIds = [...new Set(rows.filter((row) =>
          !row.plato_marbella_is_menu_price && row.recipe_id && row.plato_marbella_slot
        ).map((row) => row.recipe_id as string))]
        const costs = new Map<string, RecipeCostPayload | null>()

        // Límite de concurrencia para no disparar una RPC por combinación (solo por receta).
        for (let i = 0; i < uniqueIds.length; i += 4) {
          const ids = uniqueIds.slice(i, i + 4)
          await Promise.all(ids.map(async (id) => {
            const { data: payload, error: costError } = await supabase.rpc('get_recipe_cost_v2', { p_recipe_id: id })
            costs.set(id, !costError && payload && typeof payload === 'object' && !Array.isArray(payload)
              ? payload as RecipeCostPayload
              : null)
          }))
        }

        const { data: basePayload, error: baseError } = await supabase.rpc(
          'get_recipe_cost_v2', { p_recipe_id: recipeId }
        )
        const fixedCost = !baseError && basePayload && typeof basePayload === 'object' && !Array.isArray(basePayload)
          ? basePayload as RecipeCostPayload
          : null
        const next = buildPlatoMarbellaEscandallo(rows, costs, fixedCost)
        if (!active) return
        setReport(next)
        onResolved(recipeId, true, next.maximum)
      } catch (cause) {
        if (!active) return
        setReport(null)
        setError(cause instanceof Error ? cause.message : 'No se ha podido calcular el escandallo')
        onResolved(recipeId, true, null)
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => { active = false }
  }, [recipeId, revision, supabase, onResolved])

  if (!visible) return null

  const labels = platoMarbellaSlotsForLang('es')
  const foodCost = report?.complete && report.menuPrice && report.maximum !== null
    ? report.maximum / (report.menuPrice / 1.1) * 100
    : null

  return (
    <section data-element="recipe-panel" data-instance="plato-marbella-escandallo" className="md:col-span-2">
      <div data-element="block-header" className="justify-between">
        <h2 data-element="title">Escandallo · Plato Marbella</h2>
        <button
          type="button"
          onClick={() => setRevision((value) => value + 1)}
          disabled={loading}
          aria-label="Actualizar escandallo del Plato Marbella"
          className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading && !report ? (
        <p className="p-4 text-sm text-gray-500" role="status">Calculando costes de las opciones…</p>
      ) : error ? (
        <p className="m-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="alert">{error}</p>
      ) : report ? (
        <div className="space-y-4 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
            <span>{report.combinations} combinaciones posibles · opciones visibles en carta</span>
            <span>Precio del plato: <strong className="text-gray-800">{money(report.menuPrice)}</strong></span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            {([
              ['Mínimo', report.minimum],
              ['Media teórica', report.average],
              ['Máximo', report.maximum],
            ] as const).map(([name, amount]) => (
              <div key={name} className="rounded-xl bg-gray-50 px-1.5 py-3">
                <div className="text-sm font-black tabular-nums text-gray-800 sm:text-xl">{money(amount)}</div>
                <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">{name}</div>
              </div>
            ))}
          </div>

          {!report.complete && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" role="status">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <strong>Escandallo incompleto: no se conoce todavía el coste máximo real.</strong>
                  {report.provisionalMaximum !== null ? (
                    <p className="mt-1">
                      Mayor coste entre las opciones calculables: {money(report.provisionalMaximum)}.
                      Es provisional y puede aumentar cuando se completen las recetas.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-gray-500">
                <tr className="border-b border-gray-100">
                  <th className="px-2 py-2">Componente</th>
                  <th className="px-2 py-2 text-right">Opciones</th>
                  <th className="px-2 py-2 text-right">Mín.</th>
                  <th className="px-2 py-2 text-right">Media</th>
                  <th className="px-2 py-2 text-right">Máx. conocido</th>
                </tr>
              </thead>
              <tbody>
                {PLATO_MARBELLA_SLOTS.map((slot) => {
                  const group = report.slots[slot]
                  return (
                    <tr key={slot} className="border-b border-gray-100 last:border-0">
                      <td className="px-2 py-2 font-bold text-gray-800">{labels[slot]}</td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {group.options.length}{group.missing ? ' (' + group.missing + ' pendientes)' : ''}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{money(group.min)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{money(group.mean)}</td>
                      <td className="px-2 py-2 text-right font-bold tabular-nums">{money(group.max)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg bg-gray-50 p-3 text-xs">
            <div className="mb-2 font-bold text-gray-800">
              {report.complete ? 'Combinación más cara' : 'Combinación conocida más cara (provisional)'}
            </div>
            {PLATO_MARBELLA_SLOTS.map((slot) => {
              const choice = report.maximumChoices[slot]
              return (
                <div key={slot} className="flex items-baseline justify-between gap-2 py-1">
                  <span className="min-w-0 text-gray-600">
                    {labels[slot]}: {choice?.row.recipe_id ? (
                      <Link className="font-semibold text-sky-700 hover:underline" href={'/recipes/' + choice.row.recipe_id}>
                        {choice.name}
                      </Link>
                    ) : (choice?.name ?? 'Sin escandallo')}
                  </span>
                  <span className="shrink-0 font-bold tabular-nums text-gray-800">{money(choice?.costEur ?? null)}</span>
                </div>
              )
            })}
            <div className="mt-2 flex justify-between border-t border-gray-200 pt-2">
              <span className="text-gray-600">Ingredientes fijos de la receta base</span>
              <strong>{money(report.fixedCost)}</strong>
            </div>
          </div>

          {report.missing.length > 0 || report.fixedCostProblem ? (
            <div className="space-y-1 rounded-lg border border-amber-200 p-3 text-xs text-amber-900">
              <p className="font-bold">Recetas que requieren revisión</p>
              {report.missing.map((option) => (
                <p key={option.row.articulo_id}>
                  {option.row.recipe_id ? (
                    <Link className="underline" href={'/recipes/' + option.row.recipe_id}>{option.name}</Link>
                  ) : option.name}: {issueLabel(option.problem || 'Coste pendiente')}
                </p>
              ))}
              {report.fixedCostProblem && <p>Plato Marbella (receta base): {issueLabel(report.fixedCostProblem)}</p>}
            </div>
          ) : null}

          <p className="text-[11px] leading-relaxed text-gray-500">
            Costes por ración = escandallo de receta × factor de porción TPV.
            La media es teórica, con igual probabilidad de elegir cada opción.
            {foodCost !== null ? ' Food cost máximo: ' + foodCost.toFixed(1).replace('.', ',') + '% del precio sin IVA.' : ''}
            {' '}El cálculo no registra qué combinación se vendió ni realiza descuentos adicionales de stock.
          </p>
        </div>
      ) : (
        <p className="p-4 text-sm text-gray-500">Sin datos de coste disponibles.</p>
      )}
    </section>
  )
}
