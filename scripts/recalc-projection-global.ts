/**
 * Regenera proyección global vía Writer tras la exención de deuda en agosto.
 *
 *   npx tsx scripts/recalc-projection-global.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { recalculateAllBalancesAndPersist } from '../src/lib/hours-engine/recalculate-and-persist-all.ts';

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) throw new Error('Falta .env.local');
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] ??= val;
  }
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  }

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log('Writer global: regenerando proyección…');
  const started = Date.now();
  const result = await recalculateAllBalancesAndPersist(client);
  const ms = Date.now() - started;

  console.log('OK', {
    employeeCount: result.employeeCount,
    weeksPersisted: result.weeksPersisted,
    elapsedMs: ms,
  });

  // Muestra de agosto 2026: balance_hours no debería ser negativo
  // en semanas con lunes en agosto (3 ago … 31 ago).
  const { data: augustRows, error } = await client
    .from('weekly_snapshots')
    .select('user_id, week_start, balance_hours, pending_balance, final_balance, contracted_hours_snapshot, total_hours')
    .gte('week_start', '2026-08-03')
    .lte('week_start', '2026-08-31')
    .lt('balance_hours', 0)
    .limit(20);

  if (error) {
    console.warn('No se pudo auditar agosto:', error.message);
    return;
  }

  if (!augustRows || augustRows.length === 0) {
    console.log('Auditoría agosto 2026: ningún balance_hours < 0 en semanas de agosto.');
  } else {
    console.log(
      `Auditoría agosto 2026: ${augustRows.length} filas con balance_hours < 0 (revisar):`,
    );
    for (const row of augustRows) {
      console.log(row);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
