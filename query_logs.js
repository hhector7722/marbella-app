require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Buscando el service role de las env de Vercel/Sistema
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.CRON_SECRET || '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'
);

async function run() {
    const { data: profiles } = await supabase.from('profiles').select('id, first_name');
    if (!profiles) {
        console.log("Error leyendo perfiles. Probablemente la key falló.");
        return;
    }
    const pere = profiles.find(p => p.first_name.toLowerCase() === 'pere');
    console.log('Pere ID:', pere?.id);

    if (pere) {
        const { data: snapshot } = await supabase.from('weekly_snapshots').select('*').eq('user_id', pere.id).order('week_start', { ascending: false }).limit(3);
        console.log('Ultimos snapshots:', snapshot);

        const { data, error } = await supabase.from('time_logs')
            .select('id, clock_in, clock_out, total_hours')
            .eq('user_id', pere.id)
            .order('clock_in', { ascending: false })
            .limit(10);

        console.log('Logs (últimos 10):', data);
        if (error) console.log('Error:', error);
    }
}
run();
