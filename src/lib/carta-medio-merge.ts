/** Secciones donde se fusionan pares TPV entero/medio (mismo recipe_id + factor distinto). */
export const CARTA_MEDIO_MERGE_PARENT_NAMES = new Set(['Extras', 'Bocadillos'])

export type CartaMedioMergeRow = {
  articulo_id: number
  recipe_id?: string | null
  category_parent_name: string | null
  category_child_id: string | null
  tpv_factor_porcion?: number | null
  precio: number | string | null
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

    if (!a.recipe_id || String(a.recipe_id).trim() === '') {
      out.push(a as CartaMedioMerged<T>)
      continue
    }

    let partner: T | null = null
    if (isEnteroFactor(a.tpv_factor_porcion)) {
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
    } else if (isMedioFactor(a.tpv_factor_porcion)) {
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

    if (!partner) {
      out.push(a as CartaMedioMerged<T>)
      continue
    }

    const entero = isEnteroFactor(a.tpv_factor_porcion) ? a : partner
    const medio = isMedioFactor(a.tpv_factor_porcion) ? a : partner

    consumed.add(medio.articulo_id)
    consumed.add(entero.articulo_id)

    out.push({
      ...entero,
      precio_medio_display: medio.precio,
    } as CartaMedioMerged<T>)
  }

  return out
}
