import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });
import { GetDailyLaborCostUseCase } from './dist/lib/use-cases/get-daily-labor-cost.js';
console.log("IMPORTED");
