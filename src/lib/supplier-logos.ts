/**
 * Logos locales de proveedores (single source of truth de pintura).
 *
 * El pack vive en `public/icons/prov`. La BD `suppliers.image_url` puede
 * tener una URL antigua de Storage; para los nombres conocidos gana el pack.
 * Un proveedor sin match usa `image_url` o, si no hay, el icono genérico.
 */

/** Sube esto al cambiar el pack para que el navegador no sirva el PNG viejo. */
export const SUPPLIER_LOGO_REV = '20260831'

export const SUPPLIER_LOGOS: Record<string, string> = {
  Ametller: '/icons/prov/Ametller.png',
  Panabad: '/icons/prov/panabad.png',
  Videla: '/icons/prov/videla.png',
  Zander: '/icons/prov/Zander.png',
  Abril: '/icons/prov/Abril.png',
  'Carnicas Pijuan': '/icons/prov/Pijuan.png',
  'Santa Teresa': '/icons/prov/Sta-Teresa.png',
  Shers: '/icons/prov/Shers.png',
  Sanilec: '/icons/prov/Sanilec.png',
  Nestle: '/icons/prov/Nestle.png',
  'Sant Aniol': '/icons/prov/Sant-Aniol.png',
  'Fritz Ravich': '/icons/prov/Fritz-Ravich.png',
  'Hielo Fenix': '/icons/prov/hielo-fenix.png',
  'Vins i Pons': '/icons/prov/Pons.png',
  Makro: '/icons/prov/Makro.png',
  'Coca Cola': '/icons/prov/CocaCola.png',
  Choco: '/icons/prov/Choco.png',
}

function normalize(name: string): string {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function withRev(path: string): string {
  return `${path}?v=${SUPPLIER_LOGO_REV}`
}

export function localSupplierLogoPath(name: string | null | undefined): string | null {
  const raw = String(name ?? '').trim()
  if (!raw) return null
  if (SUPPLIER_LOGOS[raw]) return SUPPLIER_LOGOS[raw]!

  const target = normalize(raw)
  if (!target) return null

  for (const key of Object.keys(SUPPLIER_LOGOS)) {
    if (normalize(key) === target) return SUPPLIER_LOGOS[key]!
  }

  let best: { path: string; len: number } | null = null
  for (const key of Object.keys(SUPPLIER_LOGOS)) {
    const nk = normalize(key)
    if (!nk) continue
    if (target.includes(nk) || nk.includes(target)) {
      if (!best || nk.length > best.len) best = { path: SUPPLIER_LOGOS[key]!, len: nk.length }
    }
  }
  return best?.path ?? null
}

/**
 * URL del logo para pintar. Prioridad:
 *  1) Pack local (`public/icons/prov`) si el nombre encaja.
 *  2) `image_url` de BD (proveedor propio / foto subida).
 *  3) `null` → el caller pinta el icono genérico (ej. Truck).
 */
export function getSupplierLogo(imageUrl: string | null | undefined, name: string | null | undefined): string | null {
  const local = localSupplierLogoPath(name)
  if (local) return withRev(local)

  const url = String(imageUrl ?? '').trim()
  if (url) return url
  return null
}
