const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function main() {
  const { data } = await supabase.from('profiles').select('id, first_name, last_name, dni, email');
  console.log(data.map(p => `${p.first_name} ${p.last_name}`).join('\n'));
}
main();
