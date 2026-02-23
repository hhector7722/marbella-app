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

        // Unión de tablas: Buscamos el balance usando el nombre de la tabla profiles
        const { data, error } = await supabase
            .from('weekly_snapshots')
            .select(`
        final_balance,
        profiles!inner (
          first_name
        )
      `)
            .eq('profiles.first_name', employeeName) // Filtra por el nombre enviado ("Pere")
            .lte('week_start', targetDate) // Evita el error del lunes buscando el histórico
            .order('week_start', { ascending: false })
            .limit(1);

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        if (!data || data.length === 0) return NextResponse.json({ deuda_total: 0, status: "Empleado no encontrado" });

        return NextResponse.json({
            deuda_total: data[0].final_balance,
            status: `Balance de ${employeeName} recuperado de la base de datos.`
        });
    }

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
}