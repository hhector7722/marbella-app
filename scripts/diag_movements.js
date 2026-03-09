/**
 * Diagnóstico: por qué no se muestran movimientos en /dashboard/movements
 * Ejecutar: node scripts/diag_movements.js
 */
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env.local');
const env = {};
try {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
        const eq = line.indexOf('=');
        if (eq > 0) env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    });
} catch (e) {
    console.error('No .env.local encontrado');
    process.exit(1);
}

const { createClient } = require('@supabase/supabase-js');
// Service role bypassa RLS (como el backend). Si no existe, usa anon (puede devolver vacío por RLS).
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, key);

async function run() {
    console.log('=== DIAGNÓSTICO MOVIMIENTOS ===\n');

    // 1. ¿Hay datos en treasury_log?
    const { data: rawLogs, error: e1 } = await supabase.from('treasury_log').select('id, created_at, type, amount').limit(5);
    console.log('1. treasury_log (primeros 5):', rawLogs?.length ?? 0, 'filas');
    if (e1) console.log('   Error:', e1.message);
    if (rawLogs?.length) {
        const minDate = rawLogs.reduce((a, r) => (!a || r.created_at < a ? r.created_at : a), null);
        const maxDate = rawLogs.reduce((a, r) => (!a || r.created_at > a ? r.created_at : a), null);
        console.log('   Rango fechas (muestra):', minDate, '->', maxDate);
    }

    // 2. ¿La vista devuelve algo SIN filtros?
    const { data: viewAll, error: e2 } = await supabase.from('v_treasury_movements_balance').select('id, created_at, type').limit(5);
    console.log('\n2. v_treasury_movements_balance (sin filtros):', viewAll?.length ?? 0, 'filas');
    if (e2) console.log('   Error:', e2.message);

    // 3. Rango del mes actual (lo que usa la app)
    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const startISO = startMonth.toISOString();
    const endISO = endMonth.toISOString();
    console.log('\n3. Rango mes actual (app):', startISO, '->', endISO);

    const { data: viewFiltered, error: e3 } = await supabase
        .from('v_treasury_movements_balance')
        .select('id, created_at, type, amount')
        .gte('created_at', startISO)
        .lte('created_at', endISO)
        .neq('type', 'ADJUSTMENT')
        .neq('type', 'SWAP')
        .limit(5);
    console.log('   Vista con filtro fecha (mes actual):', viewFiltered?.length ?? 0, 'filas');
    if (e3) console.log('   Error:', e3.message);

    // 4. RPC get_treasury_period_summary
    const { data: summary, error: e4 } = await supabase.rpc('get_treasury_period_summary', {
        p_box_id: null,
        p_start_date: startISO,
        p_end_date: endISO
    });
    console.log('\n4. get_treasury_period_summary:', summary);
    if (e4) console.log('   Error:', e4.message);

    // 5. get_operational_box_status
    const { data: boxStatus, error: e5 } = await supabase.rpc('get_operational_box_status');
    console.log('\n5. get_operational_box_status:', Array.isArray(boxStatus) ? boxStatus[0] : boxStatus);
    if (e5) console.log('   Error:', e5.message);

    // 6. Probar mes anterior (por si los datos son viejos)
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    const { data: prevData } = await supabase
        .from('v_treasury_movements_balance')
        .select('id')
        .gte('created_at', prevMonth.toISOString())
        .lte('created_at', prevEnd.toISOString())
        .neq('type', 'ADJUSTMENT')
        .neq('type', 'SWAP')
        .limit(1);
    console.log('\n6. ¿Hay datos en mes anterior?', prevData?.length ? 'SÍ' : 'NO');

    console.log('\n=== FIN DIAGNÓSTICO ===');
}

run().catch(console.error);
