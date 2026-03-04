import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data: tickets } = await supabase.from('tickets_marbella').select('numero_documento, fecha, hora_cierre').limit(5);
    console.log(tickets);
}

check();
