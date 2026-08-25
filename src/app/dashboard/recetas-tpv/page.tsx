import { createClient } from '@/utils/supabase/server'
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout'
import { Notice } from '@/components/ui/Notice'
import MappingClient from './MappingClient'

export type Recipe = {
  id: string
  name: string
}

export type TpvArticle = {
  id: number
  nombre: string
  departamento_id: number | null
  bdp_departamentos?: { nombre: string } | null
}

export type MappingRow = {
  articulo_id: number
  recipe_id: string
  factor_porcion: number | null
  bdp_articulos?: { nombre: string } | null
  recipes?: { name: string | null } | null
}

/** Fila de `supplier_item_mappings` (texto albarán ↔ ingrediente). */
export type AlbaranLearnedName = {
  id: string
  supplier_id: number | null
  supplier_item_name: string
  supplier_name: string | null
  ingredient_id: string
}

/** Una fila de escandallo: ingrediente en BD + textos de albarán enlazados a ese `ingredient_id`. */
export type RecipeIngredientMatchRow = {
  ingredient_id: string
  ingredient_name: string
  albaran: AlbaranLearnedName[]
}

type ArticleRow = {
  id: number
  nombre: string
  departamento_id: number | null
}

type MappingDbRow = {
  articulo_id: number
  recipe_id: string
  factor_porcion: number | null
}

function chunkIds<T>(ids: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size))
  return out
}

