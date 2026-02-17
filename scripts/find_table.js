const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) env[key.trim()] = value.trim().replace(/^"(.*)"$/, '$1');
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function listAll() {
    console.log("Fetching all table counts...");
    // We can use a trick: query a non-existent table to get the full list in the error message if possible,
    // or use a common RPC if it exists.
    // Instead, let's try to query PostgREST's root to see the OpenAPI spec if we could, 
    // but the best way is usually a direct SQL if we had it.

    // Let's try many potential names.
    const names = [
        'treasury_log', 'treasury_logs', 'treasury_movement', 'treasury_movements',
        'cash_entry', 'cash_entries', 'cash_movement', 'cash_movements',
        'movimientos_caja', 'movimientos', 'caja_log', 'log_caja'
    ];
    for (const name of names) {
        const { count, error } = await supabase.from(name).select('*', { count: 'exact', head: true });
        if (!error) console.log(`${name}: ${count} rows`);
    }
}

listAll();
