'use server';

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Recalcula todos los balances semanales desde el inicio de los tiempos.
 * Regla de oro: Los saldos positivos NO se arrastran a la semana siguiente
 * a menos que el empleado tenga prefer_stock_hours = true.
 */
export async function recalculateAllBalances() {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('rpc_recalculate_all_balances');

    if (error) {
        console.error("Error al recalcular balances (RPC):", error);
        throw new Error(`Error en RPC: ${error.message}`);
    }

    revalidatePath('/dashboard/labor');
    revalidatePath('/staff/history');
    revalidatePath('/dashboard');

    return { success: true, message: "Recálculo global completado con éxito." };
}
