'use server';

import { createClient } from "@/utils/supabase/server";
import { getISOWeek, format, addDays, parseISO } from 'date-fns';
import { getBusinessHourFromTicket } from '@/lib/utils';

export async function getDashboardData() {
    const supabase = await createClient();
    const todayStr = format(new Date(), 'yyyy-MM-dd');

    // Convierte NUMERIC Postgres (suele venir como string) a céntimos enteros.
    // Redondea al céntimo (para corregir imprecisión binaria tipo 392.7599999).
    const parseNumericToCents = (value: any): number => {
        if (value === null || value === undefined) return 0;
        const s = String(value).trim();
        if (!s) return 0;

        const neg = s.startsWith('-');
        const clean = neg || s.startsWith('+') ? s.slice(1) : s;
        const [intPartRaw, fracPartRaw = ''] = clean.split('.');
        const intPart = parseInt(intPartRaw || '0', 10);

        const frac3 = (fracPartRaw || '').padEnd(3, '0').slice(0, 3);
        const frac2 = frac3.slice(0, 2);
        const thirdDigit = frac3[2] ?? '0';

        const third = parseInt(thirdDigit, 10) || 0;
        let roundedFrac = parseInt(frac2 || '0', 10) || 0;
        let roundedInt = intPart;
        if (third >= 5) {
            roundedFrac += 1;
            if (roundedFrac >= 100) {
                roundedFrac = 0;
                roundedInt += 1;
            }
        }

        const cents = roundedInt * 100 + roundedFrac;
        return neg ? -cents : cents;
    };

    // 1. Parallel Fetching of Core Data (ventas por hora del día actual, eje TPV fecha + hora_cierre)
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
            // Fallback: fetch tickets directly and aggregate by hour (eje fecha TPV)
            const { data: tickets } = await supabase
                .from('tickets_marbella')
                .select('hora_cierre, fecha, total_documento')
                .eq('fecha', todayStr)
                .limit(5000);

            const hourly = Array.from({ length: 24 }, (_, h) => ({ hora: h, total: 0 }));
            (tickets || []).forEach((t: { hora_cierre?: string; fecha?: string; total_documento?: number }) => {
                const hour = getBusinessHourFromTicket(t);
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
        { data: allProfiles },
        { data: opBoxStatusRows }
    ] = await Promise.all([
        supabase.rpc('get_daily_sales_stats', { target_date: todayStr }),
        chartPromise,
        supabase.from('cash_closings').select('*').order('closed_at', { ascending: false }).limit(1).single(),
        supabase.from('cash_boxes').select('*').order('name'),
        supabase.from('profiles').select('*'),
        supabase.rpc('get_operational_box_status')
    ]);

    const salesChartData = Array.isArray(salesChartDataRaw) ? salesChartDataRaw : Array.from({ length: 24 }, (_, h) => ({ hora: h, total: 0 }));

    // --- PROCESS LABOR COST (Daily Stats) ---
    let dailyStats = null;
    if (lastClose) {
        const closeDate = new Date(lastClose.closed_at);
        const closeDateStart = new Date(closeDate);
        closeDateStart.setHours(0, 0, 0, 0);

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
    let differenceCents = 0;

    // Una sola fuente: RPC get_operational_box_status (igual que /dashboard/movements)
    const opStatus = Array.isArray(opBoxStatusRows) ? opBoxStatusRows[0] : opBoxStatusRows;
    if (opStatus?.box_id != null) {
        theoreticalBalance = Number(opStatus.theoretical_balance ?? 0);
        const physicalCents = parseNumericToCents(opStatus.physical_balance ?? 0);
        actualBalance = physicalCents / 100;

        // SALDO del libro: running_balance más reciente (atemporal), excluyendo ADJUSTMENT/SWAP
        let latestLedgerSaldoCents = 0;
        try {
            const { data: ledgerRows, error: ledgerError } = await supabase
                .from('v_treasury_movements_balance')
                .select('running_balance')
                .neq('type', 'ADJUSTMENT')
                .neq('type', 'SWAP')
                .order('created_at', { ascending: false })
                .order('id', { ascending: false })
                .limit(1);
            if (ledgerError) throw ledgerError;
            const raw = ledgerRows?.[0]?.running_balance;
            latestLedgerSaldoCents = parseNumericToCents(raw ?? 0);
        } catch (e) {
            console.error('Error calculando latestLedgerSaldo en getDashboardData:', e);
        }

        differenceCents = physicalCents - latestLedgerSaldoCents;
        difference = differenceCents / 100;
    }

    if (allBoxes) {
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
        }
    }

    // --- PROCESS OVERTIME (Last 60 days) ---
    let overtimeData: any[] = [];
    let initialPaidStatus: Record<string, boolean> = {};

    const sixtyDaysAgo = format(addDays(new Date(), -60), 'yyyy-MM-dd');
    const todayISO = format(new Date(), 'yyyy-MM-dd');

    const { data: rpcData, error: rpcError } = await supabase.rpc('get_weekly_worker_stats', {
        p_start_date: sixtyDaysAgo,
        p_end_date: todayISO,
        p_only_completed_weeks: true,
    });

    if (rpcError) {
        console.error("Error fetching overtime from RPC in dashboard:", rpcError);
    } else if (rpcData) {
        overtimeData = rpcData.weeksResult.map((week: any) => ({
            weekId: week.weekId,
            total: week.totalAmount,
            expanded: false,
            staff: week.staff.map((s: any) => ({
                id: s.id,
                name: s.name.split(' ')[0],
                amount: s.totalCost,
                hours: s.overtimeHours
            }))
        }));

        rpcData.weeksResult.forEach((week: any) => {
            week.staff.forEach((s: any) => {
                initialPaidStatus[`${week.weekId}-${s.id}`] = s.isPaid;
            });
        });
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
        differenceCents,
        overtimeData,
        paidStatus: initialPaidStatus,
        allEmployees: (allProfiles || []).filter((p: any) => {
            const name = (p.first_name || '').trim().toLowerCase();
            return name !== 'ramon' && name !== 'ramón' && name !== 'empleado';
        })
    };
}