/**
 * Backfill / regeneración: columnas C vía Writer único (writeWeeklyProjection).
 *
 * Uso:
 *   npm run backfill:overtime-cost
 *
 * Requiere .env.local con NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  employeeTimelineStartWeek,
} from '../src/lib/hours-engine/opening-carry.ts';
import { loadEmployeeBoundaryFacts } from '../src/lib/hours-engine/load-employee-facts.ts';
import { writeWeeklyProjection } from '../src/lib/hours-engine/projection/write-weekly-projection.ts';
import type { CivilDate } from '../src/lib/hours-engine/types.ts';

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) {
    throw new Error('Falta .env.local');
  }
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

  const { data: rows, error } = await client
    .from('weekly_snapshots')
    .select('user_id')
    .limit(20000);
  if (error) throw new Error(error.message);

  const userIds = [
    ...new Set((rows ?? []).map((r) => r.user_id).filter(Boolean)),
  ] as string[];

  console.log(`Backfill Writer: ${userIds.length} empleados`);

  let okUsers = 0;
  let weeks = 0;
  const failures: string[] = [];

  for (const userId of userIds) {
    let fromWeekStart: string | null = null;
    try {
      const { data: first } = await client
        .from('weekly_snapshots')
        .select('week_start')
        .eq('user_id', userId)
        .order('week_start', { ascending: true })
        .limit(1)
        .maybeSingle();
      fromWeekStart = first?.week_start
        ? String(first.week_start).split('T')[0]!
        : null;

      try {
        const employee = await loadEmployeeBoundaryFacts(client, userId);
        const timeline = employeeTimelineStartWeek(employee);
        if (timeline && fromWeekStart) {
          fromWeekStart = timeline < fromWeekStart ? timeline : fromWeekStart;
        } else if (timeline && !fromWeekStart) {
          fromWeekStart = timeline;
        }
      } catch {
        /* usar solo primer snapshot */
      }

      if (!fromWeekStart) {
        console.log(`  skip ${userId}: sin timeline/snapshots`);
        continue;
      }

      const result = await writeWeeklyProjection(client, {
        userId,
        fromWeekStart: fromWeekStart as CivilDate,
        processKind: 'recalc',
      });
      if (!result.ok) {
        failures.push(`${userId}: ${result.error}`);
        console.error(`  FAIL ${userId}: ${result.error}`);
        continue;
      }
      okUsers += 1;
      weeks += result.weeksWritten;
      console.log(
        `  OK ${userId}: ${result.weeksWritten} semanas (${result.fromWeekStart} → ${result.toWeekStart})`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`${userId}: ${msg}`);
      console.error(`  FAIL ${userId}: ${msg}`);
    }
  }

  console.log('---');
  console.log(`OK empleados: ${okUsers}/${userIds.length}`);
  console.log(`Semanas escritas: ${weeks}`);
  console.log(`Fallos: ${failures.length}`);
  if (failures.length > 0) {
    console.log('Primeros fallos:');
    for (const f of failures.slice(0, 10)) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
