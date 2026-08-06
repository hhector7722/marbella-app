import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data: terms } = await supabase.from('hours_contract_terms').select('*');
  console.log("Contracts:", terms?.slice(0, 3));
  console.log("Total contracts:", terms?.length);
}
main();
