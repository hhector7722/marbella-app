import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import { PageScreen } from '@/components/dashboard/DashboardDetailLayout';
import { EmptyState } from '@/components/ui/EmptyState';
import { mapCategory, mapItem } from '@/lib/menu-board/map';
import { MenuBoardClient } from '@/components/menu-board/MenuBoardClient';

export const dynamic = 'force-dynamic';

export default async function MasterCartaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !isMasterDashboardUser(user.email)) {
    redirect('/dashboard');
  }

  const [{ data: categories, error: categoriesError }, { data: items, error: itemsError }] = await Promise.all([
    supabase.from('menu_board_categories').select('*').order('position', { ascending: true }),
    supabase.from('menu_board_items').select('*').order('sort_order', { ascending: true }),
  ]);

  if (categoriesError || itemsError) {
    return (
      <PageScreen title="Carta física" backHref="/master/dashboard" template="list">
        <EmptyState
          instance="menu-board-load-error"
          variant="error"
          title="No se ha podido cargar la carta"
          description={categoriesError?.message ?? itemsError?.message ?? 'Error desconocido'}
        />
      </PageScreen>
    );
  }

  return (
    <PageScreen
      title="Carta física"
      subtitle="Una fuente para las dos vitrinas"
      backHref="/master/dashboard"
      template="list"
      maxWidthClass="max-w-4xl lg:max-w-[72rem]"
    >
      <MenuBoardClient
        categories={(categories ?? []).map((row) => mapCategory(row))}
        items={(items ?? []).map((row) => mapItem(row))}
      />
    </PageScreen>
  );
}
