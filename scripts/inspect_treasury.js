const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) env[key.trim()] = value.trim().replace(/^"(.*)"$/, '$1');
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function inspect() {
    const { data: boxes } = await supabase.from('cash_boxes').select('*');
    console.log("--- CASH BOXES ---");
    console.log(JSON.stringify(boxes, null, 2));

    const { data: logs } = await supabase.from('treasury_log')
        .select('*')
        .order('created_at', { ascending: true });

    console.log("\n--- TREASURY LOGS ---");
    console.log(JSON.stringify(logs, null, 2));
}

inspect();
