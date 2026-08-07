import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Verificar qué trabajadores tienen visible_in_plantilla = true
const { data: profiles } = await supabase
  .from('profiles')
  .select('id, first_name, last_name, visible_in_plantilla, contract_type')
  .eq('visible_in_plantilla', true);

const profileIds = new Set(profiles?.map(p => p.id) || []);
console.log("Trabajadores visible_in_plantilla=true:", profiles?.length);

// Obtener hechos activos julio
const { data: facts } = await supabase
  .from('employee_payroll_facts')
  .select('user_id, total_company_cost')
  .eq('period_ym', '2026-07')
  .eq('status', 'active');

const byUser = {};
for (const f of facts || []) {
  byUser[f.user_id] = (byUser[f.user_id] || 0) + Number(f.total_company_cost);
}

console.log("\n=== CRUCE: hechos VS visible_in_plantilla ===");
for (const [uid, cost] of Object.entries(byUser)) {
  const profile = profiles?.find(p => p.id === uid);
  if (!profileIds.has(uid)) {
    console.log(`  ❌ NO ESTÁ EN PLANTILLA: ${uid} (${cost} €)`);
  } else {
    console.log(`  ✅ ${profile?.first_name} ${profile?.last_name}: ${cost} €`);
  }
}

// Suma solo de los que están en plantilla
let visibleSum = 0;
for (const [uid, cost] of Object.entries(byUser)) {
  if (profileIds.has(uid)) visibleSum += cost;
}
console.log("\nCoste SUM (solo plantilla visible):", visibleSum.toFixed(2), "€");

// También verificar: ¿qué hace filterVisiblePlantillaEmployees exactamente?
// Buscar su filtro real en la base de datos
const { data: allProfiles } = await supabase
  .from('profiles')
  .select('id, first_name, last_name, visible_in_plantilla, contract_type, end_date');
console.log("\n=== TODOS LOS PERFILES ===");
for (const p of allProfiles || []) {
  const hasFact = byUser[p.id] !== undefined;
  console.log(`  ${p.first_name} ${p.last_name} | visible=${p.visible_in_plantilla} | contract_type=${p.contract_type} | end_date=${p.end_date} | tiene_hecho_julio=${hasFact} (${byUser[p.id] ?? 0} €)`);
}
