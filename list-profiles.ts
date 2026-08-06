import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  const { data } = await supabase.from('profiles').select('id, first_name, last_name, dni, email');
  data?.forEach(p => console.log(`${p.first_name} ${p.last_name} (${p.email})`));
}
main();
