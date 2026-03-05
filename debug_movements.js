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
    console.log("Checking operational cash box...");
    const { data: box, error: boxError } = await supabase.from('cash_boxes').select('*').eq('type', 'operational').maybeSingle();
    console.log("Box Data:", box);
    console.log("Box Error:", boxError);

    if (box) {
        console.log("Checking movements for box:", box.id);
        const { data: moves, error: movesError } = await supabase
            .from('v_treasury_movements_balance')
            .select('*')
            .eq('box_id', box.id)
            .not('type', 'in', '(ADJUSTMENT,SWAP)')
            .limit(5);
        console.log("Moves (first 5):", moves);
        console.log("Moves Error:", movesError);

        const { data: countData, error: countError } = await supabase
            .from('v_treasury_movements_balance')
            .select('*', { count: 'exact', head: true })
            .eq('box_id', box.id);
        console.log("Total moves count:", countData ? countData : 'unknown');
        console.log("Count Error:", countError);
    } else {
        console.log("No operational box found! This will cause infinite loading.");
        const { data: allBoxes } = await supabase.from('cash_boxes').select('*');
        console.log("All boxes:", allBoxes);
    }
}
run();
