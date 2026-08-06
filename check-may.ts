import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: facts } = await supabase.from('employee_payroll_facts').select('id, status').eq('period_ym', '2026-05');
  console.log("Facts for May:", facts?.length, facts?.[0]?.status);
}
main();
