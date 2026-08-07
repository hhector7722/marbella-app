import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// El month projector calcula dailyFixedByWorker = cost / activeDays
// Y el dashboard solo suma workers con hasActivity (tienen clock-ins) o con overtime
// Por tanto el KPI "Coste" del encabezado es: suma de dayTotal solo para días donde el trabajador tiene actividad

// Verificar qué días de julio tienen time_logs para cada trabajador con hecho
const workerIds = [
  { id: '97a9cb0d-f9c5-4a01-800e-a5a0bcde5848', name: 'Alba', cost: 4061.14 },
  { id: '048018f9-76cc-4fe2-a966-de769977cc07', name: 'Mamadou', cost: 3389.95 },
  { id: 'baacc78a-b7da-438e-8ea4-c9f3ce6f90e6', name: 'Hector', cost: 2749.21 },
  { id: '7978ebc0-f264-4f69-b693-4d5d736b227e', name: 'Hernan', cost: 2749.21 },
  { id: '56e8aa3b-a2d9-4bee-9caa-b302df71f988', name: 'Pere', cost: 1753.03 },
  { id: '57dc0ada-2275-45a9-b79d-5361249fb665', name: 'Silvia', cost: 1099.7 },
  { id: '4390a1ee-b8e8-48f4-90e4-0374a97b48c5', name: 'Lucia', cost: 505.41 },
  { id: '2a45bdcd-8850-4dc2-bd1e-50be0196106c', name: 'Guillem Ruiz', cost: 505.41 },
];

// Obtener contratos activos en julio
const { data: contracts } = await supabase
  .from('hours_contract_terms')
  .select('user_id, effective_from, effective_to')
  .in('user_id', workerIds.map(w => w.id))
  .lte('effective_from', '2026-07-31')
  .or('effective_to.is.null,effective_to.gte.2026-07-01');

// Calcular días vigentes en julio para cada trabajador
function activeDaysInJuly(userId) {
  const userContracts = contracts.filter(c => c.user_id === userId);
  if (!userContracts.length) return 0;
  let count = 0;
  for (let d = 1; d <= 31; d++) {
    const day = `2026-07-${String(d).padStart(2,'0')}`;
    const inRange = userContracts.some(c => {
      const from = c.effective_from.split('T')[0];
      const to = c.effective_to ? c.effective_to.split('T')[0] : '9999-12-31';
      return day >= from && day <= to;
    });
    if (inRange) count++;
  }
  return count;
}

console.log("=== DÍAS VIGENTES EN JULIO Y COSTE DIARIO ===");
for (const w of workerIds) {
  const days = activeDaysInJuly(w.id);
  const daily = days > 0 ? (w.cost / days).toFixed(2) : 0;
  console.log(`  ${w.name}: ${w.cost} € / ${days} días = ${daily} €/día`);
}

// Ahora: ¿cuántos días tienen clock-ins en julio cada trabajador?
const { data: timelogs } = await supabase
  .from('time_logs')
  .select('user_id, clock_in')
  .in('user_id', workerIds.map(w => w.id))
  .gte('clock_in', '2026-07-01T00:00:00Z')
  .lte('clock_in', '2026-07-31T23:59:59Z');

const clockInDaysByUser = {};
for (const log of timelogs || []) {
  const day = log.clock_in.split('T')[0];
  if (!clockInDaysByUser[log.user_id]) clockInDaysByUser[log.user_id] = new Set();
  clockInDaysByUser[log.user_id].add(day);
}

console.log("\n=== DÍAS CON CLOCK-IN EN JULIO Y COSTE ESTIMADO EN DASHBOARD ===");
let dashboardTotal = 0;
for (const w of workerIds) {
  const days = activeDaysInJuly(w.id);
  const daily = days > 0 ? w.cost / days : 0;
  const clockInDays = (clockInDaysByUser[w.id]?.size || 0);
  const dashboardContrib = daily * clockInDays;
  dashboardTotal += dashboardContrib;
  console.log(`  ${w.name}: ${clockInDays} días con clock-in × ${daily.toFixed(2)} €/día = ${dashboardContrib.toFixed(2)} €`);
}
console.log("\nTOTAL Dashboard KPI 'Coste' (estimado):", dashboardTotal.toFixed(2), "€");
console.log("payroll_monthly_totals:", "16813.06 €");
console.log("DIFERENCIA:", (16813.06 - dashboardTotal).toFixed(2), "€");
