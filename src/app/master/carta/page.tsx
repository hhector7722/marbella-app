import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import { PageScreen } from '@/components/dashboard/DashboardDetailLayout';
import { EmptyState } from '@/components/ui/EmptyState';
import { MENU_BOARD_CATALOG_COLUMNS, applyLiveCatalog, mapCatalog, type DigitalMenuSource } from '@/lib/menu-board/catalog';
import { mapCategory, mapItem } from '@/lib/menu-board/map';
import { MenuBoardClient } from '@/components/menu-board/MenuBoardClient';
import { seedMenuBoardFromVirtualMenu } from './actions';

export const dynamic = 'force-dynamic';

export default async function MasterCartaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !isMasterDashboardUser(user.email)) {
    redirect('/dashboard');
  }

  const [{ data: categories, error: categoriesError }, itemsResult, catalogResult] = await Promise.all([
    supabase.from('menu_board_categories').select('*').order('position', { ascending: true }),
    supabase.from('menu_board_items').select('*').order('sort_order', { ascending: true }),
    supabase.from('v_digital_menu_items').select(MENU_BOARD_CATALOG_COLUMNS),
  ]);
  let items = itemsResult.data;
  let itemsError = itemsResult.error;
  let seedError: string | null = null;

  if (!categoriesError && !itemsError) {
    const seeded = await seedMenuBoardFromVirtualMenu();
    if (!seeded.ok) {
      seedError = seeded.error;
    } else {
      const again = await supabase.from('menu_board_items').select('*').order('sort_order', { ascending: true });
      items = again.data;
      itemsError = again.error;
    }
  }

  const boardCategories = (categories ?? []).map((row) => mapCategory(row));
  const catalog = mapCatalog((catalogResult.data ?? []) as DigitalMenuSource[]);

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
      subtitle="Productos y precios de la carta virtual"
      backHref="/master/dashboard"
      template="list"
      work="form"
      maxWidthClass="max-w-4xl lg:max-w-[72rem]"
    >
      <MenuBoardClient
        categories={boardCategories}
        items={applyLiveCatalog(
          (items ?? []).map((row) => mapItem(row)),
          boardCategories,
          catalog,
        )}
        catalog={catalog}
        catalogError={catalogResult.error?.message ?? seedError}
      />
    </PageScreen>
  );
}
