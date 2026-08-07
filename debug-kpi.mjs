import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 1. Obtener los hechos activos de julio
const { data: facts } = await supabase
  .from('employee_payroll_facts')
  .select('user_id, period_ym, total_company_cost, status, settlement_type, settlement_hash')
  .eq('period_ym', '2026-07')
  .eq('status', 'active');

console.log("=== HECHOS ACTIVOS JULIO 2026 ===");
console.log("Total hechos activos:", facts?.length);

// Agrupar por usuario
const byUser = {};
for (const f of facts || []) {
  byUser[f.user_id] = (byUser[f.user_id] || 0) + Number(f.total_company_cost);
}
console.log("\nCoste consolidado por usuario:");
for (const [uid, cost] of Object.entries(byUser)) {
  console.log(`  ${uid}: ${cost} €`);
}
const sumFacts = Object.values(byUser).reduce((a, b) => a + b, 0);
console.log("\nSUM employee_payroll_facts (activos):", sumFacts.toFixed(2), "€");

// 2. payroll_monthly_totals
const { data: totals } = await supabase
  .from('payroll_monthly_totals')
  .select('total_company_cost')
  .eq('period_ym', '2026-07')
  .maybeSingle();
console.log("\npayroll_monthly_totals.total_company_cost:", totals?.total_company_cost, "€");

// 3. Verificar qué trabajadores tienen contrato activo en julio
const { data: contracts } = await supabase
  .from('hours_contract_terms')
  .select('user_id, effective_from, effective_to')
  .lte('effective_from', '2026-07-31')
  .or('effective_to.is.null,effective_to.gte.2026-07-01');

const contractUserIds = new Set(contracts?.map(c => c.user_id) || []);
console.log("\n=== TRAMOS ACTIVOS EN JULIO ===");
console.log("Trabajadores con contrato activo en julio:", contractUserIds.size);

// 4. Cruzar: ¿cuáles de los hechos activos NO tienen contrato en julio?
console.log("\n=== CRUCE: hechos sin contrato en julio ===");
for (const [uid, cost] of Object.entries(byUser)) {
  if (!contractUserIds.has(uid)) {
    console.log(`  ❌ SIN CONTRATO: ${uid} (${cost} €) → EXCLUIDO del KPI`);
  } else {
    console.log(`  ✅ CON CONTRATO: ${uid} (${cost} €)`);
  }
}

// 5. Calcular lo que vería el dashboard (solo trabajadores con contrato activo en al menos 1 día del mes)
let visibleSum = 0;
for (const [uid, cost] of Object.entries(byUser)) {
  if (contractUserIds.has(uid)) visibleSum += cost;
}
console.log("\nCoste visible en Dashboard (solo con contrato):", visibleSum.toFixed(2), "€");

