'use server';

import { createClient } from "@/utils/supabase/server";
import { startOfWeek, format, parseISO, addDays } from "date-fns";
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

export async function getOvertimeData(startDate: string, endDate: string, userId?: string) {
    const supabase = await createClient();

    // 1. Extend range for calculation safety (need previous weeks for balances)
    const startObj = new Date(startDate);
    const extendedStart = new Date(startObj);
    extendedStart.setDate(extendedStart.getDate() - 60); // 60 days buffer just like dashboard

    const queryStart = format(extendedStart, 'yyyy-MM-dd');
    const queryEnd = endDate;

    let query = supabase
        .from('time_logs')
        .select('user_id, total_hours, clock_in')
        .not('total_hours', 'is', null)
        .gte('clock_in', queryStart);

    if (userId) {
        query = query.eq('user_id', userId);
    }

    const { data: logs, error: logsError } = await query;
    if (logsError) console.error("Error fetching logs:", logsError);

    // 2. Obtener Perfiles
    let profileQuery = supabase.from('profiles').select('*');
    if (userId) {
        profileQuery = profileQuery.eq('id', userId);
    }
    const { data: profiles, error: profilesError } = await profileQuery;
    if (profilesError) console.error("Error fetching profiles:", profilesError);

    // 3. Obtener Snapshots
    let snapshotQuery = supabase
        .from('weekly_snapshots')
        .select('*')
        .gte('week_start', queryStart)
        .lte('week_start', queryEnd);

    if (userId) {
        snapshotQuery = snapshotQuery.eq('user_id', userId);
    }
    const { data: snapshots, error: snapshotsError } = await snapshotQuery;
    if (snapshotsError) console.error("Error fetching snapshots:", snapshotsError);

    if (!logs || !profiles) {
        return { weeksResult: [], summary: { totalCost: 0, totalHours: 0, totalOvertimeCost: 0 } };
    }

    const profileMap = new Map(profiles.map(p => [p.id, p]));
    const weekUserHoursMap = new Map<string, Map<string, number>>();

    logs.forEach(log => {
        const date = new Date(log.clock_in);
        const monday = startOfWeek(date, { weekStartsOn: 1 });
        monday.setHours(0, 0, 0, 0);
        const weekId = format(monday, 'yyyy-MM-dd');

        if (!weekUserHoursMap.has(weekId)) weekUserHoursMap.set(weekId, new Map());
        const userMap = weekUserHoursMap.get(weekId)!;
        userMap.set(log.user_id, (userMap.get(log.user_id) || 0) + (log.total_hours || 0));
    });

    const currentWeekStartId = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const sortedWeekIds = Array.from(weekUserHoursMap.keys()).sort().filter(id => id < currentWeekStartId);

    const snapshotMap = new Map<string, any>();
    snapshots?.forEach(s => {
        snapshotMap.set(`${s.week_start}-${s.user_id}`, s);
    });

    const userFinalBalances = new Map<string, Map<string, number>>();
    const weeksResult: WeeklyStats[] = [];

    sortedWeekIds.forEach(weekId => {
        const userMap = weekUserHoursMap.get(weekId)!;
        const mondayDate = parseISO(weekId);
        const prevMonday = addDays(mondayDate, -7);
        const prevWeekId = format(prevMonday, 'yyyy-MM-dd');

        if (!userFinalBalances.has(weekId)) userFinalBalances.set(weekId, new Map());

        let weekTotalCost = 0;
        let weekTotalHours = 0;
        const staffList: StaffWeeklyStats[] = [];

        userMap.forEach((totalHours, userId) => {
            const profile = profileMap.get(userId);
            if (profile) {
                const snapshotKey = `${weekId}-${userId}`;
                const prevSnapshotKey = `${prevWeekId}-${userId}`;

                const currentSnapshot = snapshotMap.get(snapshotKey);
                const prevSnapshot = snapshotMap.get(prevSnapshotKey);

                const limit = currentSnapshot?.contracted_hours_snapshot ?? (profile.contracted_hours_weekly ?? 40);
                const overPrice = profile.overtime_cost_per_hour || 0;
                const preferStock = profile.prefer_stock_hours || false;
                const isManager = profile.role === 'manager';
                const isFixedSalary = profile.is_fixed_salary || false;
                const isAugust = mondayDate.getMonth() === 7;

                let weeklyBalance = (isAugust || isManager || isFixedSalary) ? totalHours : (totalHours - limit);
                weeklyBalance = calculateRoundedHours(weeklyBalance);

                let pendingBalance = 0;
                if (prevSnapshot?.final_balance !== null && prevSnapshot?.final_balance !== undefined) {
                    pendingBalance = (!preferStock && prevSnapshot.final_balance > 0) ? 0 : prevSnapshot.final_balance;
                } else {
                    const prevBalance = userFinalBalances.get(prevWeekId)?.get(userId) ?? (profile.hours_balance || 0);
                    pendingBalance = (!preferStock && prevBalance > 0) ? 0 : prevBalance;
                }

                const finalBalance = pendingBalance + weeklyBalance;
                userFinalBalances.get(weekId)!.set(userId, finalBalance);

                const overtimeHours = finalBalance > 0 ? finalBalance : 0;
                const overCost = (overtimeHours > 0 && !preferStock) ? (overtimeHours * overPrice) : 0;

                // We only add to results if within the requested visual range
                if (weekId >= startDate && weekId <= endDate) {
                    if (overtimeHours > 0 && !preferStock) {
                        staffList.push({
                            id: userId,
                            name: `${profile.first_name} ${profile.last_name || ''}`,
                            role: profile.role || 'Staff',
                            totalHours: calculateRoundedHours(isManager ? (limit + totalHours) : totalHours),
                            regularHours: isManager ? limit : calculateRoundedHours(totalHours - overtimeHours),
                            overtimeHours: overtimeHours,
                            totalCost: overCost,
                            regularCost: 0,
                            overtimeCost: overCost,
                            isPaid: !!currentSnapshot?.is_paid,
                            preferStock: preferStock
                        });

                        weekTotalCost += overCost;
                        weekTotalHours += isManager ? (limit + totalHours) : totalHours;
                    }
                }
            }
        });

        if (staffList.length > 0) {
            staffList.sort((a, b) => b.totalCost - a.totalCost);
            weeksResult.push({
                weekId,
                label: `Semana del ${mondayDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}`,
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
