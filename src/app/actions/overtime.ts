'use server';

import { createClient } from "@/utils/supabase/server";
import { startOfWeek, format, parseISO } from "date-fns";
import { revalidatePath } from "next/cache";
import { calculateRoundedHours } from "@/lib/utils";

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

export async function getOvertimeData(startDate: string, endDate: string) {
    const supabase = await createClient();

    const startISO = new Date(startDate).toISOString();
    const endObj = new Date(endDate);
    endObj.setHours(23, 59, 59, 999);
    const endISO = endObj.toISOString();

    // 1. Obtener Fichajes
    const { data: logs } = await supabase
        .from('time_logs')
        .select('user_id, total_hours, clock_in')
        .not('total_hours', 'is', null)
        .gte('clock_in', startISO)
        .lte('clock_in', endISO);

    // 2. Obtener Perfiles
    const { data: profiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, role, regular_cost_per_hour, overtime_cost_per_hour, contracted_hours_weekly, prefer_stock_hours, hours_balance, is_fixed_salary');

    // 3. Obtener Estado Pagos y Balances de Snapshots
    const extendedStart = new Date(startISO);
    extendedStart.setDate(extendedStart.getDate() - 14);
    const { data: snapshots } = await supabase
        .from('weekly_snapshots')
        .select('user_id, week_start, is_paid, final_balance')
        .gte('week_start', format(extendedStart, 'yyyy-MM-dd'))
        .lte('week_start', format(endObj, 'yyyy-MM-dd'));

    if (!logs || !profiles) return { weeksResult: [], summary: { totalCost: 0, totalHours: 0, totalOvertimeCost: 0 } };

    const profileMap = new Map(profiles.map(p => [p.id, p]));
    const tempWeekUserHours: Record<string, Record<string, number>> = {};
    const tempWeekMeta: Record<string, Date> = {};

    logs.forEach(log => {
        const date = new Date(log.clock_in);
        const monday = startOfWeek(date, { weekStartsOn: 1 });
        monday.setHours(0, 0, 0, 0);

        const weekId = format(monday, 'yyyy-MM-dd'); // Usar formato ISO local como ID

        if (!tempWeekUserHours[weekId]) {
            tempWeekUserHours[weekId] = {};
            tempWeekMeta[weekId] = monday;
        }
        if (!tempWeekUserHours[weekId][log.user_id]) tempWeekUserHours[weekId][log.user_id] = 0;
        // [FIX] Redondear cada ficha individualmente ANTES de sumar al total semanal
        tempWeekUserHours[weekId][log.user_id] += calculateRoundedHours(log.total_hours || 0);
    });

    const currentMondayISO = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const sortedWeekIds = Object.keys(tempWeekUserHours)
        .sort((a, b) => tempWeekMeta[a].getTime() - tempWeekMeta[b].getTime())
        .filter(weekId => weekId < currentMondayISO);

    const weeksResult: WeeklyStats[] = [];

    const userFinalBalances = new Map<string, Map<string, number>>();

    sortedWeekIds.forEach(weekId => {
        const usersInWeek = tempWeekUserHours[weekId];
        const mondayDate = parseISO(weekId);
        const weekStartISO = weekId;
        const fullLabel = `Semana del ${mondayDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}`;

        const prevMonday = new Date(mondayDate);
        prevMonday.setDate(prevMonday.getDate() - 7);
        const prevWeekId = Object.keys(tempWeekMeta).find(k =>
            tempWeekMeta[k].getTime() === prevMonday.getTime()
        );
        const prevWeekISO = format(prevMonday, 'yyyy-MM-dd');

        let weekTotalCost = 0;
        let weekTotalHours = 0;
        const staffList: StaffWeeklyStats[] = [];

        if (!userFinalBalances.has(weekId)) userFinalBalances.set(weekId, new Map());

        Object.keys(usersInWeek).forEach(userId => {
            const hoursWorked = usersInWeek[userId];
            const profile = profileMap.get(userId);

            if (profile) {
                const limit = profile.contracted_hours_weekly ?? 40;
                const overPrice = profile.overtime_cost_per_hour || 0;
                const preferStock = profile.prefer_stock_hours || false;
                const isManager = profile.role === 'manager';
                const isFixedSalary = profile.is_fixed_salary || false;

                const isAugust = mondayDate.getMonth() === 7;
                const weeklyBalance = (isAugust || isManager || isFixedSalary) ? hoursWorked : (hoursWorked - limit);

                let pendingBalance = 0;
                const prevSnapshot = snapshots?.find(s => s.user_id === userId && s.week_start === prevWeekISO);

                if (prevSnapshot?.final_balance !== null && prevSnapshot?.final_balance !== undefined) {
                    if (!preferStock && prevSnapshot.final_balance > 0) pendingBalance = 0;
                    else pendingBalance = prevSnapshot.final_balance;
                } else if (prevWeekId) {
                    const prevBalances = userFinalBalances.get(prevWeekId);
                    const prevBalance = prevBalances?.get(userId) ?? (profile.hours_balance || 0);
                    if (!preferStock && prevBalance > 0) pendingBalance = 0;
                    else pendingBalance = prevBalance;
                } else {
                    pendingBalance = profile.hours_balance || 0;
                }

                const finalBalance = pendingBalance + weeklyBalance;
                userFinalBalances.get(weekId)!.set(userId, finalBalance);

                // Solo balances positivos (crédito) cuentan como Extras a pagar. Las deudas no.
                const overtimeHours = finalBalance > 0 ? finalBalance : 0;
                const overCost = preferStock ? 0 : (overtimeHours * overPrice);

                // Filtrar solo balances positivos y que no sean stock
                if (overtimeHours > 0 && !preferStock) {
                    staffList.push({
                        id: userId,
                        name: `${profile.first_name} ${profile.last_name || ''}`,
                        role: profile.role || 'Staff',
                        totalHours: isManager ? (40 + hoursWorked) : hoursWorked, // Manager: 40 + extras
                        regularHours: isManager ? 40 : (hoursWorked - overtimeHours),
                        overtimeHours: overtimeHours,
                        totalCost: overCost,
                        regularCost: 0,
                        overtimeCost: overCost,
                        isPaid: snapshots?.find(s => s.user_id === userId && s.week_start === weekStartISO)?.is_paid || false,
                        preferStock: preferStock
                    });

                    weekTotalCost += overCost;
                    weekTotalHours += isManager ? (40 + hoursWorked) : hoursWorked;
                }
            }
        });

        staffList.sort((a, b) => b.totalCost - a.totalCost);
        if (staffList.length > 0) {
            weeksResult.push({
                weekId,
                label: fullLabel,
                startDate: mondayDate,
                totalAmount: weekTotalCost,
                totalHours: weekTotalHours,
                staff: staffList
            });
        }
    });

    weeksResult.sort((a, b) => b.startDate.getTime() - a.startDate.getTime());

    let sumCost = 0;
    let sumHours = 0;
    let sumOverCost = 0;
    weeksResult.forEach(w => {
        sumCost += w.totalAmount;
        sumHours += w.totalHours;
        w.staff.forEach(s => sumOverCost += s.overtimeCost);
    });

    return {
        weeksResult,
        summary: {
            totalCost: sumCost,
            totalHours: sumHours,
            totalOvertimeCost: sumOverCost
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
