const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) env[key.trim()] = value.trim().replace(/^"(.*)"$/, '$1');
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function listAll() {
    const { data: logs, error } = await supabase.from('treasury_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) {
        console.error("Error fetching logs:", error);
        return;
    }

    console.log(`Found ${logs.length} logs (last 50).`);
    logs.forEach(log => {
        console.log(`[${log.created_at}] ID: ${log.id}, TYPE: ${log.type}, AMOUNT: ${log.amount}, NOTES: ${log.notes}`);
    });
}

listAll();
