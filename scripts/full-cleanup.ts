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

async function fullCleanup() {
  console.log('Purging all pavilion test data...');
  
  // Order matters due to FK constraints
  await supabase.from('occurrence_groups' as any).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('occurrence_venues' as any).delete().neq('occurrence_id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('activity_occurrences' as any).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('activities' as any).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('venues' as any).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('participant_categories' as any).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('activity_kinds' as any).delete().neq('id', '00000000-0000-0000-0000-000000000000');

  const { count: a } = await supabase.from('activities' as any).select('*', { count: 'exact', head: true });
  const { count: v } = await supabase.from('venues' as any).select('*', { count: 'exact', head: true });
  const { count: o } = await supabase.from('activity_occurrences' as any).select('*', { count: 'exact', head: true });
  console.log(`Activities: ${a}, Venues: ${v}, Occurrences: ${o}`);
  console.log('✅ Full cleanup complete');
}
fullCleanup().catch(console.error);
