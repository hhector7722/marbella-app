'use server';

import { createClient } from "@/utils/supabase/server";
import { getISOWeek, format, addDays, startOfWeek, parseISO } from 'date-fns';
import { calculateRoundedHours } from '@/lib/utils'; // Ensure this utility is available or duplicate if simple

export async function getDashboardData() {
    const supabase = await createClient();
    const todayStr = format(new Date(), 'yyyy-MM-dd');

    // 1. Parallel Fetching of Core Data
    const [
        { data: salesStats },
        { data: lastClose },
        { data: allBoxes },
        { data: allProfiles }
    ] = await Promise.all([
        supabase.rpc('get_daily_sales_stats', { target_date: todayStr }),
        supabase.from('cash_closings').select('*').order('closed_at', { ascending: false }).limit(1).single(),
        supabase.from('cash_boxes').select('*').order('name'),
        supabase.from('profiles').select('*')
    ]);


    // --- PROCESS LABOR COST (Daily Stats) ---
    let dailyStats = null;
    if (lastClose) {
        const closeDate = new Date(lastClose.closed_at);
        const closeDateStart = new Date(closeDate); closeDateStart.setHours(0, 0, 0, 0);

        // Fetch labor cost using RPC
        const { data: laborCostData } = await supabase.rpc('get_daily_labor_cost', {
            p_target_date: closeDateStart.toISOString().split('T')[0]
        });
        const laborCost = laborCostData || 0;

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
    let theoreticalBalance = 0;
    let actualBalance = 0;
    let difference = 0;

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

            // Fetch theoretical balance from view
            const { data: viewData } = await supabase.from('v_treasury_movements_balance')
                .select('running_balance')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            theoreticalBalance = viewData?.running_balance || 0;
            actualBalance = opBox.current_balance || 0;
            difference = actualBalance - theoreticalBalance;
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
        liveTickets: { total: salesStats?.total_ventas || 0, count: salesStats?.recuento_tickets || 0 },
        boxes,
        boxMovements,
        theoreticalBalance,
        actualBalance,
        difference,
        overtimeData,
        paidStatus: initialPaidStatus,
        allEmployees: (allProfiles || []).filter((p: any) => {
            const name = (p.first_name || '').trim().toLowerCase();
            return name !== 'ramon' && name !== 'ramón' && name !== 'empleado';
        })
    };
}
