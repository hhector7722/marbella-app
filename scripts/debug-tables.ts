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
  // Try different queries
  console.log('=== Testing table existence ===');
  
  const tables = ['activities', 'activity_occurrences', 'occurrence_venues', 'venues', 'pavilion_activity_sheets'];
  
  for (const t of tables) {
    // Method 1: select with limit
    const { data: d1, error: e1 } = await supabase.from(t as any).select('*').limit(1);
    console.log(`${t} (select * limit 1):`, e1 ? `❌ ${e1.message}` : `✅ ${d1?.length ?? 0} rows`);
    
    // Method 2: count
    const { count, error: e2 } = await supabase.from(t as any).select('*', { count: 'exact', head: true });
    console.log(`${t} (count):`, e2 ? `❌ ${e2.message}` : `✅ count=${count}`);
  }
  
  // Try delete directly
  console.log('\n=== Testing delete ===');
  const { error: delErr } = await supabase
    .from('activity_occurrences' as any)
    .delete()
    .eq('activity_date', '2026-06-27')
    .eq('source_type', 'pdf');
  console.log('delete:', delErr ? `❌ ${delErr.message}` : '✅ OK');
  
  // Try insert
  console.log('\n=== Testing insert (activities) ===');
  const { data: insData, error: insErr } = await supabase
    .from('activities' as any)
    .insert({ name: '__test_check__', external_name: '__test_check__', active: true })
    .select('id');
  console.log('insert:', insErr ? `❌ ${insErr.message}` : `✅ id=${(insData as any)?.[0]?.id}`);
  
  // Cleanup test
  if (!insErr && insData) {
    await supabase.from('activities' as any).delete().eq('id', (insData as any)[0].id);
  }
}
check().catch(console.error);
