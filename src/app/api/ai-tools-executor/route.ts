import { NextRequest } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { z } from 'zod';

export async function POST(req: NextRequest) {
    const { toolName, parameters, token } = await req.json();

    // Instanciamos Supabase con el token del usuario para respetar RLS
    const supabase = await createClient();

    try {
        switch (toolName) {
            case 'get_dashboard':
                const { data: cls } = await supabase.from('cash_closings')
                    .select('net_sales').gte('closing_date', parameters.startDate).lte('closing_date', parameters.endDate);
                const total = cls?.reduce((sum, c) => sum + (Number(c.net_sales) || 0), 0) || 0;
                return Response.json({ total: total.toFixed(2) });

            case 'get_staff_work_info':
                const d = new Date(parameters.targetDate || new Date());
                const mon = new Date(d.setDate(d.getDate() - (d.getDay() || 7) + 1)).toISOString().split('T')[0];
                const { data: last } = await supabase.from('weekly_snapshots')
                    .select('final_balance').order('week_start', { ascending: false }).limit(1).maybeSingle();
                return Response.json({ deuda_total: last?.final_balance || 0 });

            default:
                return Response.json({ error: "Herramienta no soportada" }, { status: 400 });
        }
    } catch (e: any) {
        return Response.json({ error: e.message }, { status: 500 });
    }
}