import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data } = await supabase.from('employee_payroll_facts').select('period_ym');
  const distinct = [...new Set(data?.map(d => d.period_ym))];
  console.log("Distinct periods in facts:", distinct);
  const { data: totals } = await supabase.from('payroll_monthly_totals').select('period_ym');
  const distinctTotals = [...new Set(totals?.map(d => d.period_ym))];
  console.log("Distinct periods in totals:", distinctTotals);
}
main();
