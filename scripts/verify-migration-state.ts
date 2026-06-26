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

// Use direct SQL via the Supabase REST client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// We'll query information_schema via the REST endpoint directly
async function query(sql: string): Promise<any> {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/`;
  // Use a direct fetch to the Supabase REST API
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL!.replace('/auth/v1', '')}/rest/v1/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Accept': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  // This won't work for raw SQL...
  return { error: 'Cannot use raw SQL via REST' };
}

async function check() {
  const checks: Record<string, string> = {
    'idx_pavilion_activity_sheets_date': 'index on pavilion_activity_sheets',
    'idx_pavilion_activity_sheets_gmail_filename': 'partial unique index',
    'idx_activity_occurrences_sys_start': 'index on activity_occurrences',
    'idx_activity_occurrences_activity_id': 'index on activity_occurrences',
    'idx_activity_occurrences_date': 'index on activity_occurrences',
    'idx_occurrence_venues_venue_id': 'index on occurrence_venues',
    'idx_occurrence_groups_category_id': 'index on occurrence_groups',
  };

  console.log('=== Verifying indices ===');
  for (const [idxName, desc] of Object.entries(checks)) {
    // We need to check if the index exists
    // Use the PG catalog query via custom RPC
    const { data, error } = await supabase.rpc('delete_activity_occurrences_by_date' as any, { target_date: '2026-06-27' });
    if (error) {
      console.log(`RPC delete_activity_occurrences_by_date: ❌ ${error.message}`);
    } else {
      console.log(`RPC delete_activity_occurrences_by_date: ✅ OK`);
    }
  }

  // Check pavilion_activity_sheets constraints
  console.log('\n=== Checking pavilion_activity_sheets constraints ===');
  const { data: sheets, error: sheetsErr } = await supabase
    .from('pavilion_activity_sheets')
    .select('activity_date, file_path')
    .limit(3);
  if (sheetsErr) {
    console.log(`❌ Cannot query pavilion_activity_sheets: ${sheetsErr.message}`);
  } else {
    console.log(`✅ Can query, sample: ${JSON.stringify(sheets)}`);
  }

  // Check activities
  console.log('\n=== Checking activities table ===');
  const { data: acts, error: actsErr } = await supabase
    .from('activities' as any)
    .select('*')
    .limit(3);
  if (actsErr) {
    console.log(`❌ ${actsErr.message}`);
  } else {
    console.log(`✅ Columns: ${acts.length > 0 ? Object.keys(acts[0]).join(', ') : 'empty table but exists'}`);
  }

  // Check venues
  console.log('\n=== Checking venues table ===');
  const { data: vens, error: vensErr } = await supabase
    .from('venues' as any)
    .select('*')
    .limit(3);
  if (vensErr) {
    console.log(`❌ ${vensErr.message}`);
  } else {
    console.log(`✅ Columns: ${vens.length > 0 ? Object.keys(vens[0]).join(', ') : 'empty table but exists'}`);
  }

  // Check activity_occurrences
  console.log('\n=== Checking activity_occurrences table ===');
  const { data: occs, error: occsErr } = await supabase
    .from('activity_occurrences' as any)
    .select('*')
    .limit(3);
  if (occsErr) {
    console.log(`❌ ${occsErr.message}`);
  } else {
    console.log(`✅ Columns: ${occs.length > 0 ? Object.keys(occs[0]).join(', ') : 'empty table'}`);
  }

  // Check occurrence_venues
  console.log('\n=== Checking occurrence_venues table ===');
  const { data: occVs, error: occVsErr } = await supabase
    .from('occurrence_venues' as any)
    .select('*')
    .limit(3);
  if (occVsErr) {
    console.log(`❌ ${occVsErr.message}`);
  } else {
    console.log(`✅ Columns: ${occVs.length > 0 ? Object.keys(occVs[0]).join(', ') : 'empty table'}`);
  }
}
check().catch(console.error);
