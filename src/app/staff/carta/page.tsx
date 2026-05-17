import { redirect } from 'next/navigation';

import { createClient } from '@/utils/supabase/server';

import { StaffCartaView } from '@/components/staff/StaffCartaView';

import type { DigitalMenuRow } from '@/components/staff/MenuAccordion';

import { resolveMenuCategoryCoverById, splitMenuCategoryCovers } from '@/lib/carta-category-covers';



export default async function StaffCartaPage() {

    const supabase = await createClient();

    const {

        data: { user },

    } = await supabase.auth.getUser();



    if (!user) {

        redirect('/login');

    }



    const { data: profile, error: profileError } = await supabase

        .from('profiles')

        .select('role')

        .eq('id', user.id)

        .maybeSingle();



    if (profileError) {

        console.error('Error fetching profile role (staff/carta):', profileError);

    }



    const role = (profile?.role ?? null) as string | null;

    const canEditMenu = role === 'manager' || role === 'admin' || role === 'supervisor';

    const canOpenMapeo = role === 'manager' || role === 'admin';



    const { data: menuCategories, error: catError } = await supabase

        .from('categories')

        .select('id, name, parent_id, sort_order, slug, cover_articulo_id')

        .eq('scope', 'menu')

        .order('sort_order', { ascending: true });



    if (catError) {

        console.error('Error fetching menu categories (staff/carta):', catError);

    }



    let categoryCoverById: Record<string, string | null> = {};

    let categoryCoverScaleById: Record<string, 's' | 'm' | 'l'> = {};

    try {

        const resolved = await resolveMenuCategoryCoverById(

            supabase,

            (menuCategories ?? []).map((c) => ({

                id: c.id,

                cover_articulo_id: c.cover_articulo_id ?? null,

            }))

        );

        const split = splitMenuCategoryCovers(resolved);

        categoryCoverById = split.categoryCoverById;

        categoryCoverScaleById = split.categoryCoverScaleById;

    } catch (e) {

        console.error('resolveMenuCategoryCoverById (staff/carta):', e);

    }



    const { data, error } = await supabase

        .from('v_digital_menu_items')

        .select(

            'articulo_id, articulo_nombre, carta_nombre, carta_nombre_es, carta_nombre_ca, carta_nombre_en, departamento_id, departamento_nombre, category_id, category_parent_id, category_parent_name, category_parent_name_es, category_parent_name_ca, category_parent_name_en, category_parent_sort_order, category_parent_cover_photo_url, category_child_id, category_child_name, category_child_name_es, category_child_name_ca, category_child_name_en, category_child_sort_order, category_child_slug, recipe_id, recipe_name, descripcion, precio, photo_url, carta_photo_scale, sort_order, tpv_factor_porcion, plato_marbella_slot, plato_marbella_is_menu_price'

        )

        .order('category_parent_sort_order', { ascending: true, nullsFirst: false })

        .order('category_parent_name', { ascending: true, nullsFirst: false })

        .order('category_child_sort_order', { ascending: true, nullsFirst: false })

        .order('category_child_name', { ascending: true, nullsFirst: false })

        .order('sort_order', { ascending: true, nullsFirst: false })

        .order('carta_nombre', { ascending: true });



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

            items={(data ?? []) as DigitalMenuRow[]}

            menuCategories={(menuCategories ?? []).map((c) => ({

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

