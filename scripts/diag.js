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

// Using service role if available? No, only have anon key.
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    try {
        console.log("Fetching box...");
        const { data: boxes } = await supabase.from('cash_boxes').select('id').limit(1);
        if (!boxes || boxes.length === 0) return;
        const boxId = boxes[0].id;

        console.log("Inserting test row...");
        // This might fail if RLS for Anon prevents Insert, which we expect
        const { data: insData, error: insError } = await supabase.from('treasury_log').insert({
            box_id: boxId,
            type: 'IN',
            amount: 5,
            notes: 'SYSTEM_DIAGNOSTIC_TEST'
        }).select();

        if (insError) {
            console.log("Insert failed as expected for Anon:", insError.message);
        } else {
            console.log("Insert SUCCEEDED for Anon (Unexpected!):", insData);
        }

        console.log("\nChecking for ANY existing data in treasury_log...");
        const { data: existing } = await supabase.from('treasury_log').select('*').limit(1);
        console.log("Existing data sample:", existing);

    } catch (e) { console.error(e); }
}

test();
