/** Secciones donde se fusionan pares TPV entero/medio (mismo recipe_id + factor distinto). */
export const CARTA_MEDIO_MERGE_PARENT_NAMES = new Set(['Extras', 'Bocadillos'])

export type CartaMedioMergeRow = {
  articulo_id: number
  recipe_id?: string | null
  category_parent_name: string | null
  category_child_id: string | null
  tpv_factor_porcion?: number | null
  precio: number | string | null
  /**
   * Nombre “estable” del artículo en carta.
   * Se usa solo como fallback de merge cuando `recipe_id` no permite emparejar
   * (casos reales en Extras/Bocadillos con entero/medio duplicado).
   */
  carta_nombre?: string | null
  /** Fallback extra de nombre si el caller no tiene `carta_nombre`. */
  articulo_nombre?: string | null
  /** Fallback extra de nombre si el caller no tiene `carta_nombre`. */
  recipe_name?: string | null
}

function isMedioFactor(f: number | null | undefined): boolean {
  const n = Number(f)
  return Number.isFinite(n) && n > 0 && n <= 0.55
}

function isEnteroFactor(f: number | null | undefined): boolean {
  const n = Number(f ?? 1)
  if (!Number.isFinite(n) || n <= 0) return true
  return n >= 0.75
}

function pairKey(r: CartaMedioMergeRow): string {
  const rid = (r.recipe_id ?? '').trim()
  return `${rid}::${r.category_child_id ?? ''}`
}

function normalizeMergeName(s: string): string {
  const base = s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

  // Quita marcadores típicos de “medio” en nombres del TPV/carta.
  return base
    .replace(/\b(1\/2)\b/g, ' ')
    .replace(/[½]/g, ' ')
    .replace(/\b(medio|media|mitad|half)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function rowNameForFallback(r: CartaMedioMergeRow): string {
  const s = (r.carta_nombre ?? r.recipe_name ?? r.articulo_nombre ?? '').trim()
  return s
}

function parsePriceNumber(p: number | string | null | undefined): number | null {
  if (p === null || p === undefined) return null
  const n = typeof p === 'string' ? Number(p) : p
  return Number.isFinite(n) ? n : null
}

function fallbackPairKey(r: CartaMedioMergeRow): string | null {
  const parent = (r.category_parent_name ?? '').trim()
  if (!CARTA_MEDIO_MERGE_PARENT_NAMES.has(parent)) return null
  const child = (r.category_child_id ?? '').trim()
  if (!child) return null
  const nm = normalizeMergeName(rowNameForFallback(r))
  if (!nm) return null
  return `${parent}::${child}::${nm}`
}

export type CartaMedioMerged<T extends CartaMedioMergeRow> = T & {
  /** Precio del artículo “medio” cuando esta fila es la fusión entero+medio. */
  precio_medio_display?: number | string | null
}

/**
 * Dentro de una sublista de carta, fusiona pares (mismo recipe_id + category_child_id)
 * con factor entero vs medio. Solo aplica en padres Extras y Bocadillos.
 * Mantiene el orden del primer artículo del par que aparece en `rows`.
 */
export function mergeEnteroMedioForCartaDisplay<T extends CartaMedioMergeRow>(rows: T[]): CartaMedioMerged<T>[] {
  if (rows.length < 2) return rows as CartaMedioMerged<T>[]

  const consumed = new Set<number>()
  const out: CartaMedioMerged<T>[] = []

  for (let i = 0; i < rows.length; i++) {
    const a = rows[i]!
    if (consumed.has(a.articulo_id)) continue

    const parent = (a.category_parent_name ?? '').trim()
    if (!CARTA_MEDIO_MERGE_PARENT_NAMES.has(parent)) {
      out.push(a as CartaMedioMerged<T>)
      continue
    }

    let partner: T | null = null
    const aIsEntero = isEnteroFactor(a.tpv_factor_porcion)
    const aIsMedio = isMedioFactor(a.tpv_factor_porcion)

    // 1) Emparejado preferente por recipe_id (comportamiento original).
    if (a.recipe_id && String(a.recipe_id).trim() !== '') {
      if (aIsEntero) {
        for (let j = 0; j < rows.length; j++) {
          if (j === i) continue
          const b = rows[j]!
          if (consumed.has(b.articulo_id)) continue
          if (!b.recipe_id || String(b.recipe_id).trim() === '') continue
          if (pairKey(b) !== pairKey(a)) continue
          if (isMedioFactor(b.tpv_factor_porcion)) {
            partner = b
            break
          }
        }
      } else if (aIsMedio) {
        for (let j = 0; j < rows.length; j++) {
          if (j === i) continue
          const b = rows[j]!
          if (consumed.has(b.articulo_id)) continue
          if (!b.recipe_id || String(b.recipe_id).trim() === '') continue
          if (pairKey(b) !== pairKey(a)) continue
          if (isEnteroFactor(b.tpv_factor_porcion)) {
            partner = b
            break
          }
        }
      }
    }

    // 2) Fallback seguro por nombre normalizado (solo Extras/Bocadillos + misma subcategoría).
    if (!partner && (aIsEntero || aIsMedio)) {
      const aFallbackKey = fallbackPairKey(a)
      if (aFallbackKey) {
        for (let j = 0; j < rows.length; j++) {
          if (j === i) continue
          const b = rows[j]!
          if (consumed.has(b.articulo_id)) continue

          const bIsEntero = isEnteroFactor(b.tpv_factor_porcion)
          const bIsMedio = isMedioFactor(b.tpv_factor_porcion)
          if (!(aIsEntero && bIsMedio) && !(aIsMedio && bIsEntero)) continue

          const bFallbackKey = fallbackPairKey(b)
          if (!bFallbackKey || bFallbackKey !== aFallbackKey) continue

          const entero = aIsEntero ? a : b
          const medio = aIsMedio ? a : b
          const pEntero = parsePriceNumber(entero.precio)
          const pMedio = parsePriceNumber(medio.precio)
          if (pEntero !== null && pMedio !== null && pEntero > 0 && pMedio > 0 && pMedio > pEntero) {
            continue
          }

          partner = b
          break
        }
      }
    }

    if (!partner) {
      out.push(a as CartaMedioMerged<T>)
      continue
    }

    const entero = aIsEntero ? a : partner
    const medio = aIsMedio ? a : partner

    consumed.add(medio.articulo_id)
    consumed.add(entero.articulo_id)

    out.push({
      ...entero,
      precio_medio_display: medio.precio,
    } as CartaMedioMerged<T>)
  }

  return out
}
