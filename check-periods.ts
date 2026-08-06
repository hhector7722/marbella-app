import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: totals } = await supabase.from('payroll_monthly_totals').select('period_ym');
  console.log("Totals periods:", [...new Set(totals?.map(t => t.period_ym))]);

  const { data: facts } = await supabase.from('employee_payroll_facts').select('period_ym');
  console.log("Facts periods:", [...new Set(facts?.map(f => f.period_ym))]);
}
main();
