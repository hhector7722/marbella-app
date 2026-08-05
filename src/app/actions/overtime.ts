'use server';

import { createClient } from "@/utils/supabase/server";
import { madridDayUtcRangeIso } from "@/lib/madrid-date-bounds";
import { calculateRoundedHours } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import {
    buildOvertimeWeeksFromSsot,
    type StaffWeeklyStats,
    type WeeklyStats,
} from '@/lib/hours-engine/overtime-weeks-ssot';
import {
    writeProjectionFromWeek,
    weekBounds,
    mondayOnOrBefore,
} from '@/lib/hours-engine';
import type { CivilDate } from '@/lib/hours-engine/types';

export type { StaffWeeklyStats, WeeklyStats };

/** Horas Marbella entre dos instantes ISO (misma regla que fn_round_marbella_hours en BD). */
function marbellaHoursBetweenClockIso(clockInIso: string, clockOutIso: string): number {
    const clockIn = new Date(clockInIso);
    const clockOut = new Date(clockOutIso);
    if (Number.isNaN(clockIn.getTime()) || Number.isNaN(clockOut.getTime())) return 0;
    const diffHours = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);
    if (diffHours <= 0) return 0;
    return calculateRoundedHours(diffHours);
}

function resolveClockInIso(log: {
    date: string;
    inTimeIso?: string;
    in_time?: string;
    event_type?: string;
}): string {
    if (log.inTimeIso) return log.inTimeIso;
    if (log.in_time) {
        const [inH, inM] = log.in_time.split(':').map(Number);
        const d = new Date(log.date + 'T00:00:00');
        d.setHours(inH, inM, 0, 0);
        return d.toISOString();
    }
    if (log.event_type && log.event_type !== 'regular') {
        const d = new Date(log.date + 'T00:00:00');
        d.setHours(9, 0, 0, 0);
        return d.toISOString();
    }
    return '';
}

function resolveClockOutIso(
    log: {
        date: string;
        outTimeIso?: string;
        out_time?: string;
        in_time?: string;
        event_type?: string;
    },
    clockInIso: string
): string | null {
    if (log.outTimeIso) return log.outTimeIso;
    if (log.out_time) {
        const [outH, outM] = log.out_time.split(':').map(Number);
        const d = new Date(log.date + 'T00:00:00');
        d.setHours(outH, outM, 0, 0);
        if (log.in_time) {
            const [inH] = log.in_time.split(':').map(Number);
            if (outH < inH) d.setDate(d.getDate() + 1);
        }
        return d.toISOString();
    }
    // Solo tipos especiales sin salida explícita: conservar ventana por defecto 09–17 para persistir en BD
    if (log.event_type && log.event_type !== 'regular' && clockInIso) {
        const d = new Date(clockInIso);
        d.setHours(d.getHours() + 8);
        return d.toISOString();
    }
    return null;
}

const EMPTY_OVERTIME = {
    weeksResult: [] as WeeklyStats[],
    summary: { totalCost: 0, totalHours: 0, totalOvertimeCost: 0 }
};

/**
 * Listado de horas extras / nómina semanal.
 * Fuente: Hours Engine + Cost Engine (liquidateWeekForCard) vía read-model SSOT.
 */
export async function getOvertimeData(startDate: string, endDate: string, userId?: string) {
    try {
        const supabase = await createClient();
        return await buildOvertimeWeeksFromSsot(supabase, {
            startDate,
            endDate,
            userId: userId ?? null,
            onlyCompletedWeeks: true,
        });
    } catch (e) {
        console.error("getOvertimeData failed:", e);
        return EMPTY_OVERTIME;
    }
}

export async function togglePaidStatus(userId: string, weekStart: string, newStatus: boolean, _stats?: { totalHours: number, overtimeHours: number }) {
    const supabase = await createClient();
    const weekMonday = mondayOnOrBefore(weekStart.split('T')[0]! as CivilDate);
    const { weekEnd } = weekBounds(weekMonday);

    const { data: existing } = await supabase
        .from('weekly_snapshots')
        .select('id')
        .eq('user_id', userId)
        .eq('week_start', weekMonday)
        .maybeSingle();

    if (existing) {
        const { error } = await supabase
            .from('weekly_snapshots')
            .update({ is_paid: newStatus })
            .eq('id', existing.id);
        if (error) throw error;
    } else {
        // Registro mínimo (B + identidad). contracted_hours_snapshot NOT NULL → placeholder;
        // Writer sobrescribe todas las columnas C.
        const { error } = await supabase
            .from('weekly_snapshots')
            .insert({
                user_id: userId,
                week_start: weekMonday,
                week_end: weekEnd,
                is_paid: newStatus,
                contracted_hours_snapshot: 0,
            });
        if (error) throw error;
    }

    const prop = await writeProjectionFromWeek(
        supabase,
        userId,
        weekMonday,
        'toggle_paid',
    );
    if (!prop.ok) {
        throw new Error(
            `is_paid actualizado; falló Writer de proyección: ${prop.error}`,
        );
    }

    revalidatePath('/staff/history');
    revalidatePath('/dashboard/overtime');
    revalidatePath('/dashboard');

    return { success: true };
}

export async function updateWeeklyContractHours(userId: string, weekStart: string, _newHours: number) {
    const supabase = await createClient();

    try {
        // contracted_hours_snapshot es columna C: solo Writer (HE). Regenerar proyección.
        const weekMonday = mondayOnOrBefore(weekStart.split('T')[0]! as CivilDate);
        const prop = await writeProjectionFromWeek(
            supabase,
            userId,
            weekMonday,
            'recalc',
        );
        if (!prop.ok) {
            return { success: false, error: prop.error };
        }

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
        const weekMonday = mondayOnOrBefore(weekStart.split('T')[0]! as CivilDate);
        const { weekEnd } = weekBounds(weekMonday);
        const newStatus = !currentStatus;

        const { data: existing } = await supabase
            .from('weekly_snapshots')
            .select('id')
            .eq('user_id', userId)
            .eq('week_start', weekMonday)
            .maybeSingle();

        if (existing) {
            const { error } = await supabase
                .from('weekly_snapshots')
                .update({ prefer_stock_hours_override: newStatus })
                .eq('id', existing.id);
            if (error) {
                return { success: false, error: error.message };
            }
        } else {
            const { error } = await supabase
                .from('weekly_snapshots')
                .insert({
                    user_id: userId,
                    week_start: weekMonday,
                    week_end: weekEnd,
                    prefer_stock_hours_override: newStatus,
                    contracted_hours_snapshot: 0,
                });
            if (error) {
                return { success: false, error: error.message };
            }
        }

        const prop = await writeProjectionFromWeek(
            supabase,
            userId,
            weekMonday,
            'recalc',
        );
        if (!prop.ok) {
            return { success: false, error: prop.error };
        }

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
        overtimeCostPerHour?: number | null;
        logs?: Array<{ date: string; in_time: string; out_time: string; event_type: string; id?: string; is_deleted?: boolean }>;
    }
) {
    console.log('[TRACE 3] Parámetro recibido por updateWeeklyWorkerConfig:', {
        userId,
        weekStart,
        updates,
    });
    const supabase = await createClient();

    try {
        const weekMonday = mondayOnOrBefore(weekStart.split('T')[0]! as CivilDate);
        const { weekEnd } = weekBounds(weekMonday);

        // Solo columnas B (overrides). contractedHours es C → lo materializa el Writer/HE.
        const hasB =
            updates.preferStock !== undefined ||
            updates.overtimeCostPerHour !== undefined;

        if (hasB) {
            const { data: existing } = await supabase
                .from('weekly_snapshots')
                .select('id')
                .eq('user_id', userId)
                .eq('week_start', weekMonday)
                .maybeSingle();

            const bPatch: Record<string, unknown> = {};
            if (updates.preferStock !== undefined) {
                bPatch.prefer_stock_hours_override = updates.preferStock;
            }
            if (updates.overtimeCostPerHour !== undefined) {
                bPatch.overtime_price_snapshot = updates.overtimeCostPerHour;
            }

            if (existing) {
                const { error: snapshotError } = await supabase
                    .from('weekly_snapshots')
                    .update(bPatch)
                    .eq('id', existing.id);
                if (snapshotError) throw snapshotError;
            } else {
                const { error: snapshotError } = await supabase
                    .from('weekly_snapshots')
                    .insert({
                        user_id: userId,
                        week_start: weekMonday,
                        week_end: weekEnd,
                        contracted_hours_snapshot: 0,
                        ...bPatch,
                    });
                if (snapshotError) throw snapshotError;
            }
        }

        // Process logs: batch delete + single upsert (escalabilidad)
        if (updates.logs && updates.logs.length > 0) {
            const logs = updates.logs as any[];

            const idsToDelete = logs.filter((l) => l.is_deleted && l.id).map((l) => l.id);
            if (idsToDelete.length > 0) {
                const { error: delErr } = await supabase.from('time_logs').delete().in('id', idsToDelete);
                if (delErr) throw delErr;
            }

            const toUpdate: Record<string, unknown>[] = [];
            const toInsert: Record<string, unknown>[] = [];

            for (const log of logs.filter((l) => !l.is_deleted)) {
                const clockInStr = resolveClockInIso(log);
                const clockOutStr = resolveClockOutIso(log, clockInStr);

                let totalHours = 0;
                if (log.total_hours_override !== undefined && log.total_hours_override !== null) {
                    totalHours = Number(log.total_hours_override);
                } else if (clockInStr && clockOutStr) {
                    totalHours = marbellaHoursBetweenClockIso(clockInStr, clockOutStr);
                }

                const justifiedHours = Math.max(0, Number(log.justified_hours) || 0);

                if (!clockInStr) {
                    throw new Error('Falta hora de entrada en un registro de asistencia');
                }

                const payload: Record<string, unknown> = {
                    user_id: userId,
                    clock_in: clockInStr,
                    clock_out: clockOutStr,
                    total_hours: Number.isFinite(totalHours) ? totalHours : null,
                    justified_hours: justifiedHours,
                    event_type: log.event_type || 'regular',
                    clock_out_show_no_registrada: log.clock_out_show_no_registrada === true,
                };

                if (typeof log.id === 'string' && log.id.length > 0) {
                    payload.id = log.id;
                    toUpdate.push(payload);
                } else {
                    toInsert.push(payload);
                }
            }

            if (toUpdate.length > 0) {
                const { error: upsertErr } = await supabase
                    .from('time_logs')
                    .upsert(toUpdate, { onConflict: 'id' });
                if (upsertErr) throw upsertErr;
            }
            if (toInsert.length > 0) {
                const { error: insertErr } = await supabase.from('time_logs').insert(toInsert);
                if (insertErr) throw insertErr;
            }
        }

        const prop = await writeProjectionFromWeek(
            supabase,
            userId,
            weekMonday,
            'recalc',
        );
        if (!prop.ok) throw new Error(prop.error);

        revalidatePath('/staff/history');
        revalidatePath('/dashboard');
        revalidatePath('/dashboard/overtime');

        return { success: true };
    } catch (e: any) {
        console.error('Error in updateWeeklyWorkerConfig:', e);
        return { success: false, error: e.message };
    }
}

/**
 * Crea un fichaje (entrada) en nombre de un empleado. Solo managers.
 */
export async function createManagerFichaje(userId: string, dateStr: string, timeStr: string): Promise<{ success: boolean; error?: string }> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: 'No autenticado' };

        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        if (profile?.role !== 'manager') return { success: false, error: 'Solo managers pueden crear fichajes' };

        const [y, m, d] = dateStr.split('-').map(Number);
        const [h, min] = timeStr.split(':').map(Number);
        if (!y || !m || !d || h === undefined || min === undefined) return { success: false, error: 'Fecha u hora inválida' };
        const clockInDate = new Date(y, m - 1, d, h, min, 0, 0);
        const clockInIso = clockInDate.toISOString();

        const { error: insertErr } = await supabase.from('time_logs').insert({
            user_id: userId,
            clock_in: clockInIso,
            clock_out: null,
            event_type: 'regular',
            clock_out_show_no_registrada: false,
        });

        if (insertErr) throw insertErr;

        const weekMonday = mondayOnOrBefore(dateStr as CivilDate);
        const prop = await writeProjectionFromWeek(
            supabase,
            userId,
            weekMonday,
            'fichaje',
        );
        if (!prop.ok) throw new Error(prop.error);

        revalidatePath('/staff/history');
        revalidatePath('/dashboard');
        revalidatePath('/dashboard/overtime');
        return { success: true };
    } catch (e: any) {
        console.error('createManagerFichaje:', e);
        return { success: false, error: e.message ?? 'Error al crear fichaje' };
    }
}

/**
 * Elimina todos los registros de asistencia de un trabajador para un día concreto. Solo managers.
 */
export async function deleteManagerDayLogs(userId: string, dateStr: string): Promise<{ success: boolean; error?: string }> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { success: false, error: 'No autenticado' };

        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        if (profile?.role !== 'manager') return { success: false, error: 'Solo managers pueden eliminar registros' };

        const [y, m, d] = dateStr.split('-').map(Number);
        if (!y || !m || !d) return { success: false, error: 'Fecha inválida' };

        const { startIso, endIso } = madridDayUtcRangeIso(dateStr);

        const { data: deletedRows, error: deleteErr } = await supabase
            .from('time_logs')
            .delete()
            .eq('user_id', userId)
            .gte('clock_in', startIso)
            .lte('clock_in', endIso)
            .select('id');

        if (deleteErr) throw deleteErr;
        if (!deletedRows?.length) {
            return { success: false, error: 'No se encontró ningún fichaje para ese día' };
        }

        const weekMonday = mondayOnOrBefore(dateStr as CivilDate);
        const prop = await writeProjectionFromWeek(
            supabase,
            userId,
            weekMonday,
            'fichaje',
        );
        if (!prop.ok) throw new Error(prop.error);

        revalidatePath('/staff/history');
        revalidatePath('/dashboard');
        revalidatePath('/dashboard/overtime');

        return { success: true };
    } catch (e: any) {
        console.error('deleteManagerDayLogs:', e);
        return { success: false, error: e.message ?? 'Error al eliminar registros' };
    }
}
