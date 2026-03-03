'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';

export async function linkTpvToRecipe(articuloId: number, recipeId: string, factorPorcion: number) {
    const supabase = await createClient();

    // Verify auth user to enforce DB Supabase Master rule
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return { success: false, error: 'Unauthorized' };
    }

    // Optional: check profile role if needed, but assuming user has access to /admin

    // Upsert the link in the database
    const { error } = await supabase
        .from('map_tpv_receta')
        .upsert(
            { articulo_id: articuloId, recipe_id: recipeId, factor_porcion: factorPorcion },
            { onConflict: 'articulo_id', ignoreDuplicates: false }
        );

    if (error) {
        console.error('Error linking TPV to recipe:', error);
        return { success: false, error: error.message };
    }

    revalidatePath('/admin/mapeo');
    return { success: true };
}
