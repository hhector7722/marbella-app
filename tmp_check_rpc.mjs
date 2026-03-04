import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const startDateStr = '2026-03-01'; // Simulated range start
    const endDateStr = '2026-03-31';   // Simulated range end

    const ticketsPromise = supabase
        .from('tickets_marbella')
        .select('id, numero_documento, fecha, hora_cierre, total_documento')
        .gte('fecha', startDateStr)
        .lte('fecha', endDateStr)
        .order('fecha', { ascending: false })
        .order('hora_cierre', { ascending: false });

    const productsPromise = supabase.rpc('get_product_sales_ranking', {
        p_start_date: startDateStr,
        p_end_date: endDateStr
    });

    const [ticketsRes, productsRes] = await Promise.all([ticketsPromise, productsPromise]);

    if (ticketsRes.error) {
        console.error("❌ Tickets Fetch Error:", ticketsRes.error);
    } else {
        console.log("✅ Tickets Fetch Success, length:", ticketsRes.data?.length);
    }

    if (productsRes.error) {
        console.error("❌ RPC Fetch Error:", productsRes.error);
    } else {
        console.log("✅ RPC Fetch Success, length:", productsRes.data?.length);
        console.log("Data preview:", productsRes.data ? productsRes.data.slice(0, 2) : null);
    }
}

check();
