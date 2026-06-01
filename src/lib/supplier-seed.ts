/**
 * Plantilla de proveedores para instalación nueva (tabla `suppliers` vacía).
 * Si la BD ya tiene filas, la fuente de verdad es solo la BD — un proveedor
 * borrado en Supabase no debe reaparecer en la UI.
 */

export type SupplierSeed = {
  name: string
  category?: string
}

export const INITIAL_SUPPLIER_SEED: SupplierSeed[] = [
  { name: 'Ametller', category: 'Alimentos' },
  { name: 'Panabad', category: 'Alimentos' },
  { name: 'Videla', category: 'Alimentos' },
  { name: 'Santa Teresa', category: 'Alimentos' },
  { name: 'Carnicas Pijuan', category: 'Alimentos' },
  { name: 'Fritz Ravich', category: 'Alimentos' },
  { name: 'Sant Aniol', category: 'Bebidas' },
  { name: 'Vins i Pons', category: 'Bebidas' },
  { name: 'Shers', category: 'Bebidas' },
  { name: 'Zander', category: 'Bebidas' },
  { name: 'Nestle', category: 'Alimentos' },
  { name: 'Abril', category: 'Alimentos' },
  { name: 'Sanilec', category: 'Limpieza' },
  { name: 'Hielo Fenix', category: 'Bebidas' },
]

export function sortSuppliersByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name))
}

/** Lista para picker/modal: BD si hay datos; si no, semilla `initial-*`. */
export function resolveSupplierPickerItems(
  dbSuppliers: { id: string; name: string; image_url?: string | null }[],
): { id: string; name: string; image_url: string | null }[] {
  if (dbSuppliers.length > 0) {
    return sortSuppliersByName(
      dbSuppliers.map((s) => ({
        id: s.id,
        name: s.name,
        image_url: s.image_url ?? null,
      })),
    )
  }
  return sortSuppliersByName(
    INITIAL_SUPPLIER_SEED.map((seed) => ({
      id: `initial-${seed.name}`,
      name: seed.name,
      image_url: null,
    })),
  )
}
