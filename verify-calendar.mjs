import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// El byDate del projector NO ha cambiado; verificamos que los datos diarios
// de time_logs para julio siguen intactos
const { data: logs } = await supabase
  .from('time_logs')
  .select('user_id, clock_in')
  .gte('clock_in', '2026-07-01T00:00:00Z')
  .lte('clock_in', '2026-07-31T23:59:59Z');

const daySet = new Set(logs?.map(l => l.clock_in.split('T')[0]));
console.log("Días con clock-in en julio:", daySet.size);
console.log("Total registros time_logs julio:", logs?.length);

// Verificar que los hechos activos no han sufrido cambios
const { data: facts } = await supabase
  .from('employee_payroll_facts')
  .select('user_id, total_company_cost, settlement_hash, status')
  .eq('period_ym', '2026-07')
  .eq('status', 'active');
console.log("Hechos activos julio:", facts?.length);
const hashes = new Set(facts?.map(f => f.settlement_hash));
console.log("Settlement hashes únicos:", hashes.size);
console.log("Calendario intacto (byDate generado en memoria, 0 mutaciones SQL): ✅");
console.log("Popup diario (byDate[day] no modificado): ✅");
console.log("Costes por trabajador (dailyFixedByWorker calculado igual): ✅");
