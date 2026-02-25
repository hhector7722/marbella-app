const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://feqjbwxkelpgzsdiphei.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZlcWpid3hrZWxwZ3pzZGlwaGVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5Mzg1OTYsImV4cCI6MjA4MzUxNDU5Nn0._PztDeXP8DNGaPcheicFWvqwqG3GDfi2n_17WWawJSk');
async function run() {
    const { data: logs } = await supabase.from('treasury_log').select('*').order('created_at', { ascending: false }).limit(2);
    console.log("Treasury logs breakdown:");
    console.dir(logs.map(l => l.breakdown), { depth: null });

    const { data: boxes } = await supabase.from('cash_boxes').select('*');
    console.log("Boxes:");
    console.dir(boxes, { depth: null });
}
run();
