import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
    const { data, error } = await supabase
        .from('tickets_marbella')
        .select('numero_documento, fecha, hora_cierre')
        .order('fecha', { ascending: false })
        .limit(10);

    if (error) {
        console.error("DB Error:", error);
    } else {
        console.log("LAST 10 TICKETS:");
        console.log(JSON.stringify(data, null, 2));
    }
}

check();
