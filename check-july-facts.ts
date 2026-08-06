import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data } = await supabase.from('employee_payroll_facts').select('id, period_ym, status, user_id').eq('period_ym', '2026-07');
  console.log("July Facts:", data);
}
main();
