import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { count } = await supabase.from('time_logs').select('*', { count: 'exact', head: true }).gte('clock_in', '2026-07-01').lt('clock_in', '2026-08-01');
  console.log("Time logs for July:", count);
}
main();
