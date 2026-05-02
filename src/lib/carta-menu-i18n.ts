export type CartaLang = 'es' | 'ca' | 'en'

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

export function prettifyChildTitle(parentTitle: string, rawChildTitle: string) {
  if (!rawChildTitle) return ''
  const prefix = `${parentTitle.trim()} - `
  if (rawChildTitle.startsWith(prefix)) return rawChildTitle.slice(prefix.length).trim()
  return rawChildTitle
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
