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

async function checkBalances() {
    const { data: boxes } = await supabase.from('cash_boxes').select('*');
    console.log("Cash Boxes Balances:");
    boxes.forEach(b => console.log(`${b.name} (${b.type}): ${b.current_balance}€`));

    const { data: allLogs } = await supabase.from('treasury_log').select('count', { count: 'exact' });
    console.log("\nTotal treasury_log rows:", allLogs);
}

checkBalances();
