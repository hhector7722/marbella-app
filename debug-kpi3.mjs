import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const HIDDEN = new Set(['ramon', 'ramón', 'empleado']);

// Los month projectors hacen: .from('profiles').select('id, first_name, last_name, avatar_url') SIN filtro de visible_in_plantilla
const { data: allProfiles } = await supabase
  .from('profiles')
  .select('id, first_name, last_name, avatar_url, visible_in_plantilla, end_date');

function filterVisible(profiles) {
  return profiles.filter(p => {
    const name = (p.first_name || '').trim().toLowerCase();
    if (HIDDEN.has(name)) return false;
    return p.visible_in_plantilla !== false;
  });
}

const visible = filterVisible(allProfiles || []);
const visibleIds = new Set(visible.map(p => p.id));
console.log("Perfiles visibles en plantilla (tras filterVisiblePlantillaEmployees):", visible.length);
for (const p of visible) {
  console.log(`  ${p.id} | ${p.first_name} ${p.last_name} | visible=${p.visible_in_plantilla}`);
}

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

console.log("\n=== CRUCE hechos vs plantilla visible ===");
let sumVisible = 0;
let sumNotVisible = 0;
for (const [uid, cost] of Object.entries(byUser)) {
  const p = allProfiles.find(p => p.id === uid);
  if (visibleIds.has(uid)) {
    console.log(`  ✅ EN PLANTILLA: ${p?.first_name} ${p?.last_name} → ${cost} €`);
    sumVisible += cost;
  } else {
    console.log(`  ❌ EXCLUIDO: ${p?.first_name || uid} → ${cost} €`);
    sumNotVisible += cost;
  }
}

console.log("\nSUM visible en Dashboard:", sumVisible.toFixed(2), "€");
console.log("SUM excluidos:", sumNotVisible.toFixed(2), "€");
console.log("SUM total:", (sumVisible + sumNotVisible).toFixed(2), "€");

