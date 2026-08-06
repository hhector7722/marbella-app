import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
async function main() {
  await supabase.from('profiles').update({ payroll_name: 'LARRIPA HUGO RUBIO' }).eq('id', '22c7712d-8a7f-472e-942e-fd6d902789f6');
  await supabase.from('profiles').update({ payroll_name: 'ACOSTA PAU GUIRIGUET' }).eq('id', '22cfb522-15db-4933-972d-08d581e038f3');
  await supabase.from('profiles').update({ payroll_name: 'GUTIERREZ HERNAN DAVID' }).eq('id', '7978ebc0-f264-4f69-b693-4d5d736b227e');
  await supabase.from('profiles').update({ payroll_name: 'ALVEZ DE OLIVERA JUAN JESUS' }).eq('id', 'd5e119bc-e7af-4414-9428-c1aead5fe80f');
  console.log("Updated missing profiles");
}
main();
