import { createClient } from '@/utils/supabase/server'
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout'
import { Notice } from '@/components/ui/Notice'
import {
  TPV_EXPANSION_CONCURRENCY,
  attachSupplierMappings,
  mapWithConcurrency,
  projectRecipeStockRows,
  recipeIdsForTpvExpansion,
  type AlbaranLearnedName,
  type RecipeMaterialProjection,
  type RecipeStockProjectionRow,
} from '@/lib/recipe-tpv-materials'
export type { AlbaranLearnedName } from '@/lib/recipe-tpv-materials'
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
  const [mappingsRes, articlesRes, recipesRes, deptRes, suppliersRes] = await Promise.all([
    supabase.from('map_tpv_receta').select('articulo_id, recipe_id, factor_porcion').limit(5000),
    supabase
      .from('bdp_articulos')
      .select('id, nombre, departamento_id')
      .order('nombre', { ascending: true })
      .limit(5000),
    supabase.from('recipes').select('id, name').eq('is_sellable', true).order('name', { ascending: true }).limit(5000),
    supabase.from('bdp_departamentos').select('id, nombre').order('nombre', { ascending: true }).limit(5000),
    supabase.from('suppliers').select('id, name').order('name').limit(2000),
  ])

  if (mappingsRes.error) console.error('Error fetching map_tpv_receta:', mappingsRes.error)
  if (articlesRes.error) console.error('Error fetching bdp_articulos:', articlesRes.error)
  if (recipesRes.error) console.error('Error fetching recipes:', recipesRes.error)
  if (deptRes.error) console.error('Error fetching bdp_departamentos:', deptRes.error)
  if (suppliersRes.error) console.error('Error fetching suppliers (recetas-tpv):', suppliersRes.error)
  if (articlesRes.error) {
    return (
      <DashboardDetailLayout title="Recetas" maxWidthClass="max-w-7xl">
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
  const mappingDbRows = (mappingsRes.data ?? []) as MappingDbRow[]
  const expansionIds = recipeIdsForTpvExpansion(
    recipes.map((recipe) => recipe.id),
    mappingDbRows.map((row) => row.recipe_id),
  )
  const missingNameIds = expansionIds.filter((id) => !recipeNameById.has(id))
  if (missingNameIds.length > 0) {
    const nameResults = await Promise.all(
      chunkIds(missingNameIds, 120).map((ids) =>
        supabase.from('recipes').select('id, name').in('id', ids),
      ),
    )
    for (const { data, error } of nameResults) {
      if (error) console.error('Error fetching mapped recipe names (recetas-tpv):', error)
      for (const row of (data ?? []) as { id: string; name: string | null }[]) {
        if (row.id) recipeNameById.set(row.id, row.name ?? row.id)
      }
    }
  }

  const expanded = await mapWithConcurrency(expansionIds, TPV_EXPANSION_CONCURRENCY, async (recipeId) => {
    const { data, error } = await supabase.rpc('recipe_stock_requirements_v2_rows', {
      p_recipe_id: recipeId,
      p_recipe_multiplier: 1,
    })
    if (error) {
      console.error('Error expanding recipe materials (recetas-tpv):', error)
      return [recipeId, projectRecipeStockRows([])] as const
    }
    return [recipeId, projectRecipeStockRows((data ?? []) as RecipeStockProjectionRow[])] as const
  })

  const ingredientIds = [
    ...new Set(
      expanded.flatMap(([, projection]) =>
        projection.status === 'ok' ? projection.rows.map((row) => row.ingredient_id) : [],
      ),
    ),
  ]
  const byIngredient = new Map<string, AlbaranLearnedName[]>()
  const simResults = await Promise.all(
    chunkIds(ingredientIds, 120).map((ids) =>
      ids.length === 0
        ? Promise.resolve({ data: [] as unknown[], error: null as null })
        : supabase
            .from('supplier_item_mappings')
            .select('id, supplier_id, supplier_item_name, ingredient_id, suppliers(name)')
            .in('ingredient_id', ids),
    ),
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
      const name = String(row.supplier_item_name ?? '').trim()
      const iid = String(row.ingredient_id ?? '')
      if (!name || !iid) continue
      const emb = row.suppliers
      const holder = Array.isArray(emb) ? emb[0] ?? null : emb
      const list = byIngredient.get(iid) ?? []
      list.push({
        id: String(row.id ?? ''),
        supplier_id: row.supplier_id != null && Number.isFinite(Number(row.supplier_id)) ? Number(row.supplier_id) : null,
        supplier_item_name: name,
        supplier_name: holder?.name ? String(holder.name).trim() || null : null,
        ingredient_id: iid,
      })
      byIngredient.set(iid, list)
    }
  }

  const recipeMaterialByRecipeId: Record<string, RecipeMaterialProjection> = {}
  for (const [recipeId, projection] of expanded) {
    const attached = attachSupplierMappings(projection, byIngredient)
    if (attached.status !== 'ok') {
      recipeMaterialByRecipeId[recipeId] = attached
      continue
    }
    recipeMaterialByRecipeId[recipeId] = {
      status: 'ok',
      ingredient_count: attached.ingredient_count,
      rows: attached.rows.map((row) => ({
        ...row,
        albaran: [...row.albaran].sort((a, b) => a.supplier_item_name.localeCompare(b.supplier_item_name, 'es')),
      })),
    }
  }

  const mappings: MappingRow[] = mappingDbRows.map((m) => ({
    articulo_id: m.articulo_id,
    recipe_id: m.recipe_id,
    factor_porcion: m.factor_porcion,
    bdp_articulos: { nombre: articuloNombreById.get(m.articulo_id) ?? '' },
    recipes: { name: recipeNameById.get(m.recipe_id) ?? null },
  }))

  return (
    <DashboardDetailLayout title="Recetas" maxWidthClass="max-w-7xl">
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
        recipeMaterialByRecipeId={recipeMaterialByRecipeId}
      />
      </div>
    </DashboardDetailLayout>
  )
}
