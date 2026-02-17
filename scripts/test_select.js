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

async function testSelect() {
    console.log("Testing SELECT from treasury_log...");
    const { data, error } = await supabase.from('treasury_log').select('*').limit(1);
    if (error) console.error("SELECT Error:", error.message);
    else console.log("SELECT Success, data:", data);

    console.log("\nTesting SELECT from cash_boxes...");
    const { data: bData, error: bError } = await supabase.from('cash_boxes').select('*').limit(1);
    if (bError) console.error("SELECT Error:", bError.message);
    else console.log("SELECT Success, data:", bData);
}

testSelect();
