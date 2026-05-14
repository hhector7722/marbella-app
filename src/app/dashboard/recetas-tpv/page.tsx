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
  recipes?: { name: string | null } | null
}

type ArticleRow = {
  id: number
  nombre: string
  departamento_id: number | null
  familia_id: number | null
}

type MappingDbRow = {
  articulo_id: number
  recipe_id: string
  factor_porcion: number | null
}

export default async function RecetasTpvPage() {
  const supabase = await createClient()

  /** Sin embeds PostgREST: `bdp_familias(nombre)` y `bdp_articulos` desde `map_tpv_receta` fallan si falta FK explícita → lista vacía en el cliente. */
  const [mappingsRes, articlesRes, recipesRes, deptRes, familiasRes] = await Promise.all([
    supabase.from('map_tpv_receta').select('articulo_id, recipe_id, factor_porcion').limit(5000),
    supabase
      .from('bdp_articulos')
      .select('id, nombre, departamento_id, familia_id')
      .order('nombre', { ascending: true })
      .limit(5000),
    supabase.from('recipes').select('id, name').order('name', { ascending: true }).limit(5000),
    supabase.from('bdp_departamentos').select('id, nombre').order('nombre', { ascending: true }).limit(5000),
    supabase.from('bdp_familias').select('id, nombre').limit(5000),
  ])

  if (mappingsRes.error) console.error('Error fetching map_tpv_receta:', mappingsRes.error)
  if (articlesRes.error) console.error('Error fetching bdp_articulos:', articlesRes.error)
  if (recipesRes.error) console.error('Error fetching recipes:', recipesRes.error)
  if (deptRes.error) console.error('Error fetching bdp_departamentos:', deptRes.error)
  if (familiasRes.error) console.error('Error fetching bdp_familias:', familiasRes.error)

  if (articlesRes.error) {
    return (
      <DashboardDetailLayout
        title="Mapeo TPV"
        subtitle="Artículos BDP ↔ recetas: el inventario se descuenta según ventas TPV"
        maxWidthClass="max-w-7xl"
      >
        <div
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900 shadow-sm"
          role="alert"
        >
          <p className="text-sm font-black uppercase tracking-wide">No se pudo cargar el catálogo TPV</p>
          <p className="mt-2 font-mono text-xs leading-relaxed text-red-800">{articlesRes.error.message}</p>
        </div>
      </DashboardDetailLayout>
    )
  }

  const deptNombreById = new Map<number, string>()
  for (const d of (deptRes.data ?? []) as { id: number; nombre: string }[]) {
    deptNombreById.set(d.id, d.nombre)
  }

  const familiaNombreById = new Map<number, string>()
  for (const f of (familiasRes.data ?? []) as { id: number; nombre: string }[]) {
    familiaNombreById.set(f.id, f.nombre)
  }

  const articlesRaw = (articlesRes.data ?? []) as ArticleRow[]
  const articuloNombreById = new Map(articlesRaw.map((a) => [a.id, a.nombre]))

  const articles: TpvArticle[] = articlesRaw.map((a) => {
    const did = a.departamento_id
    const fid = a.familia_id
    return {
      ...a,
      bdp_departamentos:
        did != null && deptNombreById.has(did) ? { nombre: deptNombreById.get(did) ?? '' } : null,
      bdp_familias: fid != null && familiaNombreById.has(fid) ? { nombre: familiaNombreById.get(fid) ?? '' } : null,
    }
  })

  const recipes = (recipesRes.data ?? []) as unknown as Recipe[]
  const recipeNameById = new Map(recipes.map((r) => [r.id, r.name]))

  const mappings: MappingRow[] = ((mappingsRes.data ?? []) as MappingDbRow[]).map((m) => ({
    articulo_id: m.articulo_id,
    recipe_id: m.recipe_id,
    factor_porcion: m.factor_porcion,
    bdp_articulos: { nombre: articuloNombreById.get(m.articulo_id) ?? '' },
    recipes: { name: recipeNameById.get(m.recipe_id) ?? null },
  }))

  return (
    <DashboardDetailLayout
      title="Mapeo TPV"
      subtitle="Artículos BDP ↔ recetas: el inventario se descuenta según ventas TPV"
      maxWidthClass="max-w-7xl"
    >
      {mappingsRes.error ? (
        <div
          className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          <span className="font-black uppercase tracking-wide">Aviso: </span>
          No se pudieron leer los mapeos guardados; la lista muestra todos los artículos como «sin receta». Detalle:{' '}
          <span className="font-mono text-xs">{mappingsRes.error.message}</span>
        </div>
      ) : null}
      <MappingClient mappings={mappings} articles={articles} recipes={recipes} />
    </DashboardDetailLayout>
  )
}
