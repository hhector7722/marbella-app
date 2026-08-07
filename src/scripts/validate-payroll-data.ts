import { createClient } from '@supabase/supabase-js';
import { LaborCostMonthReadModelProjector } from '../lib/read-models/labor-cost-month-projector.ts';
import { LaborCostDayReadModelProjector } from '../lib/read-models/labor-cost-day-projector.ts';
import { PayrollFactRepository } from '../lib/payroll/payroll-fact-repository.ts';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const periods = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07'];
  
  console.log('=== VALIDACIÓN 1: Cuadratura ===');
  for (const p of periods) {
    const { data: facts } = await supabase.from('employee_payroll_facts').select('user_id, total_company_cost').eq('period_ym', p).eq('status', 'active');
    const { data: total } = await supabase.from('payroll_monthly_totals').select('total_company_cost').eq('period_ym', p).maybeSingle();
    const { data: run } = await supabase.from('payroll_import_runs').select('error_message').eq('period_ym', p).order('created_at', { ascending: false }).limit(1).maybeSingle();
    
    const sumFacts = (facts || []).reduce((acc, f) => acc + (f.total_company_cost || 0), 0);
    const totalCompanyCost = total?.total_company_cost || 0;
    const diff = Math.abs(sumFacts - totalCompanyCost);
    
    console.log(`| ${p} | ${sumFacts.toFixed(2)} | ${totalCompanyCost.toFixed(2)} | ${diff.toFixed(2)} |`);
    
    if (diff > 0.01) {
      console.log(`❌ DESCUADRE DETECTADO EN ${p}`);
      console.log(`El total oficial es ${totalCompanyCost}, pero la suma de los trabajadores es ${sumFacts}. Faltan ${(totalCompanyCost - sumFacts).toFixed(2)} €.`);
      console.log(`Trabajadores omitidos por no encontrar apellidos:\n${run?.error_message}`);
    }
  }

  // Si no hay errores (que los habrá), seguiremos...
}
main().catch(console.error);
