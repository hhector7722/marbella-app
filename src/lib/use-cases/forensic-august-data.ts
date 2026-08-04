import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !serviceKey) {
    console.error('Faltan credenciales Supabase');
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey);

  console.log('==================================================');
  console.log('[1. CONSULTA COMPLETA] payroll_import_runs para 2026-08:');
  console.log('==================================================');
  const { data: runs, error: err1 } = await supabase
    .from('payroll_import_runs')
    .select('*')
    .eq('period_ym', '2026-08');

  if (err1) console.error('Error:', err1);
  else console.table(runs);

  console.log('\n==================================================');
  console.log('[2. CONSULTA COMPLETA] payroll_monthly_totals para 2026-08:');
  console.log('==================================================');
  const { data: totals, error: err2 } = await supabase
    .from('payroll_monthly_totals')
    .select('*')
    .eq('period_ym', '2026-08');

  if (err2) console.error('Error:', err2);
  else console.table(totals);

  console.log('\n==================================================');
  console.log('[3. CONSULTA COMPLETA] 10 filas de employee_payroll_facts para 2026-08 (Activas):');
  console.log('==================================================');
  const { data: facts, error: err3 } = await supabase
    .from('employee_payroll_facts')
    .select('*')
    .eq('period_ym', '2026-08')
    .eq('status', 'active');

  if (err3) console.error('Error:', err3);
  else console.table(facts);
}

main();
