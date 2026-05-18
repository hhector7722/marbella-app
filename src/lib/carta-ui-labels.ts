import type { SupabaseClient } from '@supabase/supabase-js'
import type { CartaLang } from '@/lib/carta-menu-i18n'
import { tPublicUi } from '@/lib/carta-menu-i18n'

export type CartaUiLabelsRow = {
  id: string
  racion_entero_es: string
  racion_entero_ca: string
  racion_entero_en: string
  racion_medio_es: string
  racion_medio_ca: string
  racion_medio_en: string
}

export type CartaRacionLabelsForLang = {
  racionEntero: string
  racionMedio: string
}

export const CARTA_UI_LABELS_ID = 'default'

export function defaultCartaUiLabelsRow(): CartaUiLabelsRow {
  const es = tPublicUi('es')
  const ca = tPublicUi('ca')
  const en = tPublicUi('en')
  return {
    id: CARTA_UI_LABELS_ID,
    racion_entero_es: es.racionEntero,
    racion_entero_ca: ca.racionEntero,
    racion_entero_en: en.racionEntero,
    racion_medio_es: es.racionMedio,
    racion_medio_ca: ca.racionMedio,
    racion_medio_en: en.racionMedio,
  }
}

function pickLabel(raw: string | null | undefined, fallback: string): string {
  const t = raw?.trim()
  return t ? t : fallback
}

export function racionLabelsForLang(
  row: CartaUiLabelsRow | null | undefined,
  lang: CartaLang
): CartaRacionLabelsForLang {
  const defaults = defaultCartaUiLabelsRow()
  const base = row ?? defaults
  const fb = tPublicUi(lang)
  if (lang === 'ca') {
    return {
      racionEntero: pickLabel(base.racion_entero_ca, fb.racionEntero),
      racionMedio: pickLabel(base.racion_medio_ca, fb.racionMedio),
    }
  }
  if (lang === 'en') {
    return {
      racionEntero: pickLabel(base.racion_entero_en, fb.racionEntero),
      racionMedio: pickLabel(base.racion_medio_en, fb.racionMedio),
    }
  }
  return {
    racionEntero: pickLabel(base.racion_entero_es, fb.racionEntero),
    racionMedio: pickLabel(base.racion_medio_es, fb.racionMedio),
  }
}

export function isCartaUiLabelsTableMissing(message: string | undefined): boolean {
  const m = (message ?? '').toLowerCase()
  return m.includes('carta_ui_labels') && (m.includes('does not exist') || m.includes('schema cache'))
}

export async function fetchCartaUiLabels(supabase: SupabaseClient): Promise<CartaUiLabelsRow | null> {
  const { data, error } = await supabase
    .from('carta_ui_labels')
    .select(
      'id, racion_entero_es, racion_entero_ca, racion_entero_en, racion_medio_es, racion_medio_ca, racion_medio_en'
    )
    .eq('id', CARTA_UI_LABELS_ID)
    .maybeSingle()

  if (error) {
    if (isCartaUiLabelsTableMissing(error.message)) return null
    console.error('fetchCartaUiLabels:', error.message)
    return null
  }
  if (!data) return null
  return data as CartaUiLabelsRow
}
