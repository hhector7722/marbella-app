import { createClient } from '@supabase/supabase-js';
import { buildEmployeeHistoryMonthFromEngine } from './src/lib/read-models/week-display-from-engine.ts';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function main() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: profiles } = await supabase.from('profiles').select('id, first_name').eq('first_name', 'Bali');
  const baliId = profiles![0].id;
  
  const weeks = await buildEmployeeHistoryMonthFromEngine(supabase as any, {
    userId: baliId,
    filterYear: 2026,
    filterMonth: 6, // July
  });
  
  const week27 = weeks.find(w => w.startDate.startsWith('2026-06-29'));
  console.log("Week 27 Summary:", JSON.stringify(week27?.summary, null, 2));
}

main().catch(console.error);
