import { redirect } from 'next/navigation';

import { createClient } from '@/utils/supabase/server';
import { canEditCartaMenu } from '@/lib/carta-permissions';

import { StaffCartaView } from '@/components/staff/StaffCartaView';

import type { DigitalMenuRow } from '@/components/staff/MenuAccordion';

import { resolveMenuCategoryCoverById, splitMenuCategoryCovers } from '@/lib/carta-category-covers';
import {
    CARTA_DIGITAL_MENU_COLUMNS,
    CARTA_DIGITAL_MENU_COLUMNS_BASE,
    CARTA_DIGITAL_MENU_COLUMNS_WITH_SCALE,
    isCartaDualRacionColumnError,
    isCartaPhotoScaleColumnError,
} from '@/lib/carta-menu-select';

type CartaMenuCategoryRow = {
    id: string;
    name: string;
    parent_id: string | null;
    sort_order: number | null;
    slug: string | null;
    cover_articulo_id: number | null;
    cover_photo_url: string | null;
    cover_photo_scale: string | null;
};

export default async function StaffCartaPage() {

    const supabase = await createClient();

    const {
        data: { session },
    } = await supabase.auth.getSession();

    const user = session?.user ?? null;



    if (!user) {

        redirect('/login');

    }



    const [{ data: profile, error: profileError }, { data: cartaEditor, error: cartaEditorError }] =
        await Promise.all([
            supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
            supabase.from('carta_editors').select('user_id').eq('user_id', user.id).maybeSingle(),
        ]);



    if (profileError) {

        console.error('Error fetching profile role (staff/carta):', profileError);

    }

    if (cartaEditorError) {

        console.error('Error fetching carta editor flag (staff/carta):', cartaEditorError);

    }



    const role = (profile?.role ?? null) as string | null;

    const canEditMenu = canEditCartaMenu(role, Boolean(cartaEditor));

    const canOpenMapeo = role === 'manager' || role === 'admin';



    let menuCategories: CartaMenuCategoryRow[] = [];
    {
        const full = await supabase
            .from('categories')
            .select('id, name, parent_id, sort_order, slug, cover_articulo_id, cover_photo_url, cover_photo_scale')
            .eq('scope', 'menu')
            .order('sort_order', { ascending: true });
        if (!full.error && full.data) {
            menuCategories = full.data as CartaMenuCategoryRow[];
        } else {
            if (full.error) {
                console.error('Error fetching menu categories (staff/carta):', full.error);
            }
            const leg = await supabase
                .from('categories')
                .select('id, name, parent_id, sort_order, slug, cover_articulo_id')
                .eq('scope', 'menu')
                .order('sort_order', { ascending: true });
            if (leg.error) {
                console.error('Error fetching menu categories legacy (staff/carta):', leg.error);
            }
            menuCategories = (leg.data ?? []).map((c) => ({
                ...c,
                cover_articulo_id: c.cover_articulo_id ?? null,
                cover_photo_url: null,
                cover_photo_scale: null,
            })) as CartaMenuCategoryRow[];
        }
    }



    let categoryCoverById: Record<string, string | null> = {};

    let categoryCoverScaleById: Record<string, 's' | 'm' | 'l'> = {};

    try {

        const resolved = await resolveMenuCategoryCoverById(

            supabase,

            menuCategories.map((c) => ({

                id: c.id,

                cover_articulo_id: c.cover_articulo_id ?? null,

                cover_photo_url: c.cover_photo_url ?? null,

                cover_photo_scale: c.cover_photo_scale ?? null,

            }))

        );

        const split = splitMenuCategoryCovers(resolved);

        categoryCoverById = split.categoryCoverById;

        categoryCoverScaleById = split.categoryCoverScaleById;

    } catch (e) {

        console.error('resolveMenuCategoryCoverById (staff/carta):', e);

    }



    const menuOrder = (cols: string) =>
        supabase
            .from('v_digital_menu_items')
            .select(cols)
            .order('category_parent_sort_order', { ascending: true, nullsFirst: false })
            .order('category_parent_name', { ascending: true, nullsFirst: false })
            .order('category_child_sort_order', { ascending: true, nullsFirst: false })
            .order('category_child_name', { ascending: true, nullsFirst: false })
            .order('sort_order', { ascending: true, nullsFirst: false })
            .order('carta_nombre', { ascending: true });

    let { data, error } = await menuOrder(CARTA_DIGITAL_MENU_COLUMNS_WITH_SCALE);
    if (error && isCartaPhotoScaleColumnError(error.message)) {
        ({ data, error } = await menuOrder(CARTA_DIGITAL_MENU_COLUMNS));
    }
    if (error && isCartaDualRacionColumnError(error.message)) {
        ({ data, error } = await menuOrder(CARTA_DIGITAL_MENU_COLUMNS_BASE));
    }

    if (error) {

        return (

            <div className="min-h-screen bg-white px-4 py-10">

                <div

                    className="mx-auto max-w-2xl rounded-xl border border-red-200 bg-red-50 p-4 text-center shadow-sm"

                    role="alert"

                >

                    <p className="text-sm font-bold text-red-800">No se pudo cargar la carta.</p>

                    <p className="mt-1 font-mono text-xs text-red-700">{error.message}</p>

                </div>

            </div>

        );

    }



    return (

        <StaffCartaView

            items={(data ?? []) as unknown as DigitalMenuRow[]}

            menuCategories={menuCategories.map((c) => ({

                id: c.id,

                name: c.name,

                parent_id: c.parent_id,

                sort_order: c.sort_order,

                slug: c.slug ?? null,

            }))}

            categoryCoverById={categoryCoverById}

            categoryCoverScaleById={categoryCoverScaleById}

            canEditMenu={canEditMenu}

            canOpenMapeo={canOpenMapeo}

        />

    );

}

