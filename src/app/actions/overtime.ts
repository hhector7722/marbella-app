'use server';

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

export interface StaffWeeklyStats {
    id: string;
    name: string;
    role: string;
    totalHours: number;
    regularHours: number;
    overtimeHours: number;
    totalCost: number;
    regularCost: number;
    overtimeCost: number;
    isPaid: boolean;
    preferStock?: boolean;
}

export interface WeeklyStats {
    weekId: string;
    label: string;
    startDate: Date;
    totalAmount: number;
    totalHours: number;
    staff: StaffWeeklyStats[];
}

export async function getOvertimeData(startDate: string, endDate: string, userId?: string) {
    const supabase = await createClient();

    // 1. Invocamos la RPC centralizada que realiza la agregación, redondeo y balance en DB
    // Ahora pasamos userId directamente para que el filtrado ocurra en PostgreSQL (Eficiencia Max)
    const { data, error } = await supabase.rpc('get_weekly_worker_stats', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_user_id: userId
    });

    if (error) {
        console.error("Error fetching overtime data from RPC:", error);
        return { weeksResult: [], summary: { totalCost: 0, totalHours: 0, totalOvertimeCost: 0 } };
    }

    // Node.js no realiza procesamiento de arrays; solo retorna el resultado de la RPC
    return data as {
        weeksResult: WeeklyStats[],
        summary: {
            totalCost: number;
            totalHours: number;
            totalOvertimeCost: number;
        }
    };
}

export async function togglePaidStatus(userId: string, weekStart: string, newStatus: boolean, stats?: { totalHours: number, overtimeHours: number }) {
    const supabase = await createClient();

    // 1. Check if snapshot exists
    const { data: existing } = await supabase
        .from('weekly_snapshots')
        .select('id')
        .eq('user_id', userId)
        .eq('week_start', weekStart)
        .maybeSingle();

    if (existing) {
        const { error } = await supabase
            .from('weekly_snapshots')
            .update({ is_paid: newStatus })
            .eq('id', existing.id);
        if (error) throw error;
    } else {
        // Create with provided stats or defaults
        const { error } = await supabase
            .from('weekly_snapshots')
            .insert({
                user_id: userId,
                week_start: weekStart,
                is_paid: newStatus,
                total_hours: stats?.totalHours || 0,
                balance_hours: stats?.overtimeHours || 0,
                pending_balance: 0,
                final_balance: stats?.overtimeHours || 0,
                contracted_hours_snapshot: 40 // Default, trigger will fix it
            });
        if (error) throw error;
    }

    // 2. Revalidate paths to clear cache
    revalidatePath('/staff/history');
    revalidatePath('/dashboard/overtime');
    revalidatePath('/dashboard');

    return { success: true };
}

export async function updateWeeklyContractHours(userId: string, weekStart: string, newHours: number) {
    const supabase = await createClient();

    try {
        // Calcular fin de semana para el insert (si no existe)
        const startDate = new Date(weekStart);
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        const weekEnd = endDate.toISOString().split('T')[0];

        // 1. Upsert snapshot with new contracted hours
        // Incluimos week_end para evitar fallos si el registro es nuevo
        const { error } = await supabase
            .from('weekly_snapshots')
            .upsert({
                user_id: userId,
                week_start: weekStart,
                week_end: weekEnd,
                contracted_hours_snapshot: newHours,
                // Ponemos valores por defecto mínimos si es un INSERT
                total_hours: 0,
                balance_hours: 0,
                pending_balance: 0,
                final_balance: 0,
                is_paid: false
            }, { onConflict: 'user_id, week_start' });

        if (error) {
            console.error('Error in upsert:', error);
            return { success: false, error: error.message };
        }

        // 2. Trigger propagation starting from that week
        const { error: rpcError } = await supabase.rpc('fn_recalc_and_propagate_snapshots', {
            p_user_id: userId,
            p_start_date: weekStart
        });

        if (rpcError) {
            console.error('Error in RPC propagation:', rpcError);
            return { success: false, error: rpcError.message };
        }

        // 3. Revalidate paths
        revalidatePath('/staff/history');
        revalidatePath('/dashboard/overtime');
        revalidatePath('/dashboard');

        return { success: true };
    } catch (e: any) {
        console.error('Exception in updateWeeklyContractHours:', e);
        return { success: false, error: e.message };
    }
}
