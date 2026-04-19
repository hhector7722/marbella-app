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

  const [mappingsRes, articlesRes, recipesRes] = await Promise.all([
    // CÓDIGO DE REFERENCIA PARA LA CONSULTA JOIN (Úsalo en la página):
    supabase
      .from('map_tpv_receta')
      .select('*, bdp_articulos(nombre), recipes(name)')
      .limit(5000),
    supabase
      .from('bdp_articulos')
      .select('id, nombre, departamento_id, familia_id, bdp_familias(nombre), bdp_departamentos(nombre)')
      .order('nombre', { ascending: true })
      .limit(5000),
    supabase
      .from('recipes')
      .select('id, name')
      .order('name', { ascending: true }),
  ])

  if (mappingsRes.error) console.error('Error fetching map_tpv_receta:', mappingsRes.error)
  if (articlesRes.error) console.error('Error fetching bdp_articulos:', articlesRes.error)
  if (recipesRes.error) console.error('Error fetching recipes:', recipesRes.error)

  const mappings = (mappingsRes.data ?? []) as unknown as MappingRow[]
  const articles = (articlesRes.data ?? []) as unknown as TpvArticle[]
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

