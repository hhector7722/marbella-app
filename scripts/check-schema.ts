import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnv() {
  const envPaths = [path.resolve(__dirname, '../.env.local'), path.resolve(__dirname, '../.env')];
  for (const envPath of envPaths) {
    if (!fs.existsSync(envPath)) continue;
    const content = fs.readFileSync(envPath, 'utf-8');
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
  const tables = ['activities', 'activity_occurrences', 'occurrence_venues', 'venues', 'pavilion_activity_sheets'];
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('count', { count: 'exact', head: true });
    if (error) {
      console.log(`${t}: ❌ ${error.message}`);
    } else {
      console.log(`${t}: ✅ exists`);
    }
  }
  const { error: rpcError } = await supabase.rpc('delete_activity_occurrences_by_date', { target_date: '2026-06-27' });
  if (rpcError) {
    console.log(`RPC delete_activity_occurrences_by_date: ❌ ${rpcError.message}`);
  } else {
    console.log(`RPC delete_activity_occurrences_by_date: ✅ exists`);
  }
}
check().catch(console.error);
