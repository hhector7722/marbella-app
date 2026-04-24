import { createClient } from '@/utils/supabase/server';
import { MenuAccordion, type DigitalMenuRow } from '@/components/staff/MenuAccordion';

export async function DigitalMenu() {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('v_digital_menu_items')
        .select(
            'articulo_id, articulo_nombre, familia_id, familia_nombre, recipe_id, recipe_name, descripcion, precio, photo_url, sort_order'
        )
        .order('familia_nombre', { ascending: true, nullsFirst: false })
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('articulo_nombre', { ascending: true });

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
