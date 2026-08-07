import { createClient } from '@supabase/supabase-js';
import { GetDailyLaborCostUseCase } from './src/lib/use-cases/get-daily-labor-cost.ts';
import { config } from 'dotenv';

config({ path: '.env.local' });
async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const useCase = new GetDailyLaborCostUseCase(supabase);
  const res = await useCase.execute('2026-07-15');
  const alba = res.workers.find(w => w.fullName.includes('Alba'));
  console.log('Alba fixed cost read model:', alba?.fixedCost);
  const mamadou = res.workers.find(w => w.fullName.includes('Mamadou'));
  console.log('Mamadou fixed cost read model:', mamadou?.fixedCost);
}

main().catch(console.error);
