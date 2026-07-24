import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { LiquidationResult } from '../../../lib/hours-engine/types.ts';
import {
  createInMemoryShadowPersistence,
  executeAndPersistShadowRun,
  factLoaderFromMap,
  subjectKey,
  subjectLoaderFromList,
  type ShadowSubjectFacts,
} from '../../../lib/shadow/index.ts';
import { parseShadowCliArgs } from './parse-args.ts';
import { formatShadowRunSummary } from './format-summary.ts';
import { runShadowOps } from './run-shadow-ops.ts';
import { resolveHorizonBounds, listWeekStartsInclusive } from '../loaders/horizon.ts';
import { buildSubjectsCartesian } from '../loaders/supabase-subject-loader.ts';

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

function alignedFacts(
  employeeId: string,
  weekStart: string,
): ShadowSubjectFacts {
  const liq = liquidation({ employeeId, weekStart });
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
    },
    profilePreferStock: true,
  };
}

describe('Shadow CLI ops (8A)', () => {
  it('parseShadowCliArgs: dry-run por defecto; --persist activa escritura', () => {
    const dry = parseShadowCliArgs(['--week', '2026-07-20']);
    assert.equal(dry.dryRun, true);
    assert.equal(dry.persist, false);
    assert.equal(dry.week, '2026-07-20');

    const persist = parseShadowCliArgs([
      '--week',
      '2026-07-20',
      '--persist',
      '--employee',
      'aaa,bbb',
      '--limit',
      '5',
    ]);
    assert.equal(persist.persist, true);
    assert.equal(persist.dryRun, false);
    assert.deepEqual(persist.employeeIds, ['aaa', 'bbb']);
    assert.equal(persist.limit, 5);

    const forceDry = parseShadowCliArgs([
      '--week',
      '2026-07-20',
      '--persist',
      '--dry-run',
    ]);
    assert.equal(forceDry.persist, false);
    assert.equal(forceDry.dryRun, true);
  });

  it('resolveHorizonBounds genera lunes inclusivos', () => {
    const h = resolveHorizonBounds({
      from: '2026-07-01',
      to: '2026-07-15',
    });
    assert.equal(h.horizonStart, '2026-06-29');
    assert.deepEqual(h.weekStarts, [
      '2026-06-29',
      '2026-07-06',
      '2026-07-13',
    ]);
    assert.deepEqual(listWeekStartsInclusive('2026-07-20', '2026-07-20'), [
      '2026-07-20',
    ]);
  });

  it('buildSubjectsCartesian respeta --limit', () => {
    const subjects = buildSubjectsCartesian(
      ['e1', 'e2'],
      ['2026-07-13', '2026-07-20'],
      3,
    );
    assert.equal(subjects.length, 3);
  });

  it('runShadowOps con loaders mock (sin Supabase) + resumen', async () => {
    const a = alignedFacts('e1', '2026-07-20');
    const b = alignedFacts('e2', '2026-07-20');
    b.snapshot.extra_hours = 1;

    const logs: string[] = [];
    const { output, summary } = await runShadowOps({
      // client no se usa si subjects/facts inyectados
      client: {} as never,
      args: parseShadowCliArgs([
        '--week',
        '2026-07-20',
        '--run-id',
        'cli-test-1',
      ]),
      subjects: subjectLoaderFromList([a.subject, b.subject]),
      facts: factLoaderFromMap(
        new Map([
          [subjectKey(a.subject), a],
          [subjectKey(b.subject), b],
        ]),
      ),
      nowIso: () => '2026-07-24T12:00:00.000Z',
      log: {
        info: (m) => logs.push(m),
        error: (m) => logs.push(`ERR:${m}`),
      },
    });

    assert.equal(output.result.runId, 'cli-test-1');
    assert.equal(output.result.status, 'completed');
    assert.equal(output.result.metrics.comparisons, 2);
    assert.equal(output.persist, null);
    assert.match(summary, /Shadow Run/);
    assert.match(summary, /cli-test-1/);
    assert.match(summary, /EMR:/);
    assert.match(summary, /dry-run/);
    assert.ok(logs.some((l) => l.includes('inicio Shadow Run')));
  });

  it('formatShadowRunSummary incluye succeeded/failed/skipped', async () => {
    const good = alignedFacts('e1', '2026-07-20');
    const ports = createInMemoryShadowPersistence();
    const { result, persist } = await executeAndPersistShadowRun({
      subjects: subjectLoaderFromList([
        { employeeId: 'e-bad', weekStart: '2026-07-20' },
        good.subject,
      ]),
      facts: {
        loadFacts(subject) {
          if (subject.employeeId === 'e-bad') {
            return { status: 'error', error: 'fallo-test' };
          }
          if (subject.employeeId === 'e-skip') {
            return { status: 'skip', reason: 'no_sql_snapshot' };
          }
          return { status: 'ready', facts: good };
        },
      },
      options: {
        horizonStart: '2026-07-20',
        horizonEnd: '2026-07-20',
        runId: 'sum-1',
        clock: { nowIso: () => '2026-07-24T12:00:00.000Z' },
        fixedDurationMs: 9,
      },
      persistence: ports,
      persistMeta: { hoursEngineVersion: 'he' },
    });

    const text = formatShadowRunSummary(
      { result, persist },
      { persistEnabled: true },
    );
    assert.match(text, /Succeeded:\s+1/);
    assert.match(text, /Failed:\s+1/);
    assert.match(text, /fallo-test/);
    assert.match(text, /Persist:/);
  });
});
