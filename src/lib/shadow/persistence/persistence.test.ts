import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LiquidationResult } from '../../hours-engine/types.ts';
import {
  createInMemoryShadowPersistence,
  persistShadowRunResult,
} from './index.ts';
import {
  executeAndPersistShadowRun,
  executeShadowRun,
  factLoaderFromMap,
  subjectKey,
  subjectLoaderFromList,
} from '../runner/run-shadow.ts';
import type { ShadowSubjectFacts } from '../runner/ports.ts';
import { SHADOW_DOMAIN_VERSION } from '../version.ts';

function liquidation(
  overrides: Partial<LiquidationResult> = {},
): LiquidationResult {
  return {
    employeeId: 'e1',
    weekStart: '2026-07-20',
    weekEnd: '2026-07-26',
    hoursWorked: 40,
    contractedHoursEffective: 40,
    weeklyBalance: 0,
    carryIn: 0,
    balanceFinal: 0,
    carryOut: 0,
    isPaid: false,
    ordinaryHours: 40,
    overtimeHours: 0,
    segments: [
      {
        days: ['2026-07-20'],
        hoursWorked: 40,
        contractedHours: 40,
        bagMode: true,
        regimeApplied: 'staff',
        weeklyBalancePart: 0,
        ordinaryHours: 40,
        overtimeHours: 0,
        kind: 'term',
      },
    ],
    dailyBreakdown: {
      days: [],
      ordinaryHoursTotal: 40,
      overtimeHoursTotal: 0,
    },
    ...overrides,
  };
}

function facts(
  employeeId: string,
  weekStart: string,
  liqOverrides: Partial<LiquidationResult> = {},
  snapExtra: Partial<ShadowSubjectFacts['snapshot']> = {},
): ShadowSubjectFacts {
  const liq = liquidation({ employeeId, weekStart, ...liqOverrides });
  return {
    subject: { employeeId, weekStart },
    liquidation: liq,
    bagModeOverride: true,
    snapshot: {
      user_id: employeeId,
      week_start: weekStart,
      total_hours: liq.hoursWorked,
      balance_hours: liq.weeklyBalance,
      pending_balance: liq.carryIn,
      final_balance: liq.carryOut,
      contracted_hours_snapshot: liq.contractedHoursEffective,
      ordinary_hours: liq.ordinaryHours,
      extra_hours: liq.overtimeHours,
      total_cost: 0,
      is_paid: liq.isPaid,
      prefer_stock_hours_override: true,
      ...snapExtra,
    },
    profilePreferStock: true,
  };
}

const CLOCK = { nowIso: () => '2026-07-24T12:00:00.000Z' };

