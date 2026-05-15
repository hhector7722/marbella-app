export type CartaLang = 'es' | 'ca' | 'en'

/** Idioma inicial (QR y staff) hasta que el usuario cambie el selector. */
export const DEFAULT_CARTA_LANG: CartaLang = 'ca'

export function tPublicUi(lang: CartaLang) {
  const dict = {
    es: {
      title: 'La carta',
      subtitle: 'Nombre y precio',
      search: 'Buscar…',
      uncategorized: 'Sin categoría',
      pickSubcategoryTitle: 'Elige una subcategoría',
      backToSubcategories: 'Ver todas las subcategorías',
    },
    ca: {
      title: 'La carta',
      subtitle: 'Nom i preu',
      search: 'Cercar…',
      uncategorized: 'Sense categoria',
      pickSubcategoryTitle: 'Tria una subcategoria',
      backToSubcategories: 'Veure totes les subcategories',
    },
    en: {
      title: 'Menu',
      subtitle: 'Name & price',
      search: 'Search…',
      uncategorized: 'Uncategorized',
      pickSubcategoryTitle: 'Choose a subcategory',
      backToSubcategories: 'All subcategories',
    },
  } as const
  return dict[lang]
}

const PARENT: Record<string, { es: string; ca: string; en: string }> = {
  Tapas: { es: 'Tapas', ca: 'Tapes', en: 'Tapas' },
  Bocadillos: { es: 'Bocadillos', ca: 'Entrepans', en: 'Sandwiches' },
  Platos: { es: 'Platos', ca: 'Plats', en: 'Main dishes' },
  Bebidas: { es: 'Bebidas', ca: 'Begudes', en: 'Drinks' },
  'Cafetería': { es: 'Cafetería', ca: 'Cafeteria', en: 'Coffee' },
  Snacks: { es: 'Snacks', ca: 'Snacks', en: 'Snacks' },
  Extras: { es: 'Extras', ca: 'Extres', en: 'Extras' },
  General: { es: 'General', ca: 'General', en: 'General' },
  Helados: { es: 'Helados', ca: 'Gelats', en: 'Ice cream' },
}

/** Subtítulo de carta bajo Bebidas (tras quitar prefijo "Bebidas - ") */
const SUB: Record<string, { es: string; ca: string; en: string }> = {
  Refrescos: { es: 'Refrescos', ca: 'Refrescòs', en: 'Soft drinks' },
  Cervezas: { es: 'Cervezas', ca: 'Cerveses', en: 'Beers' },
  Vinos: { es: 'Vinos', ca: 'Vins', en: 'Wines' },
  Aperitivos: { es: 'Aperitivos', ca: 'Aperitius', en: 'Aperitifs' },
  'Plato Marbella': { es: 'Plato Marbella', ca: 'Plat Marbella', en: 'Marbella plate' },
}

