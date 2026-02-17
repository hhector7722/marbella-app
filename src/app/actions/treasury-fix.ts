'use server';

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * ACCIÓN DE EMERGENCIA: Ajuste de saldo inicial solicitado por usuario.
 * Aplica un ajuste de -1828.53€ con fecha 13/02/2026 para que el saldo
 * final de ese día sea exactamente 336.21€.
 */
export async function applyInitialBalanceAdjustment() {
    const supabase = await createClient();

    // 1. Verificar si ya existe el ajuste para evitar duplicados
    const { data: existing } = await supabase
        .from('treasury_log')
        .select('id')
        .eq('notes', 'Ajuste saldo inicial (Manual a 336.21€ al día 13)')
        .maybeSingle();

    if (existing) {
        return { success: false, message: "El ajuste ya ha sido aplicado previamente." };
    }

    // 2. Obtener la caja operativa
    const { data: box, error: boxError } = await supabase
        .from('cash_boxes')
        .select('id')
        .eq('type', 'operational')
        .maybeSingle();

    if (boxError || !box) {
        return { success: false, message: "No se encontró la caja operativa." };
    }

    // 3. Aplicar el ajuste
    const { error: insError } = await supabase
        .from('treasury_log')
        .insert({
            box_id: box.id,
            type: 'ADJUSTMENT',
            amount: -1828.53,
            notes: 'Ajuste saldo inicial (Manual a 336.21€ al día 13)',
            created_at: '2026-02-13T23:59:59Z'
        });

    if (insError) {
        return { success: false, message: `Error al aplicar ajuste: ${insError.message}` };
    }

    revalidatePath('/dashboard/movements');
    revalidatePath('/dashboard');

    return { success: true, message: "Ajuste aplicado correctamente. El saldo ha sido corregido." };
}
