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

async function checkPolicies() {
    console.log("Checking policies for treasury_log...");
    const { data, error } = await supabase.rpc('get_policies', { table_name: 'treasury_log' });
    if (error) {
        // Fallback: try querying pg_policies if the RPC doesn't exist
        console.log("RPC get_policies not found, attempting direct query...");
        const { data: pgData, error: pgError } = await supabase.from('pg_policies').select('*').eq('tablename', 'treasury_log');
        // Wait, pg_policies is in information_schema or similar, might not be accessible via PostgREST
        if (pgError) {
            console.error("Could not fetch policies via PostgREST. Trying a different way.");
            // Try a simple select to see if RLS is enabled
            const { error: rlsError } = await supabase.from('treasury_log').select('id').limit(1);
            console.log("RLS Check (Select error):", rlsError);
        } else {
            console.log("Policies:", pgData);
        }
    } else {
        console.log("Policies:", data);
    }
}

checkPolicies();
