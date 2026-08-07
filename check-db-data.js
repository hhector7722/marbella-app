const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function main() {
  const { data } = await supabase.from('employee_payroll_facts').select('user_id, period_ym, status, total_company_cost').eq('period_ym', '2026-07');
  console.log("July Facts: ", data.length);
  console.log("Active Facts: ", data.filter(d => d.status === 'active').length);
}
main();