export function tPlatoMarbellaUi(lang: CartaLang) {
  const dict = {
    es: {
      intro: 'Un solo plato con tres elecciones: entrante, plato principal y guarnición.',
      stepEntrante: '1 · Entrante',
      stepPrincipal: '2 · Principal',
      stepGuarnicion: '3 · Guarnición',
      unassigned: 'Sin tramo asignado',
      unassignedHint: 'Asigna cada opción a un tramo en el editor de carta.',
      editorSlotLabel: 'Tramo del plato',
      editorSlotNone: '— Ninguno (precio menú u otro) —',
      editorSlotEntrante: 'Entrante',
      editorSlotPrincipal: 'Plato principal',
      editorSlotGuarnicion: 'Guarnición',
      editorMenuPrice: 'Precio del menú en carta',
      editorMenuPriceHint:
        'Las opciones no muestran precio; solo el artículo marcado como precio del menú.',
      staffEditHint: 'Asigna cada opción a un tramo. Pulsa el lápiz para nombre y foto.',
      staffReorderHint: '1) Pulsa la opción a mover. 2) Pulsa la posición destino en este tramo. 3) Guardar orden.',
      staffReorderPickSection: 'Tramo a reordenar',
      staffMenuPriceSection: 'Precio del menú (solo uno)',
      staffSlotShortEntrante: 'Entr.',
      staffSlotShortPrincipal: 'Princ.',
      staffSlotShortGuarnicion: 'Guarn.',
      staffMarkMenuPrice: 'Precio menú',
      staffEditItem: 'Editar',
    },
    ca: {
      intro: 'Un sol plat amb tres eleccions: entrant, plat principal i guarnició.',
      stepEntrante: '1 · Entrant',
      stepPrincipal: '2 · Principal',
      stepGuarnicion: '3 · Guarnició',
      unassigned: 'Sense tram assignat',
      unassignedHint: 'Assigna cada opció a un tram a l’editor de carta.',
      editorSlotLabel: 'Tram del plat',
      editorSlotNone: '— Cap (preu menú o altre) —',
      editorSlotEntrante: 'Entrant',
      editorSlotPrincipal: 'Plat principal',
      editorSlotGuarnicion: 'Guarnició',
      editorMenuPrice: 'Preu del menú a la carta',
      editorMenuPriceHint:
        'Les opcions no mostren preu; només l’article marcat com a preu del menú.',
      staffEditHint: 'Assigna cada opció a un tram. Prem el llapis per nom i foto.',
      staffReorderHint: '1) Prem l’opció a moure. 2) Prem la posició destí en aquest tram. 3) Desar ordre.',
      staffReorderPickSection: 'Tram a reordenar',
      staffMenuPriceSection: 'Preu del menú (només un)',
      staffSlotShortEntrante: 'Entr.',
      staffSlotShortPrincipal: 'Princ.',
      staffSlotShortGuarnicion: 'Guarn.',
      staffMarkMenuPrice: 'Preu menú',
      staffEditItem: 'Editar',
    },
    en: {
      intro: 'One plate with three choices: starter, main course and side.',
      stepEntrante: '1 · Starter',
      stepPrincipal: '2 · Main',
      stepGuarnicion: '3 · Side',
      unassigned: 'No section assigned',
      unassignedHint: 'Assign each option to a section in the menu editor.',
      editorSlotLabel: 'Plate section',
      editorSlotNone: '— None (menu price or other) —',
      editorSlotEntrante: 'Starter',
      editorSlotPrincipal: 'Main course',
      editorSlotGuarnicion: 'Side',
      editorMenuPrice: 'Menu price on the card',
      editorMenuPriceHint: 'Options show no price; only the item marked as menu price.',
      staffEditHint: 'Assign each option to a section. Tap pencil for name and photo.',
      staffReorderHint: '1) Tap the option to move. 2) Tap destination in this section. 3) Save order.',
      staffReorderPickSection: 'Section to reorder',
      staffMenuPriceSection: 'Menu price (one only)',
      staffSlotShortEntrante: 'Start.',
      staffSlotShortPrincipal: 'Main',
      staffSlotShortGuarnicion: 'Side',
      staffMarkMenuPrice: 'Menu price',
      staffEditItem: 'Edit',
    },
  } as const
  return dict[lang]
}

export function translateParentCategoryTitle(lang: CartaLang, raw: string) {
  const s = raw.trim()
  const hit = PARENT[s]
  if (!hit) return s
  return hit[lang]
}

/** `childTitle` ya sin prefijo padre (ej. "Cervezas"). */
export function translateChildCategoryTitle(lang: CartaLang, childTitle: string) {
  const s = childTitle.trim()
  if (!s) return ''
  const hit = SUB[s]
  if (!hit) return s
  return hit[lang]
}

/** Fila con nombres de categoría (vista BD o cliente); los *_es|ca|en vienen de `menu_category_overrides` + fallback. */
export type CartaCategoryNamesRow = {
  category_parent_name: string | null
  category_parent_name_es?: string | null
  category_parent_name_ca?: string | null
  category_parent_name_en?: string | null
  category_child_name: string | null
  category_child_name_es?: string | null
  category_child_name_ca?: string | null
  category_child_name_en?: string | null
}

const UNCATEGORIZED_FALLBACK = 'Sin categoría'

export function prettifyChildTitle(parentTitle: string, rawChildTitle: string) {
  if (!rawChildTitle) return ''
  const prefix = `${parentTitle.trim()} - `
  if (rawChildTitle.startsWith(prefix)) return rawChildTitle.slice(prefix.length).trim()
  return rawChildTitle
}

