/**
 * CLI ops: Shadow Mode sobre datos reales.
 * Uso: npm run shadow -- --week 2026-07-20 [--persist]
 *
 * No es dependencia del dominio. No cron / dashboard / alertas (8B).
 */

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  parseShadowCliArgs,
  SHADOW_CLI_HELP,
  runShadowOps,
} from '../src/infrastructure/shadow/index.ts';

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) {
    throw new Error('Falta .env.local (NEXT_PUBLIC_SUPABASE_URL + service role)');
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
  const args = parseShadowCliArgs(process.argv.slice(2));
  if (args.help) {
    console.log(SHADOW_CLI_HELP);
    process.exit(0);
  }

  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (o anon)',
    );
  }

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { output } = await runShadowOps({ client, args });
  if (output.result.status === 'failed') {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
