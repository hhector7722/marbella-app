/**
 * One-shot: tras corregir profiles.end_date de Guillem Merino,
 * recalcula horas SQL + persiste total_cost Cost Engine hasta W30.
 *
 *   npx tsx scripts/recalc-merino-w30.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { persistOvertimeCostFromEngine } from '../src/lib/hours-engine/persist-overtime-cost.ts';

const USER = '97034f1a-0664-49c1-b62a-5bf3b09cc945';
const FROM_WEEK = '2026-02-09';
const TO_WEEK = '2026-07-20';

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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  }

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profile, error: profileErr } = await client
    .from('profiles')
    .select('first_name,last_name,joining_date,end_date')
    .eq('id', USER)
    .single();
  if (profileErr) throw new Error(profileErr.message);
  if (profile.end_date != null) {
    throw new Error(
      `Abort: end_date=${profile.end_date}. Debe ser NULL antes del recalc.`,
    );
  }
  console.log('Perfil OK', profile);

  const { error: rpcErr } = await client.rpc(
    'rpc_recalculate_user_balances_from_week',
    { p_user_id: USER, p_week_start: FROM_WEEK },
  );
  if (rpcErr) throw new Error(`RPC: ${rpcErr.message}`);
  console.log('RPC horas OK');

  const persist = await persistOvertimeCostFromEngine(client, {
    userId: USER,
    fromWeekStart: FROM_WEEK,
    toWeekStart: TO_WEEK,
  });
  if (!persist.ok) {
    throw new Error(`persist: ${persist.error}`);
  }
  console.log('persist OK', persist);

  const { data: snap, error: snapErr } = await client
    .from('weekly_snapshots')
    .select(
      'week_start,total_hours,extra_hours,balance_hours,pending_balance,final_balance,total_cost,overtime_price_snapshot,prefer_stock_hours_override,contracted_hours_snapshot',
    )
    .eq('user_id', USER)
    .eq('week_start', TO_WEEK)
    .maybeSingle();
  if (snapErr) throw new Error(snapErr.message);
  console.log('W30', snap);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
