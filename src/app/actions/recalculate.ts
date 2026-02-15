'use server';

import { createClient } from "@/utils/supabase/server";
import { calculateRoundedHours } from "@/lib/utils";
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
        .select('id, first_name, last_name, role, contracted_hours_weekly, prefer_stock_hours, is_fixed_salary, hours_balance, joining_date');

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
        // [FIX] Inicializamos el balance en 0 para reconstruir la historia limpiamente.
        // Usar p.hours_balance aquí era un error porque sumaba el balance actual al inicio de los tiempos.
        userBalanceMap.set(p.id, 0);
    });

    console.log(`Iniciando recalculo desde ${format(currentMonday, 'yyyy-MM-dd')}`);

    // 3. Iterar semana a semana
    while (isBefore(currentMonday, currentWeekMonday)) {
        const weekStartStr = format(currentMonday, 'yyyy-MM-dd');
        const nextMonday = addWeeks(currentMonday, 1);
        const weekEndStr = format(new Date(nextMonday.getTime() - 1), 'yyyy-MM-dd');
        const weekEndDate = new Date(nextMonday.getTime() - 1); // Sunday end of day

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

            // [JOINING DATE CHECK]
            // Si el perfil tiene fecha de incorporación, y el fin de esta semana es ANTERIOR a esa fecha,
            // SALTAMOS el cálculo para este usuario (no generamos snapshot 0 ni nada).
            // Esto evita llenar el histórico de semanas vacías.
            if (profile.joining_date) {
                const joiningDate = parseISO(profile.joining_date);
                // Si la semana termina ANTES de que el usuario se incorpore, saltar.
                // Ejemplo: Semana termina el 7 Enero, Usuario entra el 10 Enero -> Salta.
                // Ejemplo: Semana termina el 14 Enero, Usuario entra el 10 Enero -> Procesa (semana parcial o completa).
                if (isBefore(weekEndDate, joiningDate)) {
                    // [CLEANUP] Si existe un snapshot antiguo para una semana donde no debería estar, lo borramos.
                    const existingSnapshotToDelete = existingSnapshots?.find(s => s.user_id === userId);
                    if (existingSnapshotToDelete) {
                        await supabase.from('weekly_snapshots').delete().match({ user_id: userId, week_start: weekStartStr });
                        console.log(`Deleted invalid snapshot for user ${profile.first_name} on week ${weekStartStr}`);
                    }
                    continue;
                }
            }

            const hoursWorked = userHoursThisWeek.get(userId) || 0;

            // Si existe un snapshot, lo buscamos para preservar is_paid, pero NO usamos sus horas de contrato
            // porque queremos permitir que el recalculo corrija errores históricos de contrato.
            const existingSnapshot = existingSnapshots?.find(s => s.user_id === userId);

            // LÓGICA DE PRIORIDAD REFINADA
            let limit = 0;
            let source = 'default';

            // 1. REGLA MAESTRA "CERO": Si el perfil actual tiene 0 horas, mandamos 0 SIEMPRE.
            // Esto corrige el problema de que una configuración de 0 no sobrescribía snapshots antiguos con 40.
            if (profile.contracted_hours_weekly === 0) {
                limit = 0;
                source = 'profile_forced_zero';
            }
            // 2. Si no es 0, priorizamos el histórico (si existe) para respetar cambios de contrato reales
            else if (existingSnapshot?.contracted_hours_snapshot !== undefined && existingSnapshot?.contracted_hours_snapshot !== null) {
                limit = existingSnapshot.contracted_hours_snapshot;
                source = 'snapshot';
            }
            // 3. Fallback al perfil actual
            else if (profile.contracted_hours_weekly !== undefined && profile.contracted_hours_weekly !== null) {
                limit = profile.contracted_hours_weekly;
                source = 'profile';
            }
            // 4. Último recurso
            else {
                limit = 0;
                source = 'zero_default';
            }

            // DEBUG LOG
            console.log(`User: ${profile.first_name}, Week: ${weekStartStr}, Limit: ${limit}, Source: ${source}`);


            const preferStock = profile.prefer_stock_hours || false;
            const isManager = profile.role === 'manager';
            const isFixedSalary = profile.is_fixed_salary || false;

            // Lógica de Agosto y Roles
            // [ROUNDING] Aplicamos redondeo a la media hora más cercana usando la lógica corporativa
            let weeklyBalance = (isAugust || isManager || isFixedSalary) ? hoursWorked : (hoursWorked - limit);
            weeklyBalance = calculateRoundedHours(weeklyBalance);


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
