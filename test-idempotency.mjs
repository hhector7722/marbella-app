import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import { config } from 'dotenv';
config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const period = '2026-07';

async function countActiveFacts() {
  const { data } = await supabase.from('employee_payroll_facts').select('total_company_cost, settlement_hash').eq('period_ym', period).eq('status', 'active');
  const sum = data.reduce((acc, f) => acc + Number(f.total_company_cost), 0);
  return { count: data.length, sum: sum.toFixed(2) };
}

console.log('[IDEMPOTENCY] Run 1:');
console.log('Before Run 1:', await countActiveFacts());
await supabase.from('payroll_monthly_totals').delete().eq('period_ym', period);
execSync('npx tsx src/scripts/payroll-backfill.ts', { stdio: 'ignore' });
console.log('After Run 1:', await countActiveFacts());

console.log('[IDEMPOTENCY] Run 2 (Importing exact same PDF again):');
await supabase.from('payroll_monthly_totals').delete().eq('period_ym', period);
execSync('npx tsx src/scripts/payroll-backfill.ts', { stdio: 'ignore' });
console.log('After Run 2:', await countActiveFacts());

console.log('[IDEMPOTENCY] Run 3 (Importing exact same PDF again):');
await supabase.from('payroll_monthly_totals').delete().eq('period_ym', period);
execSync('npx tsx src/scripts/payroll-backfill.ts', { stdio: 'ignore' });
console.log('After Run 3:', await countActiveFacts());

