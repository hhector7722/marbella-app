'use server';

import { createClient } from "@/utils/supabase/server";
import { getISOWeek, format, addDays, startOfWeek, parseISO } from 'date-fns';
import { calculateRoundedHours } from '@/lib/utils'; // Ensure this utility is available or duplicate if simple

export async function getDashboardData() {
    const supabase = await createClient();
    const todayStr = format(new Date(), 'yyyy-MM-dd');

    // 1. Parallel Fetching of Core Data
    const [
        { data: ticketsToday },
        { data: lastClose },
        { data: allBoxes },
        { data: allProfiles },
        { data: dayLogs }, // Will define query below
        { data: snapshots } // Will define query below
    ] = await Promise.all([
        supabase.from('tickets_marbella').select('total_documento').eq('fecha', todayStr),
        supabase.from('cash_closings').select('*').order('closed_at', { ascending: false }).limit(1).single(),
        supabase.from('cash_boxes').select('*').order('name'),
        supabase.from('profiles').select('*'),
        // Optimization: Fetch time logs for labor cost (today) AND history (60 days) in one go? 
        // For now, let's keep it robust and fetch what's needed.
        // Actually, let's split the labor cost query and history query to be safe, or combine if overlapping.
        // The View fetched dayLogs based on lastClose date.
        // It also fetched logs for the last 60 days.
        // Let's do the 60 days fetch, and filter in memory if needed, or just fetch both. 
        // Fetching 60 days of logs might be heavy. Let's look at the original code.
        // Original: 
        // 1. dayLogs (for labor cost) -> gte(closeDateStart) lte(closeDateEnd)
        // 2. logs (for overtime) -> gte(60 days ago)

        // Let's fetch 60 days efficiently.
        supabase.from('time_logs').select('user_id, total_hours, clock_in').gte('clock_in', format(addDays(new Date(), -60), 'yyyy-MM-dd')),
        supabase.from('weekly_snapshots').select('*').gte('week_start', format(addDays(new Date(), -60), 'yyyy-MM-dd'))
    ]);

    // --- PROCESS LIVE TICKETS ---
    const totalVentas = ticketsToday?.reduce((sum, t) => sum + (Number(t.total_documento) || 0), 0) || 0;
    const countVentas = ticketsToday?.reduce((count, t) => {
        const val = Number(t.total_documento) || 0;
        if (val > 0) return count + 1;
        if (val < 0) return count - 1;
        return count;
    }, 0) || 0;

    // --- PROCESS LABOR COST (Daily Stats) ---
    let dailyStats = null;
    if (lastClose) {
        const closeDate = new Date(lastClose.closed_at);
        const closeDateStart = new Date(closeDate); closeDateStart.setHours(0, 0, 0, 0);
        const closeDateEnd = new Date(closeDate); closeDateEnd.setHours(23, 59, 59, 999);

        // We need specific logs for the closing day. The 60-day fetch *should* cover this if the closing was recent.
        // If closing was > 60 days ago (unlikely), we might miss it. Assuming active business.
        // Let's filter from the 60-day logs if applicable, or fetch specifically if needed. 
        // Safe bet: The 60 days covers it.
        const specificDayLogs = dayLogs?.filter((log: any) => {
            const logTime = new Date(log.clock_in).getTime();
            return logTime >= closeDateStart.getTime() && logTime <= closeDateEnd.getTime();
        }) || [];

        let laborCost = 0;
        const profileMap = new Map(allProfiles?.map((p: any) => [p.id, p]) || []);
        const countedManagers = new Set<string>();
        const userDayHours = new Map<string, number>();

        specificDayLogs.forEach((log: any) => {
            const current = userDayHours.get(log.user_id) || 0;
            userDayHours.set(log.user_id, current + (log.total_hours || 0));
        });

        userDayHours.forEach((hours, userId) => {
            const profile = profileMap.get(userId);
            if (profile) {
                const dailyContracted = (profile.contracted_hours_weekly ?? 0) / 5;
                const regPrice = profile.regular_cost_per_hour || 0;
                const overPrice = profile.overtime_cost_per_hour || regPrice;

                if (profile.role === 'manager') {
                    laborCost += dailyContracted * regPrice;
                    laborCost += hours * overPrice;
                    countedManagers.add(userId);
                } else {
                    if (hours > dailyContracted) {
                        laborCost += dailyContracted * regPrice;
                        laborCost += (hours - dailyContracted) * overPrice;
                    } else {
                        laborCost += hours * regPrice;
                    }
                }
            }
        });

        allProfiles?.forEach((profile: any) => {
            if (profile.role === 'manager' && !countedManagers.has(profile.id)) {
                const dailyContracted = (profile.contracted_hours_weekly ?? 0) / 5;
                const regPrice = profile.regular_cost_per_hour || 0;
                laborCost += dailyContracted * regPrice;
            }
        });

        const laborPercent = lastClose.net_sales > 0 ? (laborCost / lastClose.net_sales) * 100 : 0;

        dailyStats = {
            date: new Date(lastClose.closed_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
            fullDate: new Date(lastClose.closed_at).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }),
            weather: lastClose.weather || 'General',
            costeManoObra: laborCost,
            porcentajeManoObra: laborPercent,
            laborCostBg: laborPercent > 35 ? 'bg-rose-500' : (laborPercent > 30 ? 'bg-orange-400' : 'bg-emerald-500'),
            laborCostColor: laborPercent > 35 ? 'text-rose-600' : (laborPercent > 30 ? 'text-orange-500' : 'text-emerald-600')
        };
    }

    // --- PROCESS BOXES & MOVEMENTS ---
    let boxes = [];
    let boxMovements = [];
    if (allBoxes) {
        const sorted = allBoxes.sort((a, b) => a.type === 'operational' ? -1 : 1);
        boxes = sorted;
        const opBox = sorted.find(b => b.type === 'operational');
        if (opBox) {
            const { data: moves } = await supabase.from('treasury_log')
                .select('*')
                .eq('box_id', opBox.id)
                .neq('type', 'ADJUSTMENT')
                .order('created_at', { ascending: false })
                .limit(3);

            boxMovements = moves || [];

            // La diferencia ya viene calculada desde la DB en la columna 'difference' de 'cash_boxes'
        }
    }

    // --- PROCESS OVERTIME (Last 60 days) ---
    // Unificación con RPC centralizada (SSOT)
    let overtimeData: any[] = [];
    let initialPaidStatus: Record<string, boolean> = {};

    const sixtyDaysAgo = format(addDays(new Date(), -60), 'yyyy-MM-dd');
    const todayISO = format(new Date(), 'yyyy-MM-dd');

    const { data: rpcData, error: rpcError } = await supabase.rpc('get_weekly_worker_stats', {
        p_start_date: sixtyDaysAgo,
        p_end_date: todayISO
    });

    if (rpcError) {
        console.error("Error fetching overtime from RPC in dashboard:", rpcError);
    } else if (rpcData) {
        // Mapeamos el formato de la RPC al formato que espera el Dashboard
        // La RPC devuelve { weeksResult: WeeklyStats[], summary: ... }
        overtimeData = rpcData.weeksResult.map((week: any) => ({
            weekId: week.weekId,
            total: week.totalAmount,
            expanded: false,
            staff: week.staff.map((s: any) => ({
                id: s.id,
                name: s.name.split(' ')[0], // Solo el primer nombre como estaba antes
                amount: s.totalCost,
                hours: s.overtimeHours
            }))
        }));

        // Poblamos initialPaidStatus
        rpcData.weeksResult.forEach((week: any) => {
            week.staff.forEach((s: any) => {
                initialPaidStatus[`${week.weekId}-${s.id}`] = s.isPaid;
            });
        });

        // FILTRO DE SEMANA EN CURSO: Solo mostramos semanas finalizadas en el dashboard
        const currentWeekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
        overtimeData = overtimeData.filter((week: any) => week.weekId < currentWeekStart);
    }

    return {
        dailyStats,
        liveTickets: { total: totalVentas, count: Math.max(0, countVentas) },
        boxes,
        boxMovements,
        overtimeData,
        paidStatus: initialPaidStatus,
        allEmployees: allProfiles || []
    };
}
