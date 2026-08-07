import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const period = '2026-07';
const { data } = await supabase.from('employee_payroll_facts').select('total_company_cost, settlement_hash').eq('period_ym', period).eq('status', 'active');
const sum = data.reduce((acc, f) => acc + Number(f.total_company_cost), 0);
console.log('After Run 1:', { count: data.length, sum: sum.toFixed(2) });
await supabase.from('payroll_monthly_totals').delete().eq('period_ym', period);
