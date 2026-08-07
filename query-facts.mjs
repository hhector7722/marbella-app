import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: alba } = await supabase.from('profiles').select('id, first_name, last_name').ilike('first_name', '%Alba%').single();
const { data: mamadou } = await supabase.from('profiles').select('id, first_name, last_name').ilike('first_name', '%Mamadou%').single();

const { data: albaFacts } = await supabase.from('employee_payroll_facts').select('total_company_cost, status, version, settlement_hash').eq('user_id', alba.id).eq('period_ym', '2026-07');
console.log('Alba July Facts:', albaFacts);

const { data: mamadouFacts } = await supabase.from('employee_payroll_facts').select('total_company_cost, status, version, settlement_hash').eq('user_id', mamadou.id).eq('period_ym', '2026-07');
console.log('Mamadou July Facts:', mamadouFacts);
