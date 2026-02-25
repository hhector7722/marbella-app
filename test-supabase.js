const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://feqjbwxkelpgzsdiphei.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZlcWpid3hrZWxwZ3pzZGlwaGVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5Mzg1OTYsImV4cCI6MjA4MzUxNDU5Nn0._PztDeXP8DNGaPcheicFWvqwqG3GDfi2n_17WWawJSk');
async function run() {
    const { data: inv } = await supabase.from('cash_box_inventory').select('*');
    console.log('Inventory amounts:', inv?.length);
    console.dir(inv, { depth: null });
}
run();
