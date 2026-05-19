import type { CartaLang } from '@/lib/carta-menu-i18n'
import { tPublicUi } from '@/lib/carta-menu-i18n'
import { CARTA_MEDIO_MERGE_PARENT_NAMES } from '@/lib/carta-medio-merge'

export type CartaDualRacionLabelFields = {
  carta_racion_entero_es?: string | null
  carta_racion_entero_ca?: string | null
  carta_racion_entero_en?: string | null
  carta_racion_medio_es?: string | null
  carta_racion_medio_ca?: string | null
  carta_racion_medio_en?: string | null
}

export function isCartaDualRacionParentCategory(parentName: string | null | undefined): boolean {
  return CARTA_MEDIO_MERGE_PARENT_NAMES.has((parentName ?? '').trim())
}

function pickLabel(raw: string | null | undefined, fallback: string): string {
  const t = raw?.trim()
  return t ? t : fallback
}

export function resolveCartaDualRacionLabels(
  row: CartaDualRacionLabelFields | null | undefined,
  lang: CartaLang
): { racionEntero: string; racionMedio: string } {
  const fb = tPublicUi(lang)
  if (!row) return { racionEntero: fb.racionEntero, racionMedio: fb.racionMedio }
  if (lang === 'ca') {
    return {
      racionEntero: pickLabel(row.carta_racion_entero_ca, fb.racionEntero),
      racionMedio: pickLabel(row.carta_racion_medio_ca, fb.racionMedio),
    }
  }
  if (lang === 'en') {
    return {
      racionEntero: pickLabel(row.carta_racion_entero_en, fb.racionEntero),
      racionMedio: pickLabel(row.carta_racion_medio_en, fb.racionMedio),
    }
  }
  return {
    racionEntero: pickLabel(row.carta_racion_entero_es, fb.racionEntero),
    racionMedio: pickLabel(row.carta_racion_medio_es, fb.racionMedio),
  }
}

export function isCartaDualRacionColumnError(message: string | undefined): boolean {
  const m = (message ?? '').toLowerCase()
  return (
    m.includes('carta_dual_racion') ||
    m.includes('override_precio_medio') ||
    m.includes('carta_racion_entero') ||
    m.includes('carta_racion_medio')
  )
}
