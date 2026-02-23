import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
    const { toolName, parameters } = await req.json();

    if (toolName === 'get_staff_work_info') {
        const { employeeName, targetDate } = parameters;

        // Lógica de "Último Estado Conocido" para evitar el error del lunes
        const { data, error } = await supabase
            .from('weekly_snapshots')
            .select('final_balance')
            .eq('employee_name', employeeName)
            .lte('week_start', targetDate) // Registros hasta la fecha actual
            .order('week_start', { ascending: false }) // El más reciente primero
            .limit(1); // Solo el último consolidado

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        const balance = data?.[0]?.final_balance ?? 0;

        return NextResponse.json({
            deuda_total: balance,
            status: `Consultado saldo histórico para ${employeeName}.`
        });
    }

    // Herramienta para Ventas (Dashboard)
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

    return NextResponse.json({ error: 'Herramienta no encontrada' }, { status: 404 });
}