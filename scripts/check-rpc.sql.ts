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
  // Check if function exists via SQL
  const { data, error } = await supabase.rpc('delete_activity_occurrences_by_date' as any, { target_date: '2026-06-27' });
  console.log('RPC result:', data, error?.message ?? 'OK');

  // Try raw SQL
  const { data: sqlData, error: sqlError } = await supabase.from('activity_occurrences').select('id').limit(1);
  console.log('SQL check:', sqlError?.message ?? 'OK');
  
  // Try to list the function using a query
  const { data: funcData, error: funcError } = await supabase.from('activity_occurrences').select('*', { count: 'exact', head: true });
  console.log('Table accessible:', funcError?.message ?? 'YES');
}

async function createFunction() {
  // Create the RPC function directly via SQL
  const sql = `
    CREATE OR REPLACE FUNCTION delete_activity_occurrences_by_date(target_date date)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      DELETE FROM activity_occurrences WHERE activity_date = target_date AND source_type = 'pdf';
    END;
    $$;
  `;
  const { error } = await supabase.rpc('exec_sql' as any, { query: sql });
  if (error) {
    console.log('Cannot create via RPC:', error.message);
    // Try direct query
    const { error: qError } = await (supabase as any).from('_sql').select('*').eq('query', sql);
    console.log('Alternative:', qError?.message ?? 'OK');
  } else {
    console.log('Function created successfully');
  }
}

check().catch(console.error);
