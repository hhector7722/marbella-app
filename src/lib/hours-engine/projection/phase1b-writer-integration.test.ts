/**
 * Fase 1b — tests de integración (cableado Writer).
 * Comprueban que los flujos funcionales invocan el Writer y no los productores C legacy.
 * No validan implementación interna del Writer/HE/Cost.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

/** Call sites de producción (excluye definiciones legacy). */
const FLOW_FILES = [
  'src/app/actions/overtime.ts',
  'src/app/actions/labor-conditions.ts',
  'src/app/actions/persist-overtime-cost.ts',
  'src/app/actions/import-legacy.ts',
  'src/app/actions/recalculate.ts',
  'src/app/api/cron/recalculate-balances/route.ts',
  'src/lib/hours-engine/recalculate-and-persist-all.ts',
  'scripts/backfill-overtime-total-cost.ts',
  'scripts/recalc-merino-w30.ts',
] as const;

const FORBIDDEN_IN_FLOWS = [
  'persistOvertimeCostFromEngine(',
  'recalcSnapshotsAndPersistOvertimeCost(',
  "rpc('fn_recalc_and_propagate_snapshots'",
  'rpc("fn_recalc_and_propagate_snapshots"',
  "rpc('rpc_recalculate_all_balances'",
  "rpc('rpc_recalculate_user_balances_from_week'",
  "rpc('rpc_recalculate_all_users_from_week'",
  "rpc('rpc_recalculate_all_balances_from_week'",
] as const;

const WRITER_MARKERS = [
  'writeWeeklyProjection(',
  'writeProjectionFromWeek(',
  'writeProjectionForEmployees(',
  'recalculateAllBalancesAndPersist(',
  'persistOvertimeCostForEmployees(', // alias → Writer
  'persistOvertimeCostForEmployeesAction(',
] as const;

describe('Fase 1b — integración Writer único', () => {
  it('cada flujo de producción referencia el Writer (o wrapper Writer)', () => {
    for (const file of FLOW_FILES) {
      const body = read(file);
      const hits = WRITER_MARKERS.filter((m) => body.includes(m));
      assert.ok(
        hits.length > 0,
        `${file} no invoca Writer/wrapper. Marcadores: ${WRITER_MARKERS.join(', ')}`,
      );
    }
  });

  it('ningún flujo de producción llama productores C legacy', () => {
    for (const file of FLOW_FILES) {
      const body = read(file);
      for (const bad of FORBIDDEN_IN_FLOWS) {
        assert.ok(
          !body.includes(bad),
          `${file} aún contiene caller prohibido: ${bad}`,
        );
      }
    }
  });

  it('persist-overtime-cost.ts (legado) no tiene callers en app/actions ni scripts', () => {
    const callers = [
      'src/app/actions/overtime.ts',
      'src/app/actions/labor-conditions.ts',
      'src/app/actions/persist-overtime-cost.ts',
      'src/app/actions/import-legacy.ts',
      'src/app/actions/recalculate.ts',
      'src/app/api/cron/recalculate-balances/route.ts',
      'src/components/dashboards/StaffDashboardView.tsx',
      'src/components/TimeTracker.tsx',
      'src/app/admin/import/page.tsx',
      'scripts/backfill-overtime-total-cost.ts',
      'scripts/recalc-merino-w30.ts',
    ];
    for (const file of callers) {
      const body = read(file);
      assert.ok(
        !body.includes("from '@/lib/hours-engine/persist-overtime-cost'") &&
          !body.includes('from "../src/lib/hours-engine/persist-overtime-cost') &&
          !body.includes("persist-overtime-cost.ts"),
        `${file} aún importa persist-overtime-cost legado`,
      );
      assert.ok(
        !body.includes('persistOvertimeCostFromEngine('),
        `${file} llama persistOvertimeCostFromEngine`,
      );
      assert.ok(
        !body.includes('recalcSnapshotsAndPersistOvertimeCost('),
        `${file} llama recalcSnapshotsAndPersistOvertimeCost`,
      );
    }
  });

  it('migración Fase 1b desconecta trigger/cron SQL de columnas C', () => {
    const mig = read(
      'supabase/migrations/20260727135641_phase1b_disable_sql_c_producers.sql',
    );
    assert.match(mig, /drop trigger if exists trigger_propagate_on_config_change/i);
    assert.match(mig, /Fase 1b: no-op/);
    assert.doesNotMatch(
      mig,
      /perform public\.rpc_recalculate_all_balances\(\)/,
    );
  });

  it('ADR y Projection Contract no se modifican en este árbol de tests (existencia)', () => {
    assert.ok(
      fs.existsSync(path.join(root, 'docs/ADR-HE-SSOT-001.md')) ||
        fs.existsSync(path.join(root, 'marbella-os/4-decisiones/ADR-0001-hours-engine-productor-unico.md')),
    );
    assert.ok(
      fs.existsSync(path.join(root, 'docs/PROJECTION_CONTRACT_v1.md')) ||
        fs.existsSync(path.join(root, 'marbella-os/3-ingenieria/contratos/PROYECCION-v1.md')),
    );
  });
});