export default async function RecetasTpvPage() {
  const supabase = await createClient()

  /** Sin embeds PostgREST: resolución manual de `bdp_departamentos` desde `bdp_articulos` (misma idea que otros listados TPV). */
  const [mappingsRes, articlesRes, recipesRes, deptRes, suppliersRes, ingredientsRes] = await Promise.all([
    supabase.from('map_tpv_receta').select('articulo_id, recipe_id, factor_porcion').limit(5000),
    supabase
      .from('bdp_articulos')
      .select('id, nombre, departamento_id')
      .order('nombre', { ascending: true })
      .limit(5000),
    supabase.from('recipes').select('id, name').order('name', { ascending: true }).limit(5000),
    supabase.from('bdp_departamentos').select('id, nombre').order('nombre', { ascending: true }).limit(5000),
    supabase.from('suppliers').select('id, name').order('name').limit(2000),
    supabase.from('ingredients').select('id, name').order('name').limit(5000),
  ])

  if (mappingsRes.error) console.error('Error fetching map_tpv_receta:', mappingsRes.error)
  if (articlesRes.error) console.error('Error fetching bdp_articulos:', articlesRes.error)
  if (recipesRes.error) console.error('Error fetching recipes:', recipesRes.error)
  if (deptRes.error) console.error('Error fetching bdp_departamentos:', deptRes.error)
  if (suppliersRes.error) console.error('Error fetching suppliers (recetas-tpv):', suppliersRes.error)
  if (ingredientsRes.error) console.error('Error fetching ingredients (recetas-tpv):', ingredientsRes.error)
  if (articlesRes.error) {
    return (
      <DashboardDetailLayout title="Mapeo TPV" maxWidthClass="max-w-7xl">
        <Notice instance="recetas-tpv-catalogo-error" variant="negative" title="No se pudo cargar el catálogo TPV">
          {articlesRes.error.message}
        </Notice>
      </DashboardDetailLayout>
    )
  }

  const deptNombreById = new Map<number, string>()
  for (const d of (deptRes.data ?? []) as { id: number; nombre: string }[]) {
    deptNombreById.set(d.id, d.nombre)
  }

  const articlesRaw = (articlesRes.data ?? []) as ArticleRow[]
  const articuloNombreById = new Map(articlesRaw.map((a) => [a.id, a.nombre]))

  const suppliersMini = ((suppliersRes.data ?? []) as { id: number; name: string }[]).map((s) => ({
    id: s.id,
    name: String(s.name ?? ''),
  }))

  const ingredientsMini = ((ingredientsRes.data ?? []) as { id: string; name: string | null }[]).map((r) => ({
    id: String(r.id ?? ''),
    name: String(r.name ?? '').trim() || String(r.id ?? ''),
  })).filter((r) => r.id)

  const articles: TpvArticle[] = articlesRaw.map((a) => {
    const did = a.departamento_id
    return {
      ...a,
      bdp_departamentos:
        did != null && deptNombreById.has(did) ? { nombre: deptNombreById.get(did) ?? '' } : null,
    }
  })

  const recipes = (recipesRes.data ?? []) as unknown as Recipe[]
  const recipeNameById = new Map(recipes.map((r) => [r.id, r.name]))

  /** Por receta: líneas de escandallo (ingrediente BD) + textos de albarán (`supplier_item_mappings`). */
  let recipeIngredientMatchByRecipeId: Record<string, RecipeIngredientMatchRow[]> = {}
  if (recipes.length > 0) {
    const recipeIdChunks = chunkIds(
      recipes.map((r) => r.id),
      120
    )
    const riRows: { recipe_id: string; ingredient_id: string }[] = []
    const riResults = await Promise.all(
      recipeIdChunks.map((ids) =>
        supabase.from('recipe_ingredients').select('recipe_id, ingredient_id').in('recipe_id', ids)
      )
    )
    for (const { data: ri, error: riErr } of riResults) {
      if (riErr) console.error('Error fetching recipe_ingredients (recetas-tpv):', riErr)
      for (const row of (ri ?? []) as { recipe_id: string; ingredient_id: string }[]) {
        if (row.recipe_id && row.ingredient_id) riRows.push(row)
      }
    }

    const ingredientIds = [...new Set(riRows.map((r) => r.ingredient_id))]
    type SimRow = {
      id: string
      supplier_id: number | null
      supplier_item_name: string
      ingredient_id: string
      suppliers: { name: string } | null
    }
    const simRows: SimRow[] = []
    const simChunks = chunkIds(ingredientIds, 120)
    const simResults = await Promise.all(
      simChunks.map((ids) =>
        ids.length === 0
          ? Promise.resolve({ data: [] as unknown[], error: null as null })
          : supabase
              .from('supplier_item_mappings')
              .select('id, supplier_id, supplier_item_name, ingredient_id, suppliers(name)')
              .in('ingredient_id', ids)
      )
    )
    for (const { data: sim, error: simErr } of simResults) {
      if (simErr) console.error('Error fetching supplier_item_mappings (recetas-tpv):', simErr)
      for (const raw of sim ?? []) {
        const row = raw as {
          id: string | null
          supplier_id: number | null
          supplier_item_name: string | null
          ingredient_id: string | null
          suppliers: { name: string } | { name: string }[] | null
        }
        const emb = row.suppliers
        const holder = Array.isArray(emb) ? emb[0] ?? null : emb
        const sid = row.supplier_id != null && Number.isFinite(Number(row.supplier_id)) ? Number(row.supplier_id) : null
        simRows.push({
          id: String(row.id ?? ''),
          supplier_id: sid,
          supplier_item_name: String(row.supplier_item_name ?? ''),
          ingredient_id: String(row.ingredient_id ?? ''),
          suppliers: holder?.name ? { name: String(holder.name) } : null,
        })
      }
    }

    const byIngredient = new Map<string, AlbaranLearnedName[]>()
    for (const s of simRows) {
      const name = String(s.supplier_item_name ?? '').trim()
      const iid = String(s.ingredient_id ?? '')
      if (!name || !iid) continue
      const sn = s.suppliers?.name != null ? String(s.suppliers.name).trim() : null
      const list = byIngredient.get(iid) ?? []
      list.push({
        id: s.id,
        supplier_id: s.supplier_id,
        supplier_item_name: name,
        supplier_name: sn || null,
        ingredient_id: iid,
      })
      byIngredient.set(iid, list)
    }

    const ingredientNameById = new Map<string, string>()
    for (const ids of chunkIds(ingredientIds, 120)) {
      if (ids.length === 0) continue
      const { data: ingRows, error: ingErr } = await supabase.from('ingredients').select('id, name').in('id', ids)
      if (ingErr) console.error('Error fetching ingredients (recetas-tpv):', ingErr)
      for (const row of (ingRows ?? []) as { id: string; name: string | null }[]) {
        const id = String(row.id ?? '')
        if (!id) continue
        ingredientNameById.set(id, String(row.name ?? '').trim() || id)
      }
    }

    const recipeIngredientOrder = new Map<string, string[]>()
    for (const r of riRows) {
      const arr = recipeIngredientOrder.get(r.recipe_id) ?? []
      if (!arr.includes(r.ingredient_id)) arr.push(r.ingredient_id)
      recipeIngredientOrder.set(r.recipe_id, arr)
    }

    const recipeIngredientMatchBuilt: Record<string, RecipeIngredientMatchRow[]> = {}
    for (const recipe of recipes) {
      const order = recipeIngredientOrder.get(recipe.id) ?? []
      recipeIngredientMatchBuilt[recipe.id] = order.map((iid) => {
        const raw = byIngredient.get(iid) ?? []
        const dedupe = new Map<string, AlbaranLearnedName>()
        for (const a of raw) {
          const k = a.id ? a.id : `${a.supplier_id ?? ''}::${a.supplier_item_name}`
          if (!dedupe.has(k)) dedupe.set(k, a)
        }
        const albaran = [...dedupe.values()].sort((a, b) =>
          a.supplier_item_name.localeCompare(b.supplier_item_name, 'es')
        )
        return {
          ingredient_id: iid,
          ingredient_name: ingredientNameById.get(iid) ?? iid,
          albaran,
        }
      })
    }
    recipeIngredientMatchByRecipeId = recipeIngredientMatchBuilt
  }

  const mappings: MappingRow[] = ((mappingsRes.data ?? []) as MappingDbRow[]).map((m) => ({
    articulo_id: m.articulo_id,
    recipe_id: m.recipe_id,
    factor_porcion: m.factor_porcion,
    bdp_articulos: { nombre: articuloNombreById.get(m.articulo_id) ?? '' },
    recipes: { name: recipeNameById.get(m.recipe_id) ?? null },
  }))

  return (
    <DashboardDetailLayout title="Mapeo TPV" maxWidthClass="max-w-7xl">
      <div className="space-y-4">
      {mappingsRes.error ? (
        <Notice instance="recetas-tpv-mapeos-aviso" variant="warning" title="Aviso">
          No se pudieron leer los mapeos guardados; la lista muestra todos los artículos como «sin receta». Detalle:{' '}
          {mappingsRes.error.message}
        </Notice>
      ) : null}
      <MappingClient
        mappings={mappings}
        articles={articles}
        recipes={recipes}
        suppliersMini={suppliersMini}
        ingredientsMini={ingredientsMini}
        recipeIngredientMatchByRecipeId={recipeIngredientMatchByRecipeId}
      />
      </div>
    </DashboardDetailLayout>
  )
}
