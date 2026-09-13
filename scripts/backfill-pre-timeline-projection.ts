/**
 * Persiste proyección v2 en snapshots anteriores al alta (cadena aislada).
 * No reescribe la cadena oficial post-alta. INV-C01 intacto.
 *
 *   npx tsx scripts/backfill-pre-timeline-projection.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { backfillIsolatedPreTimelineProjection } from '../src/lib/hours-engine/recalculate-and-persist-all.ts';

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

  console.log('Writer pre-alta aislado: regenerando residuos sin v2…');
  const started = Date.now();
  const result = await backfillIsolatedPreTimelineProjection(client, 'backfill');
  const ms = Date.now() - started;

  console.log('OK', {
    employeeCount: result.employeeCount,
    weeksWritten: result.weeksWritten,
    elapsedMs: ms,
  });

  const { count, error } = await client
    .from('weekly_snapshots')
    .select('user_id', { count: 'exact', head: true })
    .is('carry_out', null);

  if (error) {
    console.warn('No se pudo auditar carry_out NULL:', error.message);
    return;
  }
  console.log(`Auditoría: weekly_snapshots con carry_out NULL = ${count ?? '¿?'}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
