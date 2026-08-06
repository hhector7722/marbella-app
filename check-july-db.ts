import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  try {
    const { data: facts } = await supabase.from('employee_payroll_facts').select('id').eq('period_ym', '2026-07');
    console.log("Facts for July:", facts?.length);
    const { data: totals } = await supabase.from('payroll_monthly_totals').select('id').eq('period_ym', '2026-07');
    console.log("Totals for July:", totals?.length);
  } catch (e) {
    console.error(e);
  }
}
main();
