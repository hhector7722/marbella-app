import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import { MASTER_VIEW_AS_COOKIE } from '@/lib/master-view-as';
import type { SearchResult } from '@/lib/global-search/catalog';

type SearchRow = { kind: SearchResult['type']; entity_id: string; title: string; subtitle: string; line_id: string | null; score: number };
type IngredientImageRow = { id: string; image_url: string | null };
type RecipeImageRow = { id: string; photo_url: string | null };
const ENTITY_ICONS: Partial<Record<SearchResult['type'], string>> = {
  ingredient: '/icons/productes.png', recipe: '/icons/recipes.png', supplier: '/icons/suplier.png',
  employee: '/icons/staff-card.png', invoice: '/icons/scan.png',
};

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (query.length < 2 || query.length > 80) return NextResponse.json({ results: [] }, { status: 400 });
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const cookieStore = await cookies();
  const viewAsId = isMasterDashboardUser(user.email) ? cookieStore.get(MASTER_VIEW_AS_COOKIE)?.value?.trim() || null : null;
  let effectiveId = user.id;
  if (viewAsId && viewAsId !== user.id) {
    const { data, error } = await supabase.from('profiles').select('id').eq('id', viewAsId).maybeSingle();
    if (error || !data) return NextResponse.json({ error: 'Usuario efectivo no disponible' }, { status: 503 });
    effectiveId = data.id;
  }
  const { data: effectiveProfile, error: profileError } = await supabase.from('profiles').select('role').eq('id', effectiveId).maybeSingle();
  if (profileError) return NextResponse.json({ error: 'No se pueden consultar datos en este momento.' }, { status: 503 });
  const staffRecipeView = !(isMasterDashboardUser(user.email) && effectiveId === user.id) && (effectiveProfile?.role === 'staff' || effectiveProfile?.role === 'user');
  const invoiceScope = request.nextUrl.searchParams.get('scope') === 'invoices';
  const rpcName = invoiceScope ? 'global_search_invoice_records' : 'global_search_records';
  const { data, error } = await supabase.rpc(rpcName, { p_query: query, p_effective_user_id: effectiveId });
  if (error) { console.error(`${rpcName}:`, error.message); return NextResponse.json({ error: 'No se pueden consultar datos en este momento.' }, { status: 503 }); }
  const rows = (data ?? []) as SearchRow[];
  const ingredientIds = rows.filter((row) => row.kind === 'ingredient').map((row) => row.entity_id);
  const recipeIds = rows.filter((row) => row.kind === 'recipe').map((row) => row.entity_id);
  const [ingredientImages, recipeImages] = await Promise.all([
    ingredientIds.length > 0
      ? supabase.from('ingredients').select('id,image_url').in('id', ingredientIds)
      : Promise.resolve({ data: [] as IngredientImageRow[] }),
    recipeIds.length > 0
      ? supabase.from('recipes').select('id,photo_url').in('id', recipeIds)
      : Promise.resolve({ data: [] as RecipeImageRow[] }),
  ]);
  const ingredientImageById = new Map(
    ((ingredientImages.data ?? []) as IngredientImageRow[])
      .filter((row) => row.image_url?.trim())
      .map((row) => [row.id, row.image_url!.trim()]),
  );
  const recipeImageById = new Map(
    ((recipeImages.data ?? []) as RecipeImageRow[])
      .filter((row) => row.photo_url?.trim())
      .map((row) => [row.id, row.photo_url!.trim()]),
  );
  const results: SearchResult[] = rows.flatMap((row) => {
    const id = encodeURIComponent(row.entity_id);
    let href: string;
    switch (row.kind) {
      case 'ingredient': href = `/ingredients/${id}`; break;
      case 'recipe': href = `/recipes/${id}${staffRecipeView ? '?view=staff' : ''}`; break;
      case 'supplier': href = `/suppliers?id=${id}`; break;
      case 'employee': href = `/profile?id=${id}`; break;
      case 'invoice': href = `/dashboard/albaranes?id=${id}${row.line_id ? `&line=${encodeURIComponent(row.line_id)}` : ''}`; break;
      default: return [];
    }
    const image = row.kind === 'ingredient'
      ? ingredientImageById.get(row.entity_id)
      : row.kind === 'recipe'
        ? recipeImageById.get(row.entity_id)
        : undefined;
    return [{ type: row.kind, id: row.entity_id, title: row.title, subtitle: row.subtitle, icon: ENTITY_ICONS[row.kind], image, href, score: Number(row.score) }];
  });
  return NextResponse.json({ results }, { headers: { 'Cache-Control': 'private, no-store' } });
}
