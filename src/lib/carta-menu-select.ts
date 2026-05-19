/** Columnas base (sin ración dual ni talla foto). */
export const CARTA_PUBLIC_MENU_COLUMNS_BASE =
  'articulo_id, carta_nombre, carta_nombre_es, carta_nombre_ca, carta_nombre_en, precio, photo_url, category_parent_id, category_parent_name, category_parent_name_es, category_parent_name_ca, category_parent_name_en, category_parent_sort_order, category_parent_cover_photo_url, category_child_id, category_child_name, category_child_name_es, category_child_name_ca, category_child_name_en, category_child_sort_order, category_child_slug, sort_order, recipe_id, tpv_factor_porcion, plato_marbella_slot, plato_marbella_is_menu_price'

export const CARTA_PUBLIC_MENU_DUAL_COLUMNS =
  ', carta_dual_racion_enabled, override_precio_medio, carta_racion_entero_es, carta_racion_entero_ca, carta_racion_entero_en, carta_racion_medio_es, carta_racion_medio_ca, carta_racion_medio_en'

/** Columnas de vistas carta; ración dual requiere migración 20260519200000. */
export const CARTA_PUBLIC_MENU_COLUMNS = `${CARTA_PUBLIC_MENU_COLUMNS_BASE}${CARTA_PUBLIC_MENU_DUAL_COLUMNS}`

export const CARTA_PUBLIC_MENU_COLUMNS_WITH_SCALE = `${CARTA_PUBLIC_MENU_COLUMNS}, carta_photo_scale`

export const CARTA_DIGITAL_MENU_COLUMNS_BASE =
  'articulo_id, articulo_nombre, carta_nombre, carta_nombre_es, carta_nombre_ca, carta_nombre_en, departamento_id, departamento_nombre, category_id, category_parent_id, category_parent_name, category_parent_name_es, category_parent_name_ca, category_parent_name_en, category_parent_sort_order, category_parent_cover_photo_url, category_child_id, category_child_name, category_child_name_es, category_child_name_ca, category_child_name_en, category_child_sort_order, category_child_slug, recipe_id, recipe_name, descripcion, precio, photo_url, sort_order, tpv_factor_porcion, plato_marbella_slot, plato_marbella_is_menu_price'

export const CARTA_DIGITAL_MENU_COLUMNS = `${CARTA_DIGITAL_MENU_COLUMNS_BASE}${CARTA_PUBLIC_MENU_DUAL_COLUMNS}`

export const CARTA_DIGITAL_MENU_COLUMNS_WITH_SCALE = `${CARTA_DIGITAL_MENU_COLUMNS}, carta_photo_scale`

export function isCartaPhotoScaleColumnError(message: string | undefined): boolean {
  return Boolean(message?.includes('carta_photo_scale'))
}

export { isCartaDualRacionColumnError } from '@/lib/carta-dual-racion'
