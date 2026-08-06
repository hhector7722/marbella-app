import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data } = await supabase.from('profiles').select('first_name, last_name, id').or('first_name.ilike.%Hernan%,first_name.ilike.%Juan%,first_name.ilike.%Hugo%,first_name.ilike.%Pau%');
  console.log(data);
}
main();
