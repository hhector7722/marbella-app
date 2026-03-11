'use server';

import { createClient } from "@/utils/supabase/server";
import { getISOWeek, format, addDays, startOfWeek, parseISO } from 'date-fns';
import { calculateRoundedHours } from '@/lib/utils'; // Ensure this utility is available or duplicate if simple

export async function getDashboardData() {
    const supabase = await createClient();
    const todayStr = format(new Date(), 'yyyy-MM-dd');

    // 1. Parallel Fetching of Core Data (ventas por hora del día actual)
    const chartPromise = (async () => {
        try {
            const { data, error } = await supabase.rpc('get_hourly_sales', {
                p_start_date: todayStr,
                p_end_date: todayStr
            });
            if (!error && data && data.length > 0) {
                const hourly = Array.from({ length: 24 }, (_, h) => ({ hora: h, total: 0 }));
                data.forEach((r: { hora: number; total: number }) => {
                    const h = Number(r.hora);
                    if (h >= 0 && h < 24) hourly[h] = { hora: h, total: Number(r.total) || 0 };
                });
                return hourly;
            }
            // Fallback: fetch tickets directly and aggregate by hour
            const { data: tickets } = await supabase
                .from('tickets_marbella')
                .select('hora_cierre, total_documento')
                .gte('fecha', todayStr)
                .lte('fecha', todayStr);
            const hourly = Array.from({ length: 24 }, (_, h) => ({ hora: h, total: 0 }));
            (tickets || []).forEach((t: { hora_cierre?: string; total_documento?: number }) => {
                let hour = 12;
                const raw = t.hora_cierre;
                if (raw && typeof raw === 'string') {
                    const part = raw.includes('T') ? raw.split('T')[1] : raw;
                    const match = part?.match(/^(\d{1,2})/);
                    if (match) hour = Math.min(23, Math.max(0, parseInt(match[1], 10)));
                }
                hourly[hour].total += Number(t.total_documento) || 0;
            });
            return hourly;
        } catch {
            return Array.from({ length: 24 }, (_, h) => ({ hora: h, total: 0 }));
        }
    })();
    const [
        { data: salesStats },
        salesChartDataRaw,
        { data: lastClose },
        { data: allBoxes },
        { data: allProfiles }
    ] = await Promise.all([
        supabase.rpc('get_daily_sales_stats', { target_date: todayStr }),
        chartPromise,
        supabase.from('cash_closings').select('*').order('closed_at', { ascending: false }).limit(1).single(),
        supabase.from('cash_boxes').select('*').order('name'),
        supabase.from('profiles').select('*')
    ]);
    const salesChartData = Array.isArray(salesChartDataRaw) ? salesChartDataRaw : Array.from({ length: 24 }, (_, h) => ({ hora: h, total: 0 }));


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
        // Orden: Caja Operativa primero, luego Cambio 1 y Cambio 2 por nombre (NUNCA invertir entre cajas cambio)
        const sorted = [...allBoxes].sort((a, b) => {
            if (a.type === 'operational' && b.type !== 'operational') return -1;
            if (a.type !== 'operational' && b.type === 'operational') return 1;
            return (a.name || '').localeCompare(b.name || '');
        });
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

            actualBalance = opBox.current_balance || 0;
            difference = opBox.difference || 0;
            theoreticalBalance = actualBalance - difference;
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

        // FILTRO DE SEMANA EN CURSO: Solo mostramos semanas finalizadas en el dashboard.
        // Normalizar weekId a YYYY-MM-DD (p. ej. si la API devuelve ISO "2026-03-09T00:00:00.000Z",
        // la comparación string a string dejaría fuera todas; con slice(0,10) comparamos solo la fecha).
        const currentWeekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
        const toDateStr = (id: any) => typeof id === 'string' ? id.slice(0, 10) : String(id).slice(0, 10);
        overtimeData = overtimeData.filter((week: any) => toDateStr(week.weekId) < currentWeekStart);
    }

    return {
        dailyStats,
        liveTickets: { total: salesStats?.total_ventas || 0, count: salesStats?.recuento_tickets || 0 },
        salesChartData: salesChartData.map((r: { hora: number; total: number }) => ({
            hora: Number(r.hora),
            total: Number(r.total) || 0
        })),
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
