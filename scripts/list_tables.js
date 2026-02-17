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

async function listTables() {
    console.log("Listing tables (accessible via PostgREST)...");
    // We can't directly list all tables via PostgREST easily without an RPC,
    // but we can try to trigger a common error to see hints, or check commonly used tables.
    // Actually, let's try to query some likely candidates.
    const tables = [
        'treasury_log', 'treasury_movements', 'cash_movements',
        'cash_ledger', 'cash_registers', 'cash_boxes'
    ];
    for (const t of tables) {
        const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
        if (error) console.log(`${t}: Not found or error: ${error.message}`);
        else console.log(`${t}: Found, ${count} rows`);
    }
}

listTables();
