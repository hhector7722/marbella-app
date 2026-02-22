const fs = require('fs');
const localEnv = fs.readFileSync('.env.local', 'utf8');
const lines = localEnv.split(/\r?\n/);
let supaUrl = '';
let supaKey = '';
for (const line of lines) {
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) supaUrl = line.split('=')[1].trim().replace(/['"]/g, '');
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) supaKey = line.split('=')[1].trim().replace(/['"]/g, '');
}

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(supaUrl, supaKey);

async function run() {
    console.log("URL:", supaUrl.slice(0, 15), "...");
    const { data: p } = await supabase.from('profiles').select('*').ilike('first_name', '%pere%');
    console.log("Pere Profile:", p ? p[0] : 'null');

    if (p && p.length > 0) {
        const id = p[0].id;
        const { data: logs } = await supabase.from('time_logs').select('*').eq('user_id', id).order('clock_in', { ascending: false }).limit(5);
        console.log("Ultimos logs de pere:", logs);
    }

    const { data: recipes } = await supabase.from('recipes').select('*').limit(1);
    console.log("Receta keys:", recipes ? Object.keys(recipes[0]) : "none");
}
run();
