import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testRpc() {
    const startDate = '2026-03-01'; // Try current month
    const endDate = '2026-03-31';

    console.log(`Testing RPC get_product_sales_ranking from ${startDate} to ${endDate}...`);

    const { data, error } = await supabase.rpc('get_product_sales_ranking', {
        p_start_date: startDate,
        p_end_date: endDate
    });

    if (error) {
        console.error("❌ RPC Error:", error);
    } else {
        console.log("✅ RPC Success");
        console.log("Data length:", data?.length);
        console.log("Data preview:", data ? data.slice(0, 3) : null);
    }
}

testRpc();
