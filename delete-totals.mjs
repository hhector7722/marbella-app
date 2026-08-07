import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
await supabase.from('payroll_monthly_totals').delete().in('period_ym', ['2026-06', '2026-07']);
console.log('Deleted totals for 2026-06 and 2026-07');
