export type CartaEditorMappingRow = {
  articulo_id: number
  recipe_id: string
  bdp_articulos?: {
    id: number
    nombre: string
    departamento_id: number | null
    bdp_departamentos?: { nombre: string } | null
  } | null
  recipes?: { id: string; name: string; photo_url: string | null } | null
}

export type CartaOverrideRow = {
  articulo_id: number
  is_hidden: boolean
  sort_order: number | null
  override_nombre: string | null
  override_descripcion: string | null
  override_precio: number | null
  override_photo_url: string | null
}

