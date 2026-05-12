/**
 * Logos locales de proveedores (single source of truth).
 *
 * Razón: la BD `suppliers.image_url` no siempre está poblada para los
 * proveedores históricos. Para no depender de subir todos los logos a
 * Storage (y para evitar problemas de `next/image` con dominios externos),
 * mantenemos aquí un fallback con los iconos servidos desde `public/icons/prov`.
 *
 * Uso recomendado: `getSupplierLogo(supplier.image_url, supplier.name)` →
 * devuelve la URL de Storage si existe, si no el path local del fallback,
 * y si tampoco hay match `null` para que el caller pinte un icono genérico.
 */

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

/**
 * Devuelve la URL del logo para mostrar. Prioridad:
 *  1) `image_url` de BD (si existe).
 *  2) `SUPPLIER_LOGOS[name]` (match exacto).
 *  3) `SUPPLIER_LOGOS[k]` con `normalize(k) === normalize(name)` (case/acentos-insensitive).
 *  4) `null` si nada encaja → el caller pinta un icono genérico (ej. Truck).
 */
export function getSupplierLogo(imageUrl: string | null | undefined, name: string | null | undefined): string | null {
  const url = String(imageUrl ?? '').trim()
  if (url) return url

  const raw = String(name ?? '').trim()
  if (!raw) return null
  if (SUPPLIER_LOGOS[raw]) return SUPPLIER_LOGOS[raw]!

  const target = normalize(raw)
  for (const key of Object.keys(SUPPLIER_LOGOS)) {
    if (normalize(key) === target) return SUPPLIER_LOGOS[key]!
  }
  return null
}
