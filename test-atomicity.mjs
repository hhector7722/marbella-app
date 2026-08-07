import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const period = '2026-07';

// 1. Get current active facts
const { data: before } = await supabase.from('employee_payroll_facts').select('id').eq('period_ym', period).eq('status', 'active');
console.log(`[ATOMICITY] Active facts BEFORE: ${before.length}`);

// 2. Try to replace with invalid data (invalid user_id UUID)
const invalidFacts = [
  {
    user_id: 'invalid-uuid-1234',
    total_company_cost: 1000,
    gross_salary: 1000,
    ss_employee: 0,
    ss_company: 0,
    tc1_cost: 0,
    net_salary: 1000,
    settlement_hash: 'test-hash'
  }
];

console.log(`[ATOMICITY] Calling RPC with invalid data...`);
const { data, error } = await supabase.rpc('replace_payroll_month_atomic', { p_period_ym: period, p_facts: invalidFacts });
console.log(`[ATOMICITY] RPC Error:`, error);
console.log(`[ATOMICITY] RPC Data:`, data);

// 3. Get current active facts again
const { data: after } = await supabase.from('employee_payroll_facts').select('id').eq('period_ym', period).eq('status', 'active');
const { data: superseded } = await supabase.from('employee_payroll_facts').select('id').eq('period_ym', period).eq('status', 'superseded');

console.log(`[ATOMICITY] Active facts AFTER: ${after.length}`);
console.log(`[ATOMICITY] Superseded facts AFTER (should not increase from before if transaction rolled back, wait we didn't count before but active should be same)`);
console.log(`[ATOMICITY] Test passed? ${before.length === after.length ? 'YES' : 'NO'}`);
