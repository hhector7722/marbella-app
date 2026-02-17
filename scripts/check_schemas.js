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

async function checkSchemas() {
    console.log("Checking if treasury schema exists...");
    const { data: schemaTest, error: schemaError } = await supabase.from('treasury_log').select('*', { schema: 'treasury', count: 'exact', head: true });
    if (schemaError) console.log("Treasury schema not found or inaccessible:", schemaError.message);
    else console.log("Treasury schema found, rows:", schemaTest);

    // Try to list all visible schemas or tables with count > 0
    console.log("\nAttempting to find any table with rows...");
    const { data: allData, error: allErr } = await supabase.from('treasury_log').select('*');
    console.log("Public treasury_log rows:", allData?.length);
}

checkSchemas();
