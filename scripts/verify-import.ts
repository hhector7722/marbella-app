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

async function verify() {
  console.log('=== VERIFYING IMPORTED DATA ===\n');

  // Activities
  const { data: acts } = await supabase.from('activities' as any).select('name, external_name').order('name');
  console.log(`Activities (${acts?.length ?? 0}):`);
  for (const a of acts ?? []) {
    console.log(`  - ${a.name}`);
  }

  // Venues
  const { data: vens } = await supabase.from('venues' as any).select('code').order('code');
  console.log(`\nVenues (${vens?.length ?? 0}):`);
  for (const v of vens ?? []) {
    console.log(`  - ${v.code}`);
  }

  // Occurrences with venues
  const { data: occs } = await supabase
    .from('activity_occurrences' as any)
    .select('id, activity_id, activity_date, start_time, end_time, source_type')
    .eq('activity_date', '2026-06-27')
    .order('start_time');

  console.log(`\nOccurrences for 2026-06-27 (${occs?.length ?? 0}):`);
  for (const o of occs ?? []) {
    // Get venues for this occurrence
    const { data: ovs } = await supabase
      .from('occurrence_venues' as any)
      .select('venue_id')
      .eq('occurrence_id', o.id);
    
    // Get activity name
    const { data: act } = await supabase
      .from('activities' as any)
      .select('name')
      .eq('id', o.activity_id)
      .single();

    // Get venue codes
    const venueCodes: string[] = [];
    for (const ov of ovs ?? []) {
      const { data: v } = await supabase
        .from('venues' as any)
        .select('code')
        .eq('id', ov.venue_id)
        .single();
      if (v) venueCodes.push(v.code);
    }

    console.log(`  ${o.start_time}-${o.end_time} | ${act?.name} | ${venueCodes.join(', ')}`);
  }

  console.log('\n=== VERIFICATION COMPLETE ===');
}
verify().catch(console.error);