/** Quita prefijos "Padre - " aunque el padre venga traducido o con distinto separador. */
export function stripLeadingParentFromChildLabel(parentTitleRaw: string, label: string): string {
  let s = label.trim()
  const pr = parentTitleRaw.trim()
  if (!s || !pr) return s

  const parents = new Set<string>()
  parents.add(pr)
  for (const lang of ['es', 'ca', 'en'] as const) {
    parents.add(translateParentCategoryTitle(lang, pr))
  }

  const seps = [' - ', ' – ', ' — ', ': ', ' / ', ' /', '/']
  let guard = 0
  while (guard++ < 8) {
    let changed = false
    outer: for (const p of parents) {
      if (!p) continue
      for (const sep of seps) {
        const pref = p + sep
        if (pref.length <= s.length && s.slice(0, pref.length).toLowerCase() === pref.toLowerCase()) {
          s = s.slice(pref.length).trim()
          changed = true
          break outer
        }
      }
    }
    if (!changed) break
  }
  return s
}

/** Título de sección padre según idioma (overrides BD > mapa fijo > nombre base). */
export function getCartaParentCategoryLabel(lang: CartaLang, row: CartaCategoryNamesRow, uncategorizedLabel?: string) {
  const raw = (row.category_parent_name?.trim() || uncategorizedLabel?.trim() || UNCATEGORIZED_FALLBACK).trim()
  const es = row.category_parent_name_es?.trim()
  const ca = row.category_parent_name_ca?.trim()
  const en = row.category_parent_name_en?.trim()
  if (lang === 'es') return es || translateParentCategoryTitle('es', raw)
  if (lang === 'ca') return ca || es || translateParentCategoryTitle('ca', raw)
  return en || es || translateParentCategoryTitle('en', raw)
}

/** Título de subcategoría según idioma (overrides BD > mapa fijo > nombre base). */
export function getCartaChildCategoryLabel(lang: CartaLang, row: CartaCategoryNamesRow, parentTitleRaw: string, childTitleRaw: string) {
  const short = prettifyChildTitle(parentTitleRaw, childTitleRaw)
  if (!short) return ''
  const es = row.category_child_name_es?.trim()
  const ca = row.category_child_name_ca?.trim()
  const en = row.category_child_name_en?.trim()
  if (lang === 'es') return es || translateChildCategoryTitle('es', short)
  if (lang === 'ca') return ca || es || translateChildCategoryTitle('ca', short)
  return en || es || translateChildCategoryTitle('en', short)
}

/**
 * Texto solo subcategoría para botones/pestañas (sin repetir el nombre de la categoría padre).
 * Usa overrides i18n de hijo y elimina prefijos de padre si la BD los incluye en el nombre.
 */
export function getCartaSubcategoryPickerLabel(
  lang: CartaLang,
  row: CartaCategoryNamesRow,
  parentTitleRaw: string,
  childTitleRaw: string
) {
  const base = (childTitleRaw || row.category_child_name || '').trim()
  const es = row.category_child_name_es?.trim()
  const ca = row.category_child_name_ca?.trim()
  const en = row.category_child_name_en?.trim()

  let localized =
    lang === 'es' ? es || base : lang === 'ca' ? ca || es || base : en || es || base

  let pick = stripLeadingParentFromChildLabel(parentTitleRaw, localized)
  if (!pick) pick = stripLeadingParentFromChildLabel(parentTitleRaw, base)
  if (!pick) pick = prettifyChildTitle(parentTitleRaw, base)
  if (!pick) {
    const full = getCartaChildCategoryLabel(lang, row, parentTitleRaw, base)
    pick = stripLeadingParentFromChildLabel(parentTitleRaw, full).trim()
  }
  if (!pick) return ''

  return translateChildCategoryTitle(lang, pick)
}

export type CartaNameRow = {
  carta_nombre: string
  carta_nombre_es: string | null
  carta_nombre_ca: string | null
  carta_nombre_en: string | null
}

export function getCartaDisplayName(row: CartaNameRow, lang: CartaLang) {
  if (lang === 'ca')
    return row.carta_nombre_ca?.trim() || row.carta_nombre_es?.trim() || row.carta_nombre?.trim()
  if (lang === 'en')
    return row.carta_nombre_en?.trim() || row.carta_nombre_es?.trim() || row.carta_nombre?.trim()
  return row.carta_nombre_es?.trim() || row.carta_nombre?.trim()
}
