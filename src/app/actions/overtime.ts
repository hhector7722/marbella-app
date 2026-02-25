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

export async function togglePreferStockStatus(userId: string, weekStart: string, currentStatus: boolean) {
    const supabase = await createClient();

    try {
        // 1. Calcular fin de semana para el insert (si no existe)
        const startDate = new Date(weekStart);
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        const weekEnd = endDate.toISOString().split('T')[0];

        // 2. Invertimos el estado (si era true pasa a false, si era false pasa a true)
        const newStatus = !currentStatus;

        // 3. Upsert snapshot con el override
        const { error } = await supabase
            .from('weekly_snapshots')
            .upsert({
                user_id: userId,
                week_start: weekStart,
                week_end: weekEnd,
                prefer_stock_hours_override: newStatus,
                // Valores mínimos de seguridad para evitar errores de restricción
                total_hours: 0,
                balance_hours: 0,
                pending_balance: 0,
                final_balance: 0,
                is_paid: false,
                contracted_hours_snapshot: 0 // Se corregirá en la propagación
            }, { onConflict: 'user_id, week_start' });

        if (error) {
            console.error('Error in togglePreferStockStatus upsert:', error);
            return { success: false, error: error.message };
        }

        // 4. Disparar propagación de balances DESDE esa semana
        const { error: rpcError } = await supabase.rpc('fn_recalc_and_propagate_snapshots', {
            p_user_id: userId,
            p_start_date: weekStart
        });

        if (rpcError) {
            console.error('Error in RPC propagation (togglePreferStockStatus):', rpcError);
            return { success: false, error: rpcError.message };
        }

        // 5. Revalidar paths
        revalidatePath('/staff/history');
        revalidatePath('/dashboard/overtime');
        revalidatePath('/dashboard');

        return { success: true, newStatus };
    } catch (e: any) {
        console.error('Exception in togglePreferStockStatus:', e);
        return { success: false, error: e.message };
    }
}

export async function updateWeeklyWorkerConfig(
    userId: string,
    weekStart: string,
    updates: {
        contractedHours?: number;
        preferStock?: boolean;
        logs?: Array<{ date: string; in_time: string; out_time: string; event_type: string; id?: string; is_deleted?: boolean }>;
    }
) {
    const supabase = await createClient();

    try {
        // 1. Prepare Snapshot Data
        const startDate = new Date(weekStart);
        const endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        const weekEnd = endDate.toISOString().split('T')[0];

        const snapshotData: any = {
            user_id: userId,
            week_start: weekStart,
            week_end: weekEnd,
            // Fallbacks for insert
            total_hours: 0,
            balance_hours: 0,
            pending_balance: 0,
            final_balance: 0,
            is_paid: false
        };

        if (updates.contractedHours !== undefined) {
            snapshotData.contracted_hours_snapshot = updates.contractedHours;
        }
        if (updates.preferStock !== undefined) {
            snapshotData.prefer_stock_hours_override = updates.preferStock;
        }

        // 2. Perform upsert if there are overrides
        if (Object.keys(snapshotData).length > 8) { // basic fields count + overrides
            const { error: snapshotError } = await supabase
                .from('weekly_snapshots')
                .upsert(snapshotData, { onConflict: 'user_id, week_start' });

            if (snapshotError) throw snapshotError;
        }

        // 3. Process logs if provided
        if (updates.logs && updates.logs.length > 0) {
            for (const log of updates.logs as any[]) {
                if (log.is_deleted && log.id) {
                    await supabase.from('time_logs').delete().eq('id', log.id);
                    continue;
                }
                if (log.is_deleted) continue;

                let clockInStr = '';
                let clockOutStr = null;
                let totalHours = 0;

                // Preferir las fechas procesadas en cliente que ya traen corrección de TimeZone
                if (log.inTimeIso) {
                    clockInStr = log.inTimeIso;
                } else if (log.in_time) {
                    // Fallback de retrocompatibilidad
                    const [inH, inM] = log.in_time.split(':').map(Number);
                    const clockInFallback = new Date(log.date + "T00:00:00");
                    clockInFallback.setHours(inH, inM, 0, 0);
                    clockInStr = clockInFallback.toISOString();
                } else if (log.event_type !== 'regular') {
                    // Si no hay hora de entrada pero es un evento especial, asignamos 09:00 por defecto
                    const clockInFallback = new Date(log.date + "T00:00:00");
                    clockInFallback.setHours(9, 0, 0, 0);
                    clockInStr = clockInFallback.toISOString();
                }

                if (log.event_type !== 'regular') {
                    totalHours = 8;
                    if (log.outTimeIso) {
                        clockOutStr = log.outTimeIso;
                    } else if (log.out_time) {
                        const [outH, outM] = log.out_time.split(':').map(Number);
                        const dOutFallback = new Date(log.date + "T00:00:00");
                        dOutFallback.setHours(outH, outM, 0, 0);
                        clockOutStr = dOutFallback.toISOString();
                    } else {
                        // Si no hay hora de salida pero es un evento especial, asignamos 8 horas después (17:00)
                        const dOutFallback = new Date(clockInStr);
                        dOutFallback.setHours(dOutFallback.getHours() + 8);
                        clockOutStr = dOutFallback.toISOString();
                    }
                } else if (log.outTimeIso || log.out_time) {
                    if (log.outTimeIso) {
                        clockOutStr = log.outTimeIso;
                    } else {
                        const [outH, outM] = log.out_time.split(':').map(Number);
                        const dOutFallback = new Date(log.date + "T00:00:00");
                        dOutFallback.setHours(outH, outM, 0, 0);
                        clockOutStr = dOutFallback.toISOString();
                    }

                    // Simple rounding for immediate total_hours
                    const clockIn = new Date(clockInStr);
                    const dOut = new Date(clockOutStr);
                    const diff = (dOut.getTime() - clockIn.getTime()) / (1000 * 60);
                    const hTotal = Math.floor(diff / 60);
                    const mTotal = diff % 60;
                    let fraction = 0;
                    if (mTotal > 20) fraction = 0.5;
                    if (mTotal > 50) fraction = 1.0;
                    totalHours = Math.max(0, hTotal + fraction);
                }

                const logPayload = {
                    user_id: userId,
                    clock_in: clockInStr,
                    clock_out: clockOutStr,
                    total_hours: totalHours || null,
                    event_type: log.event_type
                };

                if (log.id) {
                    const { error: updateErr } = await supabase.from('time_logs').update(logPayload).eq('id', log.id);
                    if (updateErr) throw updateErr;
                } else {
                    const { error: insertErr } = await supabase.from('time_logs').insert([logPayload]);
                    if (insertErr) throw insertErr;
                }
            }
        }

        // 4. Trigger propagation
        const { error: rpcError } = await supabase.rpc('fn_recalc_and_propagate_snapshots', {
            p_user_id: userId,
            p_start_date: weekStart
        });

        if (rpcError) throw rpcError;

        revalidatePath('/registros');
        revalidatePath('/dashboard');
        revalidatePath('/dashboard/overtime');

        return { success: true };
    } catch (e: any) {
        console.error('Error in updateWeeklyWorkerConfig:', e);
        return { success: false, error: e.message };
    }
}
