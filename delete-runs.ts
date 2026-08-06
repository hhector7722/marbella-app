import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  await supabase.from('payroll_import_runs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('payroll_monthly_totals').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  console.log("Deleted old runs");
}
main();
