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

async function checkOldTables() {
    console.log("Checking legacy tables...");
    const tables = ['cash_ledger', 'cash_movements', 'treasury_movements'];
    for (const t of tables) {
        try {
            const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
            if (error) console.log(`${t}: Error or Missing (${error.message})`);
            else console.log(`${t}: Found, ${count} rows`);
        } catch (e) {
            console.log(`${t}: Exception ${e.message}`);
        }
    }
}

checkOldTables();
