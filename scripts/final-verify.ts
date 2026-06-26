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
  console.log('═══════════════════════════════════════════');
  console.log('   STATE OF PAVILION MODULE IN SUPABASE');
  console.log('═══════════════════════════════════════════');

  // 1. pavilion_activity_sheets (migration 1)
  console.log('\n--- Migration 1: 20260614140000 ---');
  const { data: sheets, error: sheetsErr, count } = await supabase
    .from('pavilion_activity_sheets')
    .select('*', { count: 'exact', head: true });
  console.log(`pavilion_activity_sheets: ${sheetsErr ? `❌ ${sheetsErr.message}` : `✅ ${count} rows`}${!sheetsErr && count === 0 ? ' (warning: empty)' : ''}`);

  // 2. pavilion_activity_sheets multi-pdf (migration 2)
  console.log('\n--- Migration 2: 20260614150000 ---');
  // Check if the unique index exists by trying a sample query
  console.log('(Cannot verify index existence via REST API without pg_catalog access)');

  // 3. pavilion_events_schema (migration 3)
  console.log('\n--- Migration 3: 20260623180500 ---');
  
  const tables: [string, string[]][] = [
    ['activities', ['id', 'name', 'external_name', 'activity_type', 'active']],
    ['activity_kinds', ['id', 'name']],
    ['venues', ['id', 'code', 'name', 'active']],
    ['activity_occurrences', ['id', 'activity_id', 'activity_date', 'start_time', 'end_time', 'source_pdf_id', 'source_type']],
    ['occurrence_venues', ['occurrence_id', 'venue_id']],
    ['occurrence_groups', ['id', 'occurrence_id', 'category_id', 'group_label', 'participants']],
  ];

  for (const [table, expectedCols] of tables) {
    const { data, error } = await supabase.from(table as any).select('*').limit(1);
    if (error) {
      console.log(`${table}: ❌ ${error.message}`);
    } else {
      const actualCols = data && data.length > 0 ? Object.keys(data[0]) : ['(empty table - no columns to inspect)'];
      const missingCols = expectedCols.filter(c => !actualCols.includes(c));
      console.log(`${table}: ✅ exists`);
      if (data && data.length > 0) {
        console.log(`  Columns: ${actualCols.join(', ')}`);
        if (missingCols.length > 0) {
          console.log(`  ⚠️ Missing expected columns: ${missingCols.join(', ')}`);
        } else {
          console.log(`  ✅ All expected columns present`);
        }
      } else {
        console.log(`  (table empty, cannot verify columns)`);
      }
    }
  }

  // 4. RPC function
  console.log('\n--- RPC delete_activity_occurrences_by_date ---');
  const { error: rpcErr } = await supabase.rpc('delete_activity_occurrences_by_date' as any, { target_date: '2026-06-27' });
  if (rpcErr) {
    console.log(`❌ ${rpcErr.message}`);
  } else {
    console.log('✅ Function exists and executes');
  }

  console.log('\n═══════════════════════════════════════════');
}
verify().catch(console.error);
