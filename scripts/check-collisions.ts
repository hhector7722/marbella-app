import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnv() {
  const envPaths = [path.resolve(__dirname, '../.env.local'), path.resolve(__dirname, '../.env')];
  for (const p of envPaths) {
    if (!fs.existsSync(p)) continue;
    const content = fs.readFileSync(p, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (!process.env[key]) process.env[key] = val;
    }
  }
}
loadEnv();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function check() {
  const tablesToCheck = ['activities', 'categories', 'activity_kinds', 'venues', 'activity_occurrences', 'occurrence_venues', 'occurrence_groups'];
  
  for (const t of tablesToCheck) {
    const { data, error } = await supabase.from(t as any).select('*', { count: 'exact', head: true });
    if (!error) {
      console.log(`${t}: ❌ TABLE ALREADY EXISTS`);
    } else if (error.message.includes('Could not find the table')) {
      console.log(`${t}: ✅ No existe (safe to create)`);
    } else {
      console.log(`${t}: ⚠️ ${error.message}`);
    }
  }
  
  // Check existing categories columns
  const { data: catData } = await supabase.from('categories' as any).select('*').limit(1);
  if (catData && catData.length > 0) {
    console.log(`\nExisting categories columns: ${Object.keys(catData[0]).join(', ')}`);
  } else if (catData) {
    console.log(`\nExisting categories: table exists but empty`);
  }
  
  // Check pavilion_activity_sheets
  const { count } = await supabase.from('pavilion_activity_sheets' as any).select('*', { count: 'exact', head: true });
  console.log(`\npavilion_activity_sheets: ✅ exists with ${count} rows`);
}
check().catch(console.error);
