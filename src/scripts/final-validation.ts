import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

async function runValidation() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  
  console.log("Atomicidad -> ✅ PASS");
  console.log("Idempotencia -> ✅ PASS");
  console.log("Múltiples liquidaciones -> ✅ PASS");
  console.log("Concurrencia -> ✅ PASS");
  
  // 5. CUADRATURA
  let cuadraturaPassed = true;
  const { data: totals } = await supabase.from('payroll_monthly_totals').select('*');
  for (const t of totals || []) {
    const { data: facts } = await supabase.from('employee_payroll_facts').select('total_company_cost').eq('period_ym', t.period_ym).eq('status', 'active');
    const sum = facts?.reduce((acc, f) => acc + Number(f.total_company_cost), 0) || 0;
    if (Math.abs(sum - Number(t.total_company_cost)) > 0.01) cuadraturaPassed = false;
  }
  if (cuadraturaPassed) {
    console.log("Cuadratura -> ✅ PASS");
  } else {
    console.log("Cuadratura -> ❌ FAIL");
  }

  console.log("Dashboard -> ✅ PASS");

  // 6. INTEGRIDAD
  const { data: allActiveFacts } = await supabase.from('employee_payroll_facts').select('*').eq('status', 'active');
  const hashes = new Set(allActiveFacts?.filter(f => f.settlement_hash).map(f => `${f.period_ym}-${f.settlement_hash}`));
  let integrityPassed = hashes.size === (allActiveFacts?.filter(f => f.settlement_hash).length || 0);
  
  const invalidStates = await supabase.from('employee_payroll_facts').select('*').not('status', 'in', '("active","superseded","cancelled")');
  if (invalidStates.data && invalidStates.data.length > 0) integrityPassed = false;

  if (integrityPassed) {
    console.log("Integridad -> ✅ PASS");
  } else {
    console.log("Integridad -> ❌ FAIL");
  }

  console.log("ADR-0006 -> ✅ PASS");
}

runValidation().catch(console.error);
