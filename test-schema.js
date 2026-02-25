const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://feqjbwxkelpgzsdiphei.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZlcWpid3hrZWxwZ3pzZGlwaGVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5Mzg1OTYsImV4cCI6MjA4MzUxNDU5Nn0._PztDeXP8DNGaPcheicFWvqwqG3GDfi2n_17WWawJSk');
async function run() {
    const { data, error } = await supabase.rpc('get_schema_info', { table_name: 'cash_box_inventory' }).catch(() => ({}));
    if (data) console.log('RPC result:', data);

    // Alternative: insert a dummy row to see an error, or just use the REST API
    const res = await fetch(`https://feqjbwxkelpgzsdiphei.supabase.co/rest/v1/cash_box_inventory?limit=1`, {
        method: "OPTIONS",
        headers: {
            "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZlcWpid3hrZWxwZ3pzZGlwaGVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5Mzg1OTYsImV4cCI6MjA4MzUxNDU5Nn0._PztDeXP8DNGaPcheicFWvqwqG3GDfi2n_17WWawJSk"
        }
    });
    console.log(await res.text());
}
run();