describe('shadow persistence ports (in-memory)', () => {
  it('persistencia desactivada: executeShadowRun sin side-effects', () => {
    const a = facts('e1', '2026-07-20');
    const r1 = executeShadowRun({
      subjects: subjectLoaderFromList([a.subject]),
      facts: factLoaderFromMap(new Map([[subjectKey(a.subject), a]])),
      options: {
        horizonStart: '2026-07-20',
        horizonEnd: '2026-07-26',
        runId: 'no-persist',
        clock: CLOCK,
        fixedDurationMs: 1,
      },
    });
    const r2 = executeShadowRun({
      subjects: subjectLoaderFromList([a.subject]),
      facts: factLoaderFromMap(new Map([[subjectKey(a.subject), a]])),
      options: {
        horizonStart: '2026-07-20',
        horizonEnd: '2026-07-26',
        runId: 'no-persist',
        clock: CLOCK,
        fixedDurationMs: 1,
      },
    });
    assert.deepEqual(r1, r2);
  });

  it('persistencia activada vía puertos in-memory', async () => {
    const aligned = facts('e1', '2026-07-20');
    const mismatched = facts(
      'e2',
      '2026-07-20',
      {
        hoursWorked: 45,
        overtimeHours: 5,
        weeklyBalance: 5,
        balanceFinal: 5,
        carryOut: 5,
        ordinaryHours: 40,
      },
      { extra_hours: 3, total_hours: 45, balance_hours: 5, final_balance: 5 },
    );

    const ports = createInMemoryShadowPersistence();
    const { result, persist } = await executeAndPersistShadowRun({
      subjects: subjectLoaderFromList([aligned.subject, mismatched.subject]),
      facts: factLoaderFromMap(
        new Map([
          [subjectKey(aligned.subject), aligned],
          [subjectKey(mismatched.subject), mismatched],
        ]),
      ),
      options: {
        horizonStart: '2026-07-20',
        horizonEnd: '2026-07-26',
        runId: 'persist-1',
        clock: CLOCK,
        fixedDurationMs: 9,
      },
      persistence: ports,
      persistMeta: {
        hoursEngineVersion: 'test-he',
        shadowVersion: SHADOW_DOMAIN_VERSION,
      },
    });

    assert.equal(result.status, 'completed');
    assert.ok(persist);
    assert.equal(persist.comparisonsSaved, 2);
    assert.ok(persist.fieldDiffsSaved >= 1);
    assert.ok(persist.discrepanciesCreated >= 1);
    assert.equal(ports.runs.getById('persist-1')?.hoursEngineVersion, 'test-he');
    assert.equal(ports.metrics._byRun.get('persist-1')?.comparisons, 2);
    assert.equal(ports.comparisons._diffs.length, persist.fieldDiffsSaved);
    // No vectores completos en comparisons store
    assert.ok(
      !('heVector' in (ports.comparisons._comparisons[0] as object)),
    );
  });

  it('fingerprint único: segundo run actualiza occurrences', async () => {
    const mismatched = facts(
      'e2',
      '2026-07-20',
      {
        hoursWorked: 45,
        overtimeHours: 5,
        weeklyBalance: 5,
        balanceFinal: 5,
        carryOut: 5,
      },
      { extra_hours: 1, total_hours: 45, balance_hours: 5, final_balance: 5 },
    );
    const ports = createInMemoryShadowPersistence();
    const baseInput = {
      subjects: subjectLoaderFromList([mismatched.subject]),
      facts: factLoaderFromMap(
        new Map([[subjectKey(mismatched.subject), mismatched]]),
      ),
      persistence: ports,
      persistMeta: { hoursEngineVersion: 'he' },
    };

    await executeAndPersistShadowRun({
      ...baseInput,
      options: {
        horizonStart: '2026-07-20',
        horizonEnd: '2026-07-26',
        runId: 'r1',
        clock: CLOCK,
        fixedDurationMs: 1,
      },
    });
    const after1 = ports.discrepancies.list();
    assert.equal(after1.length, 1);
    assert.equal(after1[0]!.occurrences, 1);

    await executeAndPersistShadowRun({
      ...baseInput,
      options: {
        horizonStart: '2026-07-20',
        horizonEnd: '2026-07-26',
        runId: 'r2',
        clock: CLOCK,
        fixedDurationMs: 1,
      },
    });
    const after2 = ports.discrepancies.list();
    assert.equal(after2.length, 1);
    assert.equal(after2[0]!.occurrences, 2);
    assert.equal(after2[0]!.fingerprint, after1[0]!.fingerprint);
  });

  it('exact match cierra discrepancia abierta del sujeto', async () => {
    const ports = createInMemoryShadowPersistence();
    const bad = facts(
      'e1',
      '2026-07-20',
      { overtimeHours: 4, hoursWorked: 44, weeklyBalance: 4, balanceFinal: 4, carryOut: 4 },
      { extra_hours: 1, total_hours: 44, balance_hours: 4, final_balance: 4 },
    );
    await executeAndPersistShadowRun({
      subjects: subjectLoaderFromList([bad.subject]),
      facts: factLoaderFromMap(new Map([[subjectKey(bad.subject), bad]])),
      options: {
        horizonStart: '2026-07-20',
        horizonEnd: '2026-07-26',
        runId: 'bad',
        clock: CLOCK,
        fixedDurationMs: 1,
      },
      persistence: ports,
      persistMeta: { hoursEngineVersion: 'he' },
    });
    assert.equal(ports.discrepancies.list()[0]!.status, 'NEW');

    const good = facts('e1', '2026-07-20');
    const { persist } = await executeAndPersistShadowRun({
      subjects: subjectLoaderFromList([good.subject]),
      facts: factLoaderFromMap(new Map([[subjectKey(good.subject), good]])),
      options: {
        horizonStart: '2026-07-20',
        horizonEnd: '2026-07-26',
        runId: 'good',
        clock: CLOCK,
        fixedDurationMs: 1,
      },
      persistence: ports,
      persistMeta: { hoursEngineVersion: 'he' },
    });
    assert.equal(persist?.discrepanciesClosed, 1);
    assert.equal(ports.discrepancies.list()[0]!.status, 'CLOSED');
  });

  it('persistShadowRunResult es sustituible (doble de prueba)', async () => {
    const calls: string[] = [];
    const ports = createInMemoryShadowPersistence();
    const wrapped = {
      runs: {
        save: async (r: Parameters<typeof ports.runs.save>[0]) => {
          calls.push('runs');
          await ports.runs.save(r);
        },
        getById: (id: string) => ports.runs.getById(id),
      },
      comparisons: {
        save: async (c: Parameters<typeof ports.comparisons.save>[0]) => {
          calls.push('comparisons');
          await ports.comparisons.save(c);
        },
        saveFieldDiffs: async (
          d: Parameters<typeof ports.comparisons.saveFieldDiffs>[0],
        ) => {
          calls.push('diffs');
          await ports.comparisons.saveFieldDiffs(d);
        },
      },
      discrepancies: ports.discrepancies,
      metrics: {
        save: async (id: string, m: Parameters<typeof ports.metrics.save>[1]) => {
          calls.push('metrics');
          await ports.metrics.save(id, m);
        },
      },
    };

    const a = facts('e1', '2026-07-20');
    const result = executeShadowRun({
      subjects: subjectLoaderFromList([a.subject]),
      facts: factLoaderFromMap(new Map([[subjectKey(a.subject), a]])),
      options: {
        horizonStart: '2026-07-20',
        horizonEnd: '2026-07-26',
        runId: 'double',
        clock: CLOCK,
        fixedDurationMs: 1,
      },
    });
    await persistShadowRunResult(wrapped, result, {
      hoursEngineVersion: 'he',
      shadowVersion: SHADOW_DOMAIN_VERSION,
      config: {},
    });
    assert.ok(calls.includes('runs'));
    assert.ok(calls.includes('metrics'));
    assert.ok(calls.includes('comparisons'));
  });
});
