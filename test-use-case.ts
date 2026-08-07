import { createClient } from '@supabase/supabase-js';
import { GetDailyLaborCostUseCase } from './src/lib/use-cases/get-daily-labor-cost.ts';
import { config } from 'dotenv';
import fs from 'fs';
config({ path: '.env.local' });
async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const useCase = new GetDailyLaborCostUseCase(supabase);
  const res = await useCase.execute('2026-07-15');
  const alba = res.workers.find(w => w.name.includes('Alba'));
  const mamadou = res.workers.find(w => w.name.includes('Mamadou') || w.name.includes('MAMADOU'));
  fs.writeFileSync('dashboard-output.json', JSON.stringify({ alba, mamadou }, null, 2));
}
main().catch(e => fs.writeFileSync('dashboard-output.json', JSON.stringify({ error: e.message })));
