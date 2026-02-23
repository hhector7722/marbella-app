import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
    try {
        const { toolName, parameters } = await req.json();

        // Herramienta 1: Información Resumida (Snapshot semanal)
        // Útil para saldos rápidos, pero puede fallar en cortes de fin de semana.
        if (toolName === 'get_staff_work_info') {
            const { employeeName, targetDate } = parameters;

            const { data: profile, error: pError } = await supabase
                .from('profiles')
                .select('id')
                .eq('first_name', employeeName)
                .single();

            if (pError || !profile) {
                return NextResponse.json({ deuda_total: 0, status: `No se encontró a ${employeeName}` });
            }

            const { data: snapshot, error: sError } = await supabase
                .from('weekly_snapshots')
                .select('final_balance, earned_hours')
                .eq('user_id', profile.id)
                .lte('week_start', targetDate)
                .order('week_start', { ascending: false })
                .limit(1);

            if (sError) return NextResponse.json({ error: sError.message }, { status: 500 });

            const balance = snapshot?.[0]?.final_balance ?? 0;
            const hours = snapshot?.[0]?.earned_hours ?? 0;

            return NextResponse.json({
                deuda_total: balance,
                horas_semanales_snapshot: hours,
                status: `Saldo de ${employeeName} recuperado. Nota: El snapshot marca ${hours}h, si crees que faltan horas usa la auditoría de fichajes.`
            });
        }

        // Herramienta 2: Auditoría de Fichajes Detallados (CORRIGE LAS 16 HORAS)
        // Esta herramienta suma los turnos brutos para evitar el error del corte del domingo.
        if (toolName === 'get_attendance_logs') {
            const { employeeName, startDate, endDate } = parameters;

            const { data: profile } = await supabase
                .from('profiles')
                .select('id')
                .eq('first_name', employeeName)
                .single();

            if (!profile) return NextResponse.json({ error: "Empleado no encontrado" });

            // Consultamos la tabla de fichajes brutos (entradas y salidas)
            // IMPORTANTE: Verifica si tu tabla se llama 'time_entries' o 'attendance'
            const { data: logs, error: lError } = await supabase
                .from('time_entries')
                .select('check_in, check_out, total_hours')
                .eq('user_id', profile.id)
                .gte('check_in', startDate)
                .lte('check_in', endDate)
                .order('check_in', { ascending: true });

            if (lError) return NextResponse.json({ error: lError.message }, { status: 500 });

            // Calculamos el total real sumando cada turno encontrado
            const totalReal = logs?.reduce((acc, log) => acc + (log.total_hours || 0), 0) || 0;

            return NextResponse.json({
                fichajes: logs,
                total_horas_reales: totalReal,
                status: `Auditoría: Se han encontrado ${totalReal} horas en total para ${employeeName} entre el ${startDate} y el ${endDate}.`
            });
        }

        // Herramienta 3: Dashboard de Ventas Netas
        if (toolName === 'get_dashboard') {
            const { startDate, endDate } = parameters;
            const { data, error } = await supabase
                .from('cash_closings')
                .select('net_sales')
                .gte('date', startDate)
                .lte('date', endDate);

            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            const totalSales = data.reduce((sum, row) => sum + row.net_sales, 0);
            return NextResponse.json({ ventas_netas: totalSales });
        }

        return NextResponse.json({ error: 'Herramienta no definida' }, { status: 404 });

    } catch (err) {
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}