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

async function check() {
    console.log("--- CASH BOXES ---");
    const { data: boxes } = await supabase.from('cash_boxes').select('*');
    console.log(JSON.stringify(boxes, null, 2));

    console.log("\n--- RECENT TREASURY LOGS (ANY) ---");
    const { data: logs } = await supabase
        .from('treasury_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
    console.log(JSON.stringify(logs, null, 2));
}

check();
