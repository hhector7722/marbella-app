import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
import { GetDailyLaborCostUseCase } from './src/lib/use-cases/get-daily-labor-cost.ts';

async function main() {
  const useCase = new GetDailyLaborCostUseCase(supabase);
  const result = await useCase.execute('2026-07-15', { includeAllContracted: true });
  console.log(`Date: ${result.dateYmd}`);
  console.log(`Total Fixed: ${result.totalFixed}`);
  console.log(`Workers with fixed > 0: ${result.workers.filter(w => w.fixed > 0).length}`);
  
  if (result.workers.length > 0) {
      const w = result.workers.find(w => w.fixed > 0);
      console.log(`Sample worker: ${w?.name}, Fixed: ${w?.fixed}, Overtime: ${w?.overtime}`);
  }
}
main();
