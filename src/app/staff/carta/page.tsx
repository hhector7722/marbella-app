import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { StaffCartaView } from '@/components/staff/StaffCartaView';
import type { DigitalMenuRow } from '@/components/staff/MenuAccordion';

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

    const { data, error } = await supabase
        .from('v_digital_menu_items')
        .select(
            'articulo_id, articulo_nombre, carta_nombre, carta_nombre_es, carta_nombre_ca, carta_nombre_en, departamento_id, departamento_nombre, category_id, category_parent_id, category_parent_name, category_parent_sort_order, category_parent_cover_photo_url, category_child_id, category_child_name, category_child_sort_order, recipe_id, recipe_name, descripcion, precio, photo_url, sort_order'
        )
        .order('category_parent_sort_order', { ascending: true, nullsFirst: false })
        .order('category_parent_name', { ascending: true, nullsFirst: false })
        .order('category_child_sort_order', { ascending: true, nullsFirst: false })
        .order('category_child_name', { ascending: true, nullsFirst: false })
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('carta_nombre', { ascending: true });

    if (error) {
        return (
            <div className="min-h-screen bg-[#5B8FB9] px-4 py-10">
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
            canEditMenu={canEditMenu}
            canOpenMapeo={canOpenMapeo}
        />
    );
}
