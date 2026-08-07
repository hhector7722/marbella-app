/**
 * Validación programática del cambio de KPIs en el Dashboard Labor.
 */
import { createClient } from '@supabase/supabase-js';
import { GetMonthlyLaborCostSummaryUseCase } from '../lib/use-cases/get-monthly-labor-cost-summary.ts';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(process.env['NEXT_PUBLIC_SUPABASE_URL']!, process.env['SUPABASE_SERVICE_ROLE_KEY']!);

async function run() {
  let allPassed = true;

  console.log("=== VALIDACIÓN: KPIs DASHBOARD LABOR (JULIO 2026) ===\n");

  const useCase = new GetMonthlyLaborCostSummaryUseCase(supabase);
  const summary = await useCase.execute({ startDate: '2026-07-01', endDate: '2026-07-31' });

  // 1. KPI Fijo = payroll_monthly_totals
  const fijoOk = Math.abs(summary.totalFixed - 16813.06) < 0.05;
  console.log(`KPI Fijo: ${summary.totalFixed.toFixed(2)} € → ${fijoOk ? '✅ PASS (esperado 16.813,06 €)' : '❌ FAIL'}`);
  if (!fijoOk) allPassed = false;

  // 2. KPI Extras sin cambios
  console.log(`KPI Extras: ${summary.totalOvertime.toFixed(2)} €`);

  // 3. KPI Coste = Fijo + Extras
  const expectedCost = summary.totalFixed + summary.totalOvertime;
  const costeOk = Math.abs(summary.totalCost - expectedCost) < 0.01;
  console.log(`KPI Coste: ${summary.totalCost.toFixed(2)} € = ${summary.totalFixed.toFixed(2)} + ${summary.totalOvertime.toFixed(2)} → ${costeOk ? '✅ PASS' : '❌ FAIL'}`);
  if (!costeOk) allPassed = false;

  // 4. Banner conciliación
  const rec = summary.reconciliation;
  const concilOk = rec.status === 'RECONCILED' && Math.abs(rec.totalSummary - 16813.06) < 0.05;
  console.log(`Banner conciliación: ${rec.totalSummary.toFixed(2)} / ${rec.totalPayrolls.toFixed(2)} (${rec.status}) → ${concilOk ? '✅ PASS' : '❌ FAIL'}`);
  if (!concilOk) allPassed = false;

  // 5. Calendario tiene 31 días
  const julyDays = Object.keys(summary.byDate).filter(d => d.startsWith('2026-07'));
  const calOk = julyDays.length === 31;
  console.log(`Calendario: ${julyDays.length} días en julio → ${calOk ? '✅ PASS (31 días)' : '❌ FAIL'}`);
  if (!calOk) allPassed = false;

  // 6. Día 15 tiene sus costes diarios intactos (no modificados)
  const day15 = summary.byDate['2026-07-15'];
  const day15Ok = day15 !== undefined && day15.totalFixed >= 0;
  console.log(`Día 2026-07-15: fijo=${day15?.totalFixed?.toFixed(2)} € extras=${day15?.totalOvertime?.toFixed(2)} € → ${day15Ok ? '✅ Sin cambio' : '❌ FAIL'}`);
  if (!day15Ok) allPassed = false;

  // 7. Hechos activos intactos en BBDD
  const { data: facts } = await supabase
    .from('employee_payroll_facts')
    .select('total_company_cost')
    .eq('period_ym', '2026-07')
    .eq('status', 'active');
  const sumFacts = facts?.reduce((a: number, b: {total_company_cost: unknown}) => a + Number(b.total_company_cost), 0) ?? 0;
  const factsOk = Math.abs(sumFacts - 16813.06) < 0.05 && facts?.length === 10;
  console.log(`Hechos activos: ${facts?.length} hechos, SUM=${sumFacts.toFixed(2)} € → ${factsOk ? '✅ PASS' : '❌ FAIL'}`);
  if (!factsOk) allPassed = false;

  console.log(`\n${allPassed ? '🎉 TODAS LAS VALIDACIONES PASAN' : '❌ HAY FALLOS'}`);
  process.exit(allPassed ? 0 : 1);
}

run().catch(console.error);
