const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function main() {
  const { data } = await supabase.from('employee_payroll_facts').select('*').eq('period_ym', '2026-07');
  console.log(data);
}
main();
