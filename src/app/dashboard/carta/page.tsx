import { createClient } from '@/utils/supabase/server'
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout'
import { Surface } from '@/components/ui/Surface'
import CartaEditorClient from './CartaEditorClient'
import type { CartaEditorMappingRow, CartaOverrideRow } from './types'
import Link from 'next/link'
import CartaMappingCreatorClient, {
  type CartaRecipe,
  type CartaTpvArticle,
} from './CartaMappingCreatorClient'
import { StaffCartaInlineEditor } from '@/components/staff/StaffCartaInlineEditor'

export default async function CartaDashboardPage() {
  const supabase = await createClient()

  const [
    { data: mappings, error: mappingsError },
    { data: overrides, error: overridesError },
    { data: articles, error: articlesError },
    { data: recipes, error: recipesError },
    { data: departamentos, error: departamentosError },
    { data: categories, error: categoriesError },
  ] = await Promise.all([
    supabase
      .from('map_tpv_receta')
      .select(
        'articulo_id, recipe_id, bdp_articulos(id, nombre, departamento_id), recipes(id, name, photo_url)'
      )
      .limit(5000),
    supabase.from('digital_menu_overrides').select('*').limit(5000),
    supabase.from('bdp_articulos').select('id, nombre, departamento_id').limit(5000),
    supabase.from('recipes').select('id, name').order('name', { ascending: true }).limit(5000),
    supabase.from('bdp_departamentos').select('id, nombre').order('nombre', { ascending: true }).limit(5000),
    supabase.from('categories').select('id, name, parent_id, sort_order, scope, slug').eq('scope', 'menu').limit(5000),
  ])

  if (mappingsError) console.error('Error fetching map_tpv_receta (carta):', mappingsError)
  if (overridesError) console.error('Error fetching digital_menu_overrides (carta):', overridesError)
  if (articlesError) console.error('Error fetching bdp_articulos (carta):', articlesError)
  if (recipesError) console.error('Error fetching recipes (carta):', recipesError)
  if (departamentosError) console.error('Error fetching bdp_departamentos (carta):', departamentosError)
  if (categoriesError) console.error('Error fetching categories (carta):', categoriesError)

  const deptNombreById = new Map<number, string>()
  for (const d of (departamentos ?? []) as { id: number; nombre: string }[]) {
    deptNombreById.set(d.id, d.nombre)
  }
  const withDeptNombre = <T extends { departamento_id?: number | null }>(row: T): T & { bdp_departamentos?: { nombre: string } | null } => {
    const did = row.departamento_id
    if (did == null || !deptNombreById.has(did)) {
      return { ...row, bdp_departamentos: null }
    }
    return { ...row, bdp_departamentos: { nombre: deptNombreById.get(did) ?? '' } }
  }

  const enrichedMappings = ((mappings ?? []) as any[]).map((m) => ({
    ...m,
    bdp_articulos: m.bdp_articulos ? withDeptNombre(m.bdp_articulos) : null,
  }))
  const enrichedArticles = ((articles ?? []) as any[]).map((a) => withDeptNombre(a)) as unknown as CartaTpvArticle[]

  const mappedIds = new Set(((mappings ?? []) as any[]).map((m) => m.articulo_id))
  const unmappedArticles = enrichedArticles.filter((a) => !mappedIds.has(a.id))
  return (
    <DashboardDetailLayout
      title="Carta"
      subtitle="Ocultar, ordenar y sobrescribir nombre/descr/precio/foto (sin tocar TPV)"
      maxWidthClass="max-w-7xl"
      template="detail"
      rightSlot={
        <Link
          href="/dashboard/recetas-tpv"
          className="shrink-0 text-[11px] font-black text-ds-texto uppercase tracking-widest hover:opacity-80 transition-colors min-h-[48px] flex items-center"
          aria-label="Ir a Mapeo TPV"
        >
          Mapeo TPV
        </Link>
      }
    >
      <div className="space-y-6">
        <CartaMappingCreatorClient
          unmappedArticles={unmappedArticles}
          recipes={(recipes ?? []) as unknown as CartaRecipe[]}
          departamentos={(departamentos ?? []) as any[]}
        />

        <Surface variant="block" instance="carta-edicion-visual" className="p-4">
          <p className="text-xs font-black uppercase tracking-widest text-ds-marca">Edición visual (nueva)</p>
          <p className="mt-1 text-xs text-zinc-600">
            Editor inline en la misma página (categorías y productos). El editor avanzado por departamento se retirará cuando el nuevo flujo esté completo.
          </p>
          <div className="mt-4">
            <StaffCartaInlineEditor canEdit />
          </div>
        </Surface>

        <CartaEditorClient
          mappings={enrichedMappings as unknown as CartaEditorMappingRow[]}
          overrides={(overrides ?? []) as unknown as CartaOverrideRow[]}
          categories={(categories ?? []) as any[]}
        />
      </div>
    </DashboardDetailLayout>
  )
}

