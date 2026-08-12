const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTable(tableName) {
  const { data, error } = await supabase.from(tableName).select('*').limit(1);
  if (error) {
    if (error.code === '42P01' || error.message.includes('does not exist')) {
      console.log(`[ ] ${tableName} does NOT exist.`);
    } else {
      console.log(`[?] ${tableName} error: ${error.message} (${error.code})`);
    }
    return false;
  }
  console.log(`[X] ${tableName} EXISTS.`);
  return true;
}

async function checkRpc(rpcName) {
  const { data, error } = await supabase.rpc(rpcName, {});
  // If it doesn't exist, code is 42883 (function does not exist) or similar
  if (error) {
    if (error.code === '42883' || error.message.includes('Could not find')) {
      console.log(`[ ] RPC ${rpcName} does NOT exist.`);
    } else {
      // It exists but failed execution due to missing params, etc.
      console.log(`[X] RPC ${rpcName} EXISTS (Error during exec: ${error.message})`);
    }
    return false;
  }
  console.log(`[X] RPC ${rpcName} EXISTS.`);
  return true;
}

async function main() {
  console.log("--- Checking Baseline (20260220000000) ---");
  await checkTable('profiles');
  await checkTable('time_logs');
  await checkTable('weekly_snapshots');

  console.log("\n--- Checking Evidence (20260812012400 & 20260812020000) ---");
  await checkTable('purchase_line_provenance');
  await checkTable('document_extractions');
  await checkTable('document_tables');
  await checkTable('document_columns');
  await checkTable('document_rows');
  await checkTable('document_cells');
  
  await checkRpc('persist_document_evidence');
}

main();
