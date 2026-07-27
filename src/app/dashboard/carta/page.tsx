import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRightLeft } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import { V2PageShell, type BreadcrumbItem } from '@/components/layout-v2'
import { Button, PageActions, PageHeader } from '@/components/mds'
import { StaffCartaInlineEditor } from '@/components/staff/StaffCartaInlineEditor'
import CartaEditorClient from './CartaEditorClient'
import CartaMappingCreatorClient, {
  type CartaRecipe,
  type CartaTpvArticle,
} from './CartaMappingCreatorClient'
import type { CartaEditorMappingRow, CartaOverrideRow } from './types'

export const dynamic = 'force-dynamic'

const BREADCRUMBS: BreadcrumbItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/dashboard' },
  { id: 'carta', label: 'Carta' },
]

export default async function CartaDashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, first_name, email')
    .eq('id', user.id)
    .maybeSingle()

  const role = profile?.role ?? null
  const roleLabel =
    role === 'admin' ? 'Admin' : role === 'manager' ? 'Manager' : 'Staff'

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
  const withDeptNombre = <T extends { departamento_id?: number | null }>(
    row: T
  ): T & { bdp_departamentos?: { nombre: string } | null } => {
    const did = row.departamento_id
    if (did == null || !deptNombreById.has(did)) {
      return { ...row, bdp_departamentos: null }
    }
    return { ...row, bdp_departamentos: { nombre: deptNombreById.get(did) ?? '' } }
  }

  const enrichedMappings = ((mappings ?? []) as Array<Record<string, unknown>>).map((m) => ({
    ...m,
    bdp_articulos: m.bdp_articulos
      ? withDeptNombre(m.bdp_articulos as { departamento_id?: number | null })
      : null,
  }))
  const enrichedArticles = ((articles ?? []) as Array<{ departamento_id?: number | null }>).map(
    (a) => withDeptNombre(a)
  ) as unknown as CartaTpvArticle[]

  const mappedIds = new Set(
    ((mappings ?? []) as Array<{ articulo_id: number }>).map((m) => m.articulo_id)
  )
  const unmappedArticles = enrichedArticles.filter((a) => !mappedIds.has(a.id))

  return (
    <V2PageShell
      variant="manager"
      breadcrumbs={BREADCRUMBS}
      user={{
        id: user.id,
        name: profile?.first_name?.trim() || roleLabel,
        email: profile?.email ?? user.email ?? undefined,
        roleLabel,
      }}
    >
      <PageHeader
        title="Carta"
        description="Ocultar, ordenar y sobrescribir nombre/descr/precio/foto (sin tocar TPV)"
        actions={
          <PageActions>
            <Button variant="outline" asChild>
              <Link href="/dashboard/recetas-tpv">
                <ArrowRightLeft className="size-4" strokeWidth={2.5} aria-hidden />
                Mapeo TPV
              </Link>
            </Button>
          </PageActions>
        }
      />
      <div className="space-y-6">
        <CartaMappingCreatorClient
          unmappedArticles={unmappedArticles}
          recipes={(recipes ?? []) as unknown as CartaRecipe[]}
          departamentos={(departamentos ?? []) as Array<{ id: number; nombre: string }>}
        />

        <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-black uppercase tracking-widest text-mds-primary">
            Edición visual (nueva)
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            Editor inline en la misma página (categorías y productos). El editor avanzado por
            departamento se retirará cuando el nuevo flujo esté completo.
          </p>
          <div className="mt-4">
            <StaffCartaInlineEditor canEdit />
          </div>
        </div>

        <CartaEditorClient
          mappings={enrichedMappings as unknown as CartaEditorMappingRow[]}
          overrides={(overrides ?? []) as unknown as CartaOverrideRow[]}
          categories={(categories ?? []) as Array<Record<string, unknown>>}
        />
      </div>
    </V2PageShell>
  )
}
