'use server';

import { cookies } from 'next/headers';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import { MASTER_VIEW_AS_COOKIE } from '@/lib/master-view-as';

export type ScheduleNegativeBalancesResult =
    | { ok: true; balances: Record<string, number> }
    | { ok: false; balances: Record<string, never> };

/**
 * Saldo acumulado de la última semana cerrada (weekly_snapshots.final_balance).
 * El editor de horarios solo recibe los saldos negativos del personal visible.
 * Service role se utiliza exclusivamente tras comprobar la sesión y el rol.
 */
export async function getScheduleNegativeBalancesAction(): Promise<ScheduleNegativeBalancesResult> {
    const denied: ScheduleNegativeBalancesResult = { ok: false, balances: {} };
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return denied;

    const { data: actor, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
    if (profileError || (actor?.role !== 'manager' && actor?.role !== 'admin')) return denied;

    // Cuando Héctor usa «Ver como», nunca se conceden permisos del usuario real
    // a una identidad simulada que no puede editar horarios.
    if (isMasterDashboardUser(user.email)) {
        const simulatedId = (await cookies()).get(MASTER_VIEW_AS_COOKIE)?.value?.trim();
        if (simulatedId && simulatedId !== user.id) {
            const { data: simulated, error } = await supabase
                .from('profiles').select('role').eq('id', simulatedId).maybeSingle();
            if (error || (simulated?.role !== 'manager' && simulated?.role !== 'admin')) return denied;
        }
    }

    const { data: employees, error: employeesError } = await supabase
        .from('profiles').select('id').eq('visible_in_plantilla', true).limit(61);
    if (employeesError || !employees || employees.length > 60) return denied;
    if (employees.length === 0) return { ok: true, balances: {} };

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return denied;
    const admin = createAdminClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
    // La semana en curso aún no está liquidada; excluirla incluso en domingo.
    const todayMadrid = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());

    const snapshots = await Promise.all(employees.map(({ id }) =>
        admin.from('weekly_snapshots')
            .select('final_balance')
            .eq('user_id', id)
            .lt('week_end', todayMadrid)
            .order('week_start', { ascending: false })
            .limit(1)
            .maybeSingle()
    ));
    if (snapshots.some(({ error }) => error)) {
        console.error('[schedule-negative-balances] No se pudieron consultar los saldos');
        return denied;
    }

    const balances: Record<string, number> = {};
    snapshots.forEach(({ data }, index) => {
        if (data?.final_balance == null) return;
        const balance = Number(data.final_balance);
        if (Number.isFinite(balance) && Math.round(balance * 100) < 0) {
            balances[employees[index]!.id] = balance;
        }
    });
    return { ok: true, balances };
}
