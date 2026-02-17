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

async function testInsert() {
    console.log("Fetching operational box...");
    const { data: box } = await supabase.from('cash_boxes').select('id').eq('type', 'operational').maybeSingle();
    if (!box) {
        console.error("No operational box found");
        return;
    }
    console.log("Box ID:", box.id);

    console.log("Inserting test record...");
    const { data, error } = await supabase.from('treasury_log').insert({
        box_id: box.id,
        type: 'IN',
        amount: 100,
        notes: 'TEST INSERT',
        created_at: new Date().toISOString()
    }).select();

    if (error) console.error("Insert Error:", error);
    else console.log("Insert Success:", data);
}

testInsert();
