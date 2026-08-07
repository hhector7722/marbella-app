import { createClient } from '@supabase/supabase-js';
import { GetDailyLaborCostUseCase } from './src/lib/use-cases/get-daily-labor-cost.ts';
import { config } from 'dotenv';
config({ path: '.env.local' });

async function run() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  console.log("-> Corriendo Múltiples liquidaciones...");
  const useCase = new GetDailyLaborCostUseCase(supabase);
  const res = await useCase.execute('2026-07-15');
  console.log("Alba total:", res.workers.find(w => w.name.includes('Alba'))?.total);
}
run().catch(console.error);
