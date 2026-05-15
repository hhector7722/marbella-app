import { createClient } from '@/utils/supabase/server';
import { MenuAccordion, type DigitalMenuRow } from '@/components/staff/MenuAccordion';

export async function DigitalMenu() {
    const supabase = await createClient();
        const { data, error } = await supabase
        .from('v_digital_menu_items')
        .select(
            'articulo_id, articulo_nombre, carta_nombre, carta_nombre_es, carta_nombre_ca, carta_nombre_en, departamento_id, departamento_nombre, category_id, category_parent_id, category_parent_name, category_parent_name_es, category_parent_name_ca, category_parent_name_en, category_parent_sort_order, category_parent_cover_photo_url, category_child_id, category_child_name, category_child_name_es, category_child_name_ca, category_child_name_en, category_child_sort_order, category_child_slug, recipe_id, recipe_name, descripcion, precio, photo_url, sort_order, tpv_factor_porcion, plato_marbella_slot, plato_marbella_is_menu_price'
        )
        .order('category_parent_sort_order', { ascending: true, nullsFirst: false })
        .order('category_parent_name', { ascending: true, nullsFirst: false })
        .order('category_child_sort_order', { ascending: true, nullsFirst: false })
        .order('category_child_name', { ascending: true, nullsFirst: false })
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('carta_nombre', { ascending: true });

    if (error) {
        return (
            <div
                className="rounded-xl border border-red-200 bg-red-50 p-4 text-center shadow-sm"
                role="alert"
            >
                <p className="text-sm font-bold text-red-800">No se pudo cargar la carta.</p>
                <p className="mt-1 font-mono text-xs text-red-700">{error.message}</p>
            </div>
        );
    }

    const items = (data ?? []) as DigitalMenuRow[];

    return <MenuAccordion items={items} />;
}
