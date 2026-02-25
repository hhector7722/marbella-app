const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://feqjbwxkelpgzsdiphei.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZlcWpid3hrZWxwZ3pzZGlwaGVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5Mzg1OTYsImV4cCI6MjA4MzUxNDU5Nn0._PztDeXP8DNGaPcheicFWvqwqG3GDfi2n_17WWawJSk');

async function run() {
    const { data: boxes } = await supabase.from('cash_boxes').select('id').limit(1);
    if (!boxes || boxes.length === 0) return console.log('No boxes found');
    const boxId = boxes[0].id;

    console.log('Testing insert on box:', boxId);
    const { data, error } = await supabase.from('treasury_log').insert({
        box_id: boxId,
        type: 'IN',
        amount: 10,
        breakdown: { "10": 1 },
        notes: 'Trigger test'
    }).select();

    if (error) {
        console.error('INSERT ERROR:', error);
    } else {
        console.log('INSERT SUCCESS:', data);
        // clean up
        await supabase.from('treasury_log').delete().eq('id', data[0].id);
    }
}
run();
