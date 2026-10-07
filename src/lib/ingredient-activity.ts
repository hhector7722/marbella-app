/**
 * Lectura y presentación del resumen de actividad de un ingrediente.
 *
 * La magnitud la produce `get_ingredient_activity` en Postgres. Este módulo no
 * recalcula el resumen: solo mapea el JSON de la RPC y lo formatea. Es puro y
 * sin dependencias de React para poder probarse aislado.
 */

export const ACTIVITY_PERIOD_DAYS = 30

/**
 * Subida o bajada de precio que la ficha considera «relevante» y por la que
 * muestra el aviso de la card. El umbral está en
 * `marbella-os/3-ingenieria/dominio/PRECIOS-Y-COMPRAS.md`.
 */
export const SIGNIFICANT_VARIATION_PERCENT = 5

export type IngredientActivityPoint = {
  date: string
  price: number
}

export type IngredientActivityLastPurchase = {
  date: string
  supplier: string | null
  unitPrice: number
}

export type IngredientActivity = {
  periodDays: number
  purchases: number
  totalQuantity: number
  purchaseUnit: string
  baseUnit: string
  avgPrice: number | null
  previousAvgPrice: number | null
  currentPrice: number | null
  variationPercent: number | null
  lastPurchase: IngredientActivityLastPurchase | null
  points: IngredientActivityPoint[]
}

function toFiniteNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function toDayMonth(value: unknown): string {
  if (typeof value !== 'string') return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return ''
  return `${match[3]}/${match[2]}`
}

function mapPoint(value: unknown): IngredientActivityPoint | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const price = toFiniteNumber(row.price)
  const date = typeof row.date === 'string' ? row.date : ''
  if (price == null || price <= 0 || date === '') return null
  return { date, price }
}

function mapLastPurchase(value: unknown): IngredientActivityLastPurchase | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const date = typeof row.date === 'string' ? row.date : ''
  const unitPrice = toFiniteNumber(row.unit_price)
  if (date === '' || unitPrice == null) return null
  const supplier = typeof row.supplier === 'string' && row.supplier.trim() !== ''
    ? row.supplier.trim()
    : null
  return { date, supplier, unitPrice }
}

/**
 * Mapea la respuesta de `get_ingredient_activity`. Devuelve `null` si la RPC
 * no devolvió un resultado válido, para que la pantalla muestre su estado
 * vacío en lugar de valores inventados.
 */
export function mapIngredientActivity(raw: unknown): IngredientActivity | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (row.ok !== true) return null

  const points = Array.isArray(row.points)
    ? row.points.map(mapPoint).filter((point): point is IngredientActivityPoint => point != null)
    : []

  return {
    periodDays: toFiniteNumber(row.period_days) ?? ACTIVITY_PERIOD_DAYS,
    purchases: Math.max(0, Math.trunc(toFiniteNumber(row.purchases) ?? 0)),
    totalQuantity: Math.max(0, toFiniteNumber(row.total_quantity) ?? 0),
    purchaseUnit: typeof row.purchase_unit === 'string' && row.purchase_unit.trim() !== ''
      ? row.purchase_unit.trim()
      : 'ud',
    baseUnit: typeof row.base_unit === 'string' && row.base_unit.trim() !== ''
      ? row.base_unit.trim()
      : 'ud',
    avgPrice: toFiniteNumber(row.avg_price),
    previousAvgPrice: toFiniteNumber(row.previous_avg_price),
    currentPrice: toFiniteNumber(row.current_price),
    variationPercent: toFiniteNumber(row.variation_percent),
    lastPurchase: mapLastPurchase(row.last_purchase),
    points,
  }
}

/** Cantidad comprada con su unidad: `72 ud`. Vacío si no hay cantidad. */
export function formatActivityQuantity(value: number | null | undefined, unit: string): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return ''
  const formatted = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 }).format(value)
  const cleanUnit = unit.trim()
  return cleanUnit ? `${formatted} ${cleanUnit}` : formatted
}

/** Precio unitario canónico: `0,58 €/ud`. Vacío si no es un valor positivo. */
export function formatActivityUnitPrice(
  value: number | null | undefined,
  unit: string,
): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return ''
  const formatted = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value)
  const cleanUnit = unit.trim()
  return cleanUnit ? `${formatted} €/${cleanUnit}` : `${formatted} €`
}

/**
 * Variación porcentual: `+7 %` / `-7 %`. Vacío para nulo o prácticamente cero
 * (regla del valor vacío).
 */
export function formatActivityPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return ''
  if (Math.abs(value) < 0.05) return ''
  const magnitude = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(Math.abs(value))
  const sign = value > 0 ? '+' : '-'
  return `${sign}${magnitude} %`
}

/** Variación relevante según el umbral de producto. */
export function isSignificantVariation(value: number | null | undefined): boolean {
  return value != null && Number.isFinite(value) && Math.abs(value) >= SIGNIFICANT_VARIATION_PERCENT
}

/** Fecha corta de tabla: `03/09`. Vacío si no es una fecha ISO reconocible. */
export function formatActivityDayMonth(value: string | null | undefined): string {
  return toDayMonth(value)
}

export type SparklinePoint = { x: number; y: number }

export type SparklineGeometry = {
  path: string
  first: SparklinePoint | null
  last: SparklinePoint | null
}

/**
 * Geometría de la micrográfica en un lienzo `width` × `height`. El eje Y se
 * invierte (precio mayor arriba). Con un solo punto no hay trazo, pero sí
 * posición para dibujar un punto.
 */
export function buildSparklineGeometry(
  points: IngredientActivityPoint[],
  width: number,
  height: number,
  padding = 1,
): SparklineGeometry {
  const valid = points.filter((point) => Number.isFinite(point.price) && point.price > 0)
  if (valid.length === 0 || width <= 0 || height <= 0) {
    return { path: '', first: null, last: null }
  }

  const prices = valid.map((point) => point.price)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const span = max - min
  const innerWidth = Math.max(0, width - padding * 2)
  const innerHeight = Math.max(0, height - padding * 2)

  const coords: SparklinePoint[] = valid.map((point, index) => {
    const x = valid.length === 1
      ? padding + innerWidth / 2
      : padding + (index / (valid.length - 1)) * innerWidth
    const ratio = span === 0 ? 0.5 : (point.price - min) / span
    const y = padding + (1 - ratio) * innerHeight
    return { x, y }
  })

  const path = coords
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ')

  return {
    path,
    first: coords[0] ?? null,
    last: coords[coords.length - 1] ?? null,
  }
}
