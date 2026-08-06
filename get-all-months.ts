import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const months = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07'];
  for (const m of months) {
    const { data: facts } = await supabase.from('employee_payroll_facts').select('id, user_id').eq('period_ym', m);
    const { data: totals } = await supabase.from('payroll_monthly_totals').select('id').eq('period_ym', m);
    
    // get distinct workers
    const uniqueWorkers = facts ? new Set(facts.map(f => f.user_id)).size : 0;
    console.log(`Month: ${m} | Totals: ${totals?.length || 0} | Facts: ${facts?.length || 0} | Unique Workers: ${uniqueWorkers}`);
  }
}
main();
