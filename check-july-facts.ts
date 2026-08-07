import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: facts } = await supabase.from('employee_payroll_facts').select('*').eq('period_ym', '2026-07');
  console.log("July Facts:", facts?.length);
  const activeFacts = facts?.filter(f => f.status === 'active') || [];
  console.log("Active July Facts:", activeFacts.length);
  
  // Show Alba facts
  const { data: alba } = await supabase.from('profiles').select('id').ilike('first_name', '%Alba%').single();
  if (alba) {
      console.log("Alba Facts:", facts?.filter(f => f.user_id === alba.id).length);
  }
}
main();
