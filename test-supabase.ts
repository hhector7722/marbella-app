import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
async function run() {
    const { data: boxes } = await supabase.from('cash_boxes').select('*');
    console.log('Boxes:', boxes);
    const { data: inv } = await supabase.from('cash_box_inventory').select('*');
    console.log('Inventory:', inv);
}
run();
