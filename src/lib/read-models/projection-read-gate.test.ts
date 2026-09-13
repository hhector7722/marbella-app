/**
 * Las lecturas (GET / historial / labor) no ejecutan Hours Engine.
 * El Writer sí; este gate solo cubre superficies de lectura.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

const READ_PATHS = [
  'src/lib/read-models',
  'src/app/actions/history-read.ts',
  'src/app/actions/labor-cost-ssot.ts',
  'src/lib/hours-engine/labor-cost-ssot.ts',
  'src/lib/hours-engine/overtime-weeks-ssot.ts',
  'src/lib/use-cases/get-daily-labor-cost.ts',
  'src/lib/use-cases/get-monthly-labor-cost-summary.ts',
];

const FORBIDDEN = [
  /liquidateWeek\s*\(/,
  /liquidateWeekForCard\s*\(/,
  /resolveOpeningCarryIn\s*\(/,
];

function collectFiles(rel: string): string[] {
  const abs = join(ROOT, rel);
  const st = statSync(abs);
  if (st.isFile()) return [abs];
  const out: string[] = [];
  for (const name of readdirSync(abs)) {
    const child = join(abs, name);
    if (statSync(child).isDirectory()) {
      out.push(...collectFiles(join(rel, name)));
      continue;
    }
    if (!name.endsWith('.ts') && !name.endsWith('.tsx')) continue;
    if (name.includes('.test.')) continue;
    out.push(child);
  }
  return out;
}

describe('Gate lecturas — sin Hours Engine', () => {
  it('no llama liquidateWeek / liquidateWeekForCard / resolveOpeningCarryIn', () => {
    const files = READ_PATHS.flatMap(collectFiles);
    assert.ok(files.length > 0);
    for (const file of files) {
      const body = readFileSync(file, 'utf8');
      for (const re of FORBIDDEN) {
        assert.doesNotMatch(
          body,
          re,
          `${file} no debe ejecutar Hours Engine en lectura`,
        );
      }
    }
  });
});
