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

async function verifyInserts() {
  console.log('=== DEEP VERIFICATION ===\n');

  // Test 1: Insert into activities
  console.log('1. Testing INSERT into activities...');
  const { data: act, error: actErr } = await supabase
    .from('activities' as any)
    .insert({ name: 'TEST_VERIFY', external_name: 'TEST_VERIFY', active: true })
    .select('id')
    .single();
  if (actErr) {
    console.log(`   ❌ INSERT failed: ${actErr.message}`);
  } else {
    console.log(`   ✅ INSERT OK, id=${act.id}`);
  }

  // Test 2: Insert into venues
  console.log('2. Testing INSERT into venues...');
  const { data: ven, error: venErr } = await supabase
    .from('venues' as any)
    .insert({ code: 'TST', name: 'Test Venue', active: true })
    .select('id')
    .single();
  if (venErr) {
    console.log(`   ❌ INSERT failed: ${venErr.message}`);
  } else {
    console.log(`   ✅ INSERT OK, id=${ven.id}`);
  }

  // Test 3: Insert into activity_occurrences
  console.log('3. Testing INSERT into activity_occurrences...');
  const { data: occ, error: occErr } = await supabase
    .from('activity_occurrences' as any)
    .insert({
      activity_id: act?.id,
      activity_date: '2026-06-27',
      start_time: '10:00',
      end_time: '12:00',
      source_type: 'pdf',
    })
    .select('id, sys_start_timestamp, sys_end_timestamp')
    .single();
  if (occErr) {
    console.log(`   ❌ INSERT failed: ${occErr.message}`);
  } else {
    console.log(`   ✅ INSERT OK`);
    console.log(`      sys_start_timestamp: ${occ.sys_start_timestamp}`);
    console.log(`      sys_end_timestamp: ${occ.sys_end_timestamp}`);
  }

  // Test 4: Insert into occurrence_venues
  console.log('4. Testing INSERT into occurrence_venues...');
  const { error: ovErr } = await supabase
    .from('occurrence_venues' as any)
    .insert({ occurrence_id: occ?.id, venue_id: ven?.id });
  if (ovErr) {
    console.log(`   ❌ INSERT failed: ${ovErr.message}`);
  } else {
    console.log(`   ✅ INSERT OK (bridge table works)`);
  }

  // Test 5: Insert into participant_categories
  console.log('5. Testing INSERT into participant_categories...');
  const { data: cat, error: catErr } = await supabase
    .from('participant_categories' as any)
    .insert({ name: 'Test Category', age_min: 6, age_max: 12 })
    .select('id')
    .single();
  if (catErr) {
    console.log(`   ❌ INSERT failed: ${catErr.message}`);
  } else {
    console.log(`   ✅ INSERT OK, id=${cat.id}`);
  }

  // Test 6: Insert into occurrence_groups
  console.log('6. Testing INSERT into occurrence_groups...');
  const { error: ogErr } = await supabase
    .from('occurrence_groups' as any)
    .insert({ occurrence_id: occ?.id, category_id: cat?.id, participants: 10 });
  if (ogErr) {
    console.log(`   ❌ INSERT failed: ${ogErr.message}`);
  } else {
    console.log(`   ✅ INSERT OK (groups table works)`);
  }

  // Test 7: RPC function (delete)
  console.log('7. Testing RPC delete_activity_occurrences_by_date...');
  const { error: rpcErr } = await supabase.rpc('delete_activity_occurrences_by_date' as any, { target_date: '2026-06-27' });
  if (rpcErr) {
    console.log(`   ❌ RPC failed: ${rpcErr.message}`);
  } else {
    console.log(`   ✅ RPC executed (deleted test occurrence)`);
  }

  // Verify deletion
  const { data: check } = await supabase
    .from('activity_occurrences' as any)
    .select('count')
    .eq('activity_date', '2026-06-27');
  const remaining = Array.isArray(check) ? check.length : 0;
  console.log(`      Remaining occurrences for 2026-06-27: ${remaining}`);

  // Test 8: Verify SELECT on categories still works (original menu table)
  console.log('8. Verifying original categories table is intact...');
  const { data: origCats, error: origCatErr } = await supabase
    .from('categories')
    .select('name')
    .limit(3);
  if (origCatErr) {
    console.log(`   ❌ original categories query failed: ${origCatErr.message}`);
  } else {
    console.log(`   ✅ original categories table still accessible, ${origCats?.length} rows`);
  }

  // Test 9: Verify storage bucket
  console.log('9. Verifying pavilion_activities storage bucket...');
  const { data: buckets, error: bucketErr } = await supabase
    .storage
    .getBucket('pavilion_activities');
  if (bucketErr) {
    console.log(`   ❌ bucket check failed: ${bucketErr.message}`);
  } else {
    console.log(`   ✅ Bucket exists: ${buckets.name}, public: ${buckets.public}`);
  }

  // Test 10: RLS - try to query as anonymous (should fail)
  console.log('10. Verifying RLS is enabled on new tables...');
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { error: anonErr } = await anonClient
    .from('activities' as any)
    .select('id')
    .limit(1);
  // Should succeed because anon has no session but with anon key, it might still work
  console.log(`   Anon query error: ${anonErr ? anonErr.message : 'no error (RLS allows anon?)'}`);

  console.log('\n=== VERIFICATION COMPLETE ===');
}
verifyInserts().catch(console.error);
