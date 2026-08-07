import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
import { GetDailyLaborCostUseCase } from './src/lib/use-cases/get-daily-labor-cost.ts';

async function main() {
  const months = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07'];

  console.log("=== 1 & 2. BASE DE DATOS Y CUADRATURA ===");
  for (const m of months) {
    const { data: totals } = await supabase.from('payroll_monthly_totals').select('*').eq('period_ym', m);
    const { data: facts } = await supabase.from('employee_payroll_facts').select('*').eq('period_ym', m).eq('status', 'active');
    
    const totalCompanyCost = totals && totals.length > 0 ? Number(totals[0].total_company_cost) : 0;
    const sumFacts = facts ? facts.reduce((acc, f) => acc + Number(f.total_company_cost), 0) : 0;
    const diff = totalCompanyCost - sumFacts;
    
    // Check multiple liquidations for a single user
    const usersCount = new Set(facts?.map(f => f.user_id)).size;
    const factsCount = facts?.length || 0;
    
    console.log(`| ${m} | ${totalCompanyCost.toFixed(2)} | ${sumFacts.toFixed(2)} | ${diff.toFixed(2)} € | (Totals records: ${totals?.length}, Facts: ${factsCount}, Unique Users: ${usersCount})`);
    
    // Show workers with multiple facts
    if (factsCount > usersCount) {
      const counts: Record<string, number> = {};
      facts?.forEach(f => { counts[f.user_id] = (counts[f.user_id] || 0) + 1; });
      for (const [uid, count] of Object.entries(counts)) {
        if (count > 1) {
            console.log(`  -> User ${uid} has ${count} liquidations in ${m}`);
        }
      }
    }
  }

  console.log("\n=== 3. READ MODELS (Agregación) ===");
  const useCase = new GetDailyLaborCostUseCase(supabase);
  
  // July 15th (Alba has 2 liquidations)
  const result = await useCase.execute('2026-07-15', { includeAllContracted: true });
  console.log(`Date: ${result.dateYmd}`);
  console.log(`Workers shown: ${result.workers.length}`);
  
  // Find Alba (assuming id 97a9cb0d-f9c5-4a01-800e-a5a0bcde5848)
  const alba = result.workers.find(w => w.name.includes('Alba'));
  console.log(`Alba is present? ${!!alba}. Name: ${alba?.name}. Fixed cost: ${alba?.fixed}. Appears exactly once? ${result.workers.filter(w => w.name.includes('Alba')).length === 1}`);
  
  // Find Mamadou
  const mamadou = result.workers.find(w => w.name.includes('Mamadou'));
  console.log(`Mamadou is present? ${!!mamadou}. Name: ${mamadou?.name}. Fixed cost: ${mamadou?.fixed}. Appears exactly once? ${result.workers.filter(w => w.name.includes('Mamadou')).length === 1}`);
}
main();
