import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
    try {
        const { toolName, parameters } = await req.json();

        if (toolName === 'get_staff_work_info') {
            const { employeeName, targetDate } = parameters;

            // Paso 1: Buscar el ID en la tabla profiles por first_name
            const { data: profile, error: pError } = await supabase
                .from('profiles')
                .select('id')
                .eq('first_name', employeeName)
                .single();

            if (pError || !profile) {
                return NextResponse.json({ deuda_total: 0, status: `No se encontró a ${employeeName}` });
            }

            // Paso 2: Buscar el balance en weekly_snapshots usando el ID
            const { data: snapshot, error: sError } = await supabase
                .from('weekly_snapshots')
                .select('final_balance')
                .eq('user_id', profile.id)
                .lte('week_start', targetDate)
                .order('week_start', { ascending: false })
                .limit(1);

            if (sError) return NextResponse.json({ error: sError.message }, { status: 500 });

            const balance = snapshot?.[0]?.final_balance ?? 0;
            return NextResponse.json({
                deuda_total: balance,
                status: `Saldo de ${employeeName} recuperado correctamente.`
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

    } catch (err) {
        return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
    }
}