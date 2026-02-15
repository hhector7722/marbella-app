'use server';

import { createClient } from "@/utils/supabase/server";
import { startOfWeek, endOfWeek, format, parseISO, addWeeks, isBefore, isAfter } from "date-fns";
import { revalidatePath } from "next/cache";

/**
 * Recalcula todos los balances semanales desde el inicio de los tiempos.
 * Regla de oro: Los saldos positivos NO se arrastran a la semana siguiente
 * a menos que el empleado tenga prefer_stock_hours = true.
 */
export async function recalculateAllBalances() {
    const supabase = await createClient();

    // 1. Obtener todos los perfiles
    const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, role, contracted_hours_weekly, prefer_stock_hours, is_fixed_salary, hours_balance');

    if (profilesError || !profiles) {
        throw new Error(`Error al obtener perfiles: ${profilesError?.message}`);
    }

    // 2. Obtener el primer fichaje para saber desde cuándo empezar
    const { data: firstLog, error: firstLogError } = await supabase
        .from('time_logs')
        .select('clock_in')
        .order('clock_in', { ascending: true })
        .limit(1)
        .maybeSingle();

    if (!firstLog) {
        return { success: true, message: "No hay fichajes que procesar." };
    }

    const firstDate = new Date(firstLog.clock_in);
    let currentMonday = startOfWeek(firstDate, { weekStartsOn: 1 });
    currentMonday.setHours(0, 0, 0, 0);

    // Fin: El lunes de la semana actual (no recalculamos la semana en curso aún o sí?)
    // Vamos a recalcular hasta la semana pasada completa.
    const today = new Date();
    const currentWeekMonday = startOfWeek(today, { weekStartsOn: 1 });
    currentWeekMonday.setHours(0, 0, 0, 0);

    // Mapa para mantener el balance final de la semana anterior por usuario
    // Inicializamos con el balance base del perfil (si lo hubiera, aunque normalmente el histórico es lo que manda)
    const userBalanceMap = new Map<string, number>();
    profiles.forEach(p => {
        // El balance inicial del perfil se considera el "punto de partida" histórico antes del primer log
        userBalanceMap.set(p.id, p.hours_balance || 0);
    });

    console.log(`Iniciando recalculo desde ${format(currentMonday, 'yyyy-MM-dd')}`);

    // 3. Iterar semana a semana
    while (isBefore(currentMonday, currentWeekMonday)) {
        const weekStartStr = format(currentMonday, 'yyyy-MM-dd');
        const nextMonday = addWeeks(currentMonday, 1);
        const weekEndStr = format(new Date(nextMonday.getTime() - 1), 'yyyy-MM-dd');

        // Obtener logs de esta semana
        const { data: weekLogs, error: weekLogsError } = await supabase
            .from('time_logs')
            .select('user_id, total_hours')
            .gte('clock_in', currentMonday.toISOString())
            .lt('clock_in', nextMonday.toISOString());

        if (weekLogsError) throw weekLogsError;

        // Sumar horas por usuario esta semana
        const userHoursThisWeek = new Map<string, number>();
        weekLogs.forEach(log => {
            if (log.total_hours) {
                const current = userHoursThisWeek.get(log.user_id) || 0;
                userHoursThisWeek.set(log.user_id, current + log.total_hours);
            }
        });

        const isAugust = currentMonday.getMonth() === 7;
        const snapshotsToUpsert = [];

        // 2.2 Obtener snapshots existentes para preservar is_paid y contracted_hours_snapshot
        const { data: existingSnapshots } = await supabase
            .from('weekly_snapshots')
            .select('user_id, week_start, is_paid, contracted_hours_snapshot')
            .eq('week_start', weekStartStr);

        for (const profile of profiles) {
            const userId = profile.id;
            const hoursWorked = userHoursThisWeek.get(userId) || 0;

            // Si existe un snapshot, usamos sus horas de contrato históricas, si no, las del perfil
            const existingSnapshot = existingSnapshots?.find(s => s.user_id === userId);
            const limit = existingSnapshot?.contracted_hours_snapshot ?? (profile.contracted_hours_weekly ?? 40);

            const isManager = profile.role === 'manager';
            const isFixedSalary = profile.is_fixed_salary || false;
            const preferStock = profile.prefer_stock_hours || false;

            // Lógica de Agosto y Roles
            const weeklyBalance = (isAugust || isManager || isFixedSalary) ? hoursWorked : (hoursWorked - limit);

            // Balance que arrastra de la semana anterior
            let pendingFromPrev = userBalanceMap.get(userId) || 0;

            // --- REGLA CRÍTICA: NO ARRASTRAR POSITIVOS SI NO ES STOCK ---
            if (!preferStock && pendingFromPrev > 0) {
                pendingFromPrev = 0;
            }

            const finalBalance = pendingFromPrev + weeklyBalance;

            // Actualizar mapa para la siguiente semana
            userBalanceMap.set(userId, finalBalance);

            // Preservar is_paid si ya existía
            const wasPaid = existingSnapshot?.is_paid || false;

            // Preparar snapshot
            snapshotsToUpsert.push({
                user_id: userId,
                week_start: weekStartStr,
                week_end: weekEndStr,
                contracted_hours_snapshot: limit,
                total_hours: hoursWorked,
                balance_hours: weeklyBalance,
                pending_balance: pendingFromPrev,
                final_balance: finalBalance,
                is_paid: wasPaid
            });
        }

        // Upsert snapshots de esta semana
        if (snapshotsToUpsert.length > 0) {
            const { error: upsertError } = await supabase
                .from('weekly_snapshots')
                .upsert(snapshotsToUpsert, { onConflict: 'user_id, week_start' });

            if (upsertError) console.error(`Error upserting snapshots for ${weekStartStr}:`, upsertError);
        }

        // Avanzar a la siguiente semana
        currentMonday = nextMonday;
    }

    revalidatePath('/dashboard/labor');
    revalidatePath('/staff/history');
    revalidatePath('/dashboard');

    return { success: true, message: "Recálculo global completado con éxito." };
}
