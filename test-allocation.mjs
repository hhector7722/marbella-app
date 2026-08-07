import { createClient } from '@supabase/supabase-js';
import { PayrollFactRepository } from './src/lib/payroll/payroll-fact-repository.ts';
import { ContractTermsService } from './src/lib/payroll/contract-terms-service.ts';
import { PayrollAllocationService } from './src/lib/payroll/payroll-allocation-service.ts';
import { config } from 'dotenv';
config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const repo = new PayrollFactRepository(supabase);
const contract = new ContractTermsService(supabase);
const alloc = new PayrollAllocationService(repo, contract);

const { data: alba } = await supabase.from('profiles').select('id, first_name').ilike('first_name', '%Alba%').single();
const albaCost = await alloc.getDailyPayrollCost(alba.id, '2026-07-15');
console.log('Alba July 15 cost:', albaCost);

const { data: mamadou } = await supabase.from('profiles').select('id, first_name').ilike('first_name', '%Mamadou%').single();
const mamadouCost = await alloc.getDailyPayrollCost(mamadou.id, '2026-07-15');
console.log('Mamadou July 15 cost:', mamadouCost);
