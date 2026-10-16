import {
  groupPlatoMarbellaItems,
  PLATO_MARBELLA_SLOTS,
  type PlatoMarbellaMenuRow,
  type PlatoMarbellaSlot,
} from './carta-plato-marbella.ts'

/** La misma fuente de opciones y precio que usa la carta; no se duplica el catálogo. */
export type PlatoMarbellaCostRow = PlatoMarbellaMenuRow & {
  recipe_id?: string | null
  recipe_name?: string | null
  carta_nombre?: string | null
  tpv_factor_porcion?: number | string | null
}

export type RecipeCostPayload = {
  ok?: boolean
  total_cost_eur?: number | null
  components?: { kind?: string }[] | null
  errors?: { status?: string; component_name?: string }[] | null
}

export type MarbellaCostOption = {
  row: PlatoMarbellaCostRow
  name: string
  costEur: number | null
  problem: string | null
  factor: number | null
}

export type MarbellaSlotCost = {
  options: MarbellaCostOption[]
  min: number | null
  mean: number | null
  max: number | null
  highest: MarbellaCostOption | null
  missing: number
}

export type MarbellaEscandallo = {
  slots: Record<PlatoMarbellaSlot, MarbellaSlotCost>
  menuPrice: number | null
  combinations: number
  missing: MarbellaCostOption[]
  fixedCost: number | null
  fixedCostProblem: string | null
  /** Nulo si falta alguna opción, tramo o coste fijo. Nunca presentar un máximo parcial como definitivo. */
  complete: boolean
  minimum: number | null
  average: number | null
  maximum: number | null
  /** Referencia parcial visible únicamente con etiqueta explícita de provisional. */
  provisionalMaximum: number | null
  maximumChoices: Partial<Record<PlatoMarbellaSlot, MarbellaCostOption>>
}

function finiteNonnegative(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

function positiveFactor(value: unknown): number | null {
  const factor = finiteNonnegative(value)
  return factor !== null && factor > 0 ? factor : null
}

export function costForMarbellaOption(
  row: PlatoMarbellaCostRow,
  payload: RecipeCostPayload | null | undefined,
): MarbellaCostOption {
  const name = row.carta_nombre?.trim() || row.recipe_name?.trim() || 'Artículo ' + row.articulo_id
  const factor = positiveFactor(row.tpv_factor_porcion)
  let problem: string | null = null
  if (!row.recipe_id) problem = 'No tiene receta vinculada'
  else if (!payload) problem = 'No se pudo consultar el escandallo'
  else if (payload.ok !== true) {
    const error = payload.errors?.[0]
    problem = (error?.status || 'Coste no calculable') +
      (error?.component_name ? ': ' + error.component_name : '')
  } else if (!Array.isArray(payload.components) || !payload.components.some((item) => item.kind === 'ingredient')) {
    problem = 'La receta no tiene ingredientes con coste'
  } else if (finiteNonnegative(payload.total_cost_eur) === null) problem = 'Coste de receta no válido'
  else if (factor === null) problem = 'Factor de porción TPV no válido'

  const total = finiteNonnegative(payload?.total_cost_eur)
  return {
    row,
    name,
    factor,
    costEur: problem === null && total !== null && factor !== null ? total * factor : null,
    problem,
  }
}

function summaryForSlot(options: MarbellaCostOption[]): MarbellaSlotCost {
  const valid = options.filter((item) => item.costEur !== null)
  const costs = valid.map((item) => item.costEur as number)
  const highest = valid.reduce<MarbellaCostOption | null>(
    (best, item) => best === null || (item.costEur as number) > (best.costEur as number) ? item : best,
    null,
  )
  return {
    options,
    min: costs.length > 0 ? Math.min(...costs) : null,
    mean: costs.length > 0 ? costs.reduce((sum, value) => sum + value, 0) / costs.length : null,
    max: costs.length > 0 ? Math.max(...costs) : null,
    highest,
    missing: options.length - valid.length,
  }
}

export function buildPlatoMarbellaEscandallo(
  rows: PlatoMarbellaCostRow[],
  costs: Map<string, RecipeCostPayload | null>,
  fixedCostPayload: RecipeCostPayload | null,
): MarbellaEscandallo {
  const grouped = groupPlatoMarbellaItems(rows)
  // El agrupador de carta expone su tipo base; recuperamos aquí la fila enriquecida por articulo_id.
  const rowsByArticulo = new Map(rows.map((row) => [row.articulo_id, row]))
  const slots = {} as Record<PlatoMarbellaSlot, MarbellaSlotCost>
  const missing: MarbellaCostOption[] = []
  const maximumChoices: Partial<Record<PlatoMarbellaSlot, MarbellaCostOption>> = {}
  let combinations = 1
  let hasEverySlot = true
  for (const slot of PLATO_MARBELLA_SLOTS) {
    const options = grouped.sections[slot].map((baseRow) => {
      const row = rowsByArticulo.get(baseRow.articulo_id)!
      const option = costForMarbellaOption(row, row.recipe_id ? costs.get(row.recipe_id) : null)
      if (option.costEur === null) missing.push(option)
      return option
    })
    slots[slot] = summaryForSlot(options)
    combinations *= options.length
    if (options.length === 0 || slots[slot].max === null) hasEverySlot = false
    if (slots[slot].highest) maximumChoices[slot] = slots[slot].highest
  }

  const fixedCost = fixedCostPayload?.ok === true
    ? finiteNonnegative(fixedCostPayload.total_cost_eur)
    : null
  const fixedCostProblem = fixedCost === null
    ? (fixedCostPayload?.errors?.[0]?.status || 'No se pudo calcular el coste fijo de la receta Plato Marbella')
    : null
  const complete = hasEverySlot && missing.length === 0 && fixedCost !== null
  const componentSum = (key: 'min' | 'mean' | 'max'): number | null => {
    if (!hasEverySlot || fixedCost === null) return null
    return PLATO_MARBELLA_SLOTS.reduce((total, slot) => total + (slots[slot][key] ?? 0), fixedCost)
  }
  return {
    slots,
    menuPrice: grouped.menuPrice,
    combinations,
    missing,
    fixedCost,
    fixedCostProblem,
    complete,
    minimum: complete ? componentSum('min') : null,
    average: complete ? componentSum('mean') : null,
    maximum: complete ? componentSum('max') : null,
    provisionalMaximum: !complete ? componentSum('max') : null,
    maximumChoices,
  }
}
