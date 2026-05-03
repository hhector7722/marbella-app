import { createClient } from '@/utils/supabase/server'
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout'
import MappingClient from './MappingClient'

export type Recipe = {
  id: string
  name: string
}

export type TpvArticle = {
  id: number
  nombre: string
  departamento_id: number | null
  familia_id: number | null
  bdp_familias?: { nombre: string } | null
  bdp_departamentos?: { nombre: string } | null
}

export type MappingRow = {
  articulo_id: number
  recipe_id: string
  factor_porcion: number | null
  bdp_articulos?: { nombre: string } | null
  recipes?: { name: string } | null
}

export default async function RecetasTpvPage() {
  const supabase = await createClient()

  const [mappingsRes, articlesRes, recipesRes, deptRes] = await Promise.all([
    // CÓDIGO DE REFERENCIA PARA LA CONSULTA JOIN (Úsalo en la página):
    supabase
      .from('map_tpv_receta')
      .select('*, bdp_articulos(nombre), recipes(name)')
      .limit(5000),
    supabase
      .from('bdp_articulos')
      .select('id, nombre, departamento_id, familia_id, bdp_familias(nombre)')
      .order('nombre', { ascending: true })
      .limit(5000),
    supabase
      .from('recipes')
      .select('id, name')
      .order('name', { ascending: true }),
    supabase.from('bdp_departamentos').select('id, nombre').order('nombre', { ascending: true }).limit(5000),
  ])

  if (mappingsRes.error) console.error('Error fetching map_tpv_receta:', mappingsRes.error)
  if (articlesRes.error) console.error('Error fetching bdp_articulos:', articlesRes.error)
  if (recipesRes.error) console.error('Error fetching recipes:', recipesRes.error)
  if (deptRes.error) console.error('Error fetching bdp_departamentos:', deptRes.error)

  const deptNombreById = new Map<number, string>()
  for (const d of (deptRes.data ?? []) as { id: number; nombre: string }[]) {
    deptNombreById.set(d.id, d.nombre)
  }
  const articles = ((articlesRes.data ?? []) as unknown as TpvArticle[]).map((a) => {
    const did = a.departamento_id
    if (did == null || !deptNombreById.has(did)) {
      return { ...a, bdp_departamentos: null as { nombre: string } | null }
    }
    return { ...a, bdp_departamentos: { nombre: deptNombreById.get(did) ?? '' } }
  })

  const mappings = (mappingsRes.data ?? []) as unknown as MappingRow[]
  const recipes = (recipesRes.data ?? []) as unknown as Recipe[]

  return (
    <DashboardDetailLayout
      title="Mapeo TPV"
      subtitle="Artículos BDP ↔ recetas: el inventario se descuenta según ventas TPV"
      maxWidthClass="max-w-7xl"
    >
      <MappingClient mappings={mappings} articles={articles} recipes={recipes} />
    </DashboardDetailLayout>
  )
}

