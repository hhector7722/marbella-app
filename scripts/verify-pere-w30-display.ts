import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { buildWeekDetailFromEngine } from '../src/lib/read-models/week-display-from-engine.ts';

function loadEnvLocal() {
  for (const line of fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[t.slice(0, i).trim()] ??= v;
  }
}

async function main() {
  loadEnvLocal();
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const detail = await buildWeekDetailFromEngine(client, {
    userId: '56e8aa3b-a2d9-4bee-9caa-b302df71f988',
    weekStart: '2026-07-20',
  });
  const s = detail.summary;
  console.log(
    JSON.stringify(
      {
        worker: detail.workerName,
        HORAS: s.displayHours,
        PENDIENTES: s.displayPendingBalance,
        EXTRAS: s.displayExtras,
        IMPORTE: s.displayEstimatedValue,
        preferStock: s.displayPreferStock,
        carryOut: s.displayCarryOut,
        finalBalance: s.displayFinalBalance,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
