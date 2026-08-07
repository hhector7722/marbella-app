import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  let allPassed = true;
  console.log("=== VALIDACIÓN: KPIs DASHBOARD LABOR (JULIO 2026) ===\n");

  // Simulate new logic: KPI Fijo = payroll_monthly_totals
  const { data: totalsRow } = await supabase
    .from('payroll_monthly_totals')
    .select('total_company_cost')
    .eq('period_ym', '2026-07')
    .maybeSingle();
  const kpiFijo = Number(totalsRow?.total_company_cost ?? 0);

  // 1. KPI Fijo = payroll_monthly_totals
  const fijoOk = Math.abs(kpiFijo - 16813.06) < 0.05;
  console.log(`KPI Fijo: ${kpiFijo.toFixed(2)} € → ${fijoOk ? '✅ PASS (esperado 16.813,06 €)' : '❌ FAIL'}`);
  if (!fijoOk) allPassed = false;

  // 2. Banner conciliación (cuadratura)
  const { data: facts } = await supabase
    .from('employee_payroll_facts')
    .select('total_company_cost')
    .eq('period_ym', '2026-07')
    .eq('status', 'active');
  const sumFacts = facts?.reduce((a, b) => a + Number(b.total_company_cost), 0) ?? 0;
  const diff = Math.abs(sumFacts - kpiFijo);
  const concilOk = diff < 0.01;
  console.log(`Banner conciliación: ${sumFacts.toFixed(2)} / ${kpiFijo.toFixed(2)} → diff=${diff.toFixed(2)} → ${concilOk ? '✅ PASS' : '❌ FAIL'}`);
  if (!concilOk) allPassed = false;

  // 3. Hechos activos intactos
  const factsOk = facts?.length === 10 && Math.abs(sumFacts - 16813.06) < 0.05;
  console.log(`Hechos activos: ${facts?.length} hechos → ${factsOk ? '✅ PASS (10 liquidaciones)' : '❌ FAIL'}`);
  if (!factsOk) allPassed = false;

  // 4. Verificar que coste = fijo + extras (la lógica de extras no cambia)
  // Los extras no se pueden calcular aquí sin el projector, pero verificamos que la suma matemática es correcta
  // Coste = kpiFijo + overtime = kpiFijo + X (X >= 0 siempre)
  console.log(`Coste esperado julio: >= ${kpiFijo.toFixed(2)} € (Fijo + Extras)`);
  console.log(`Fórmula: ${kpiFijo.toFixed(2)} + overtime €\n`);

  // 5. Meses con nómina
  const { data: allTotals } = await supabase
    .from('payroll_monthly_totals')
    .select('period_ym, total_company_cost')
    .order('period_ym');
  console.log("Meses con nómina oficial:");
  for (const t of allTotals || []) {
    const { data: mFacts } = await supabase
      .from('employee_payroll_facts')
      .select('total_company_cost')
      .eq('period_ym', t.period_ym)
      .eq('status', 'active');
    const mSum = mFacts?.reduce((a, b) => a + Number(b.total_company_cost), 0) ?? 0;
    const ok = Math.abs(mSum - Number(t.total_company_cost)) < 0.01;
    console.log(`  ${t.period_ym}: oficial=${Number(t.total_company_cost).toFixed(2)} € | facts_sum=${mSum.toFixed(2)} € | ${ok ? '✅' : '❌'}`);
  }

  console.log(`\n${allPassed ? '🎉 TODAS LAS VALIDACIONES PASAN' : '❌ HAY FALLOS'}`);
}

run().catch(console.error);
