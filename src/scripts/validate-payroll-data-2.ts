import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { LaborCostMonthReadModelProjector } from '../lib/read-models/labor-cost-month-projector.ts';
import { LaborCostDayReadModelProjector } from '../lib/read-models/labor-cost-day-projector.ts';
import { PayrollFactRepository } from '../lib/payroll/payroll-fact-repository.ts';

dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const periods = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07'];
  
  console.log('\n=== VALIDACIÓN 2: Dashboard Labor ===');
  const dayProjector = new LaborCostDayReadModelProjector(supabase);
  const payrollRepo = new PayrollFactRepository(supabase);
  const monthProjector = new LaborCostMonthReadModelProjector(supabase, dayProjector, payrollRepo);
  
  for (const p of periods) {
    try {
      const summary = await monthProjector.projectMonthSummary(p);
      const { data: total } = await supabase.from('payroll_monthly_totals').select('total_company_cost').eq('period_ym', p).maybeSingle();
      
      const dashboardCost = summary.totalCost;
      const officialCost = total?.total_company_cost || 0;
      const matches = Math.abs(dashboardCost - officialCost) < 0.01;
      
      console.log(`| ${p} | ${dashboardCost.toFixed(2)} | ${officialCost.toFixed(2)} | ${matches ? 'SÍ' : 'NO'} |`);
    } catch (e) {
      console.log(`Error en ${p}:`, e);
    }
  }

  console.log('\n=== VALIDACIÓN 3: Integridad ===');
  const { data: noUserId } = await supabase.from('employee_payroll_facts').select('id').is('user_id', null);
  console.log(`1. Sin employee_id: ${noUserId?.length || 0}`);
  
  const { data: allFacts } = await supabase.from('employee_payroll_facts').select('user_id, period_ym');
  const duplicates = (allFacts || []).reduce((acc, f) => {
    const key = `${f.period_ym}_${f.user_id}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const hasDups = Object.values(duplicates).some(c => c > 1);
  console.log(`2. Duplicados: ${hasDups ? 'SÍ' : 'NO'}`);
  
  const { data: monthlyTotals } = await supabase.from('payroll_monthly_totals').select('period_ym, file_path').in('period_ym', periods);
  const missingPeriods = periods.filter(p => !monthlyTotals?.find(m => m.period_ym === p));
  console.log(`3. Meses sin resumen: ${missingPeriods.length > 0 ? missingPeriods.join(', ') : 'NINGUNO'}`);
  
  const missingFilePath = monthlyTotals?.filter(m => !m.file_path);
  console.log(`4. Resúmenes sin file_path: ${missingFilePath?.length || 0}`);
}
main();
