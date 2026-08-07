import { createClient } from '@supabase/supabase-js';
import { GetDailyLaborCostUseCase } from './src/lib/use-cases/get-daily-labor-cost.ts';
import { config } from 'dotenv';
config({ path: '.env.local' });

async function run() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const useCase = new GetDailyLaborCostUseCase(supabase);
  const res = await useCase.execute('2026-07-15');
  const alba = res.workers.find(w => w.name.includes('Alba'));
  const mamadou = res.workers.find(w => w.name.includes('Mamadou') || w.name.includes('MAMADOU'));
  
  console.log("=== DASHBOARD DTO (ALBA) ===");
  console.log(JSON.stringify(alba, null, 2));
  console.log("=== DASHBOARD DTO (MAMADOU) ===");
  console.log(JSON.stringify(mamadou, null, 2));
}

run().then(() => process.exit(0)).catch(console.error);
