import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type {
  EmployeeBoundaryFacts,
  LiquidationResult,
} from '../../hours-engine/types.ts';
import type { ShadowSubjectFacts } from './ports.ts';
import {
  executeShadowRun,
  factLoaderFromMap,
  subjectKey,
  subjectLoaderFromList,
} from './run-shadow.ts';

function fixtureEmployee(employeeId: string): EmployeeBoundaryFacts {
  return {
    employeeId,
    joiningDate: '2026-01-01',
    endDate: null,
    terms: [
      {
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
        weeklyHours: 40,
        bagMode: true,
        regime: 'staff',
        overtimeRatePerHour: 10,
      },
    ],
  };
}

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
  liqOverrides: Partial<LiquidationResult> = {},
): ShadowSubjectFacts {
  const liq = liquidation({
    employeeId,
    weekStart,
    ...liqOverrides,
  });
  return {
    subject: { employeeId, weekStart },
    liquidation: liq,
    employee: fixtureEmployee(employeeId),
    bagModeOverride: true,
    overrideRate: null,
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

function fixtureMap(
  items: ShadowSubjectFacts[],
): Map<string, ShadowSubjectFacts> {
  const m = new Map<string, ShadowSubjectFacts>();
  for (const f of items) {
    m.set(subjectKey(f.subject), f);
  }
  return m;
}

const CLOCK = { nowIso: () => '2026-07-24T12:00:00.000Z' };

describe('executeShadowRun (fixtures)', () => {
  it('recorre sujetos, compara y calcula métricas en memoria', async () => {
    const a = alignedFacts('e1', '2026-07-20');
    const b = alignedFacts('e2', '2026-07-20', {
      hoursWorked: 45,
      overtimeHours: 5,
      weeklyBalance: 5,
      balanceFinal: 5,
      carryOut: 5,
      ordinaryHours: 40,
    });
    // SQL desalineado en extras → diff
    b.snapshot.extra_hours = 3;
    b.snapshot.final_balance = 5;
    b.snapshot.balance_hours = 5;
    b.snapshot.total_hours = 45;

    const result = await executeShadowRun({
      subjects: subjectLoaderFromList([
        { employeeId: 'e2', weekStart: '2026-07-20' },
        { employeeId: 'e1', weekStart: '2026-07-20' },
      ]),
      facts: factLoaderFromMap(fixtureMap([a, b])),
      options: {
        horizonStart: '2026-07-20',
        horizonEnd: '2026-07-26',
        runId: 'run-fixed-1',
        clock: CLOCK,
        fixedDurationMs: 42,
      },
    });

    assert.equal(result.status, 'completed');
    assert.equal(result.runId, 'run-fixed-1');
    assert.equal(result.startedAt, '2026-07-24T12:00:00.000Z');
    assert.equal(result.finishedAt, '2026-07-24T12:00:00.000Z');
    assert.equal(result.metrics.durationMs, 42);
    assert.equal(result.metrics.comparisons, 2);
    assert.equal(result.metrics.exactMatches, 1);
    assert.equal(result.metrics.diffs, 1);
    assert.equal(result.comparisons[0]!.employeeId, 'e1');
    assert.equal(result.comparisons[0]!.matchStatus, 'exact');
    assert.equal(result.comparisons[1]!.employeeId, 'e2');
    assert.equal(result.comparisons[1]!.matchStatus, 'diff');
    assert.ok((result.metrics.byCode.D006 ?? 0) >= 1);
  });

  it('cuenta skipped sin comparar', async () => {
    const a = alignedFacts('e1', '2026-07-20');
    (a as { skip?: boolean; skipReason?: string }).skip = true;
    (a as { skipReason?: string }).skipReason = 'test-skip';
    const result = await executeShadowRun({
      subjects: subjectLoaderFromList([
        { employeeId: 'e1', weekStart: '2026-07-20' },
      ]),
      facts: factLoaderFromMap(fixtureMap([a])),
      options: {
        horizonStart: '2026-07-20',
        horizonEnd: '2026-07-26',
        runId: 'run-skip',
        clock: CLOCK,
        fixedDurationMs: 1,
      },
    });
    assert.equal(result.metrics.skipped, 1);
    assert.equal(result.metrics.comparisons, 0);
    assert.equal(result.comparisons.length, 0);
  });

  it('es determinista: dos runs idénticos → mismo resultado', async () => {
    const a = alignedFacts('e1', '2026-07-13');
    const b = alignedFacts('e1', '2026-07-20', {
      hoursWorked: 42,
      overtimeHours: 2,
      weeklyBalance: 2,
      balanceFinal: 2,
      carryOut: 2,
    });
    b.snapshot.extra_hours = null;

    const opts = {
      horizonStart: '2026-07-13',
      horizonEnd: '2026-07-26',
      runId: 'run-det',
      clock: CLOCK,
      fixedDurationMs: 7,
    } as const;

    const subjects = subjectLoaderFromList([
      { employeeId: 'e1', weekStart: '2026-07-20' },
      { employeeId: 'e1', weekStart: '2026-07-13' },
    ]);
    const facts = factLoaderFromMap(fixtureMap([a, b]));

    const r1 = await executeShadowRun({ subjects, facts, options: { ...opts } });
    const r2 = await executeShadowRun({ subjects, facts, options: { ...opts } });

    assert.deepEqual(r1, r2);
  });

  it('tolerated cuando solo D004', async () => {
    const a = alignedFacts('e1', '2026-07-20', {
      weeklyBalance: 1.02,
      balanceFinal: 0,
      carryOut: 0,
    });
    a.snapshot.balance_hours = 1.0;
    a.snapshot.final_balance = 0;

    const result = await executeShadowRun({
      subjects: subjectLoaderFromList([
        { employeeId: 'e1', weekStart: '2026-07-20' },
      ]),
      facts: factLoaderFromMap(fixtureMap([a])),
      options: {
        horizonStart: '2026-07-20',
        horizonEnd: '2026-07-26',
        runId: 'run-tol',
        clock: CLOCK,
        fixedDurationMs: 1,
      },
    });
    assert.equal(result.comparisons[0]!.matchStatus, 'tolerated');
    assert.equal(result.metrics.toleratedMatches, 1);
    assert.ok(
      result.comparisons[0]!.fieldDiffs.every((d) => d.discrepancyCode === 'D004'),
    );
  });

  it('fallo por sujeto no aborta el run', async () => {
    const good = alignedFacts('e1', '2026-07-20');
    const result = await executeShadowRun({
      subjects: subjectLoaderFromList([
        { employeeId: 'e-bad', weekStart: '2026-07-20' },
        { employeeId: 'e1', weekStart: '2026-07-20' },
      ]),
      facts: {
        loadFacts(subject) {
          if (subject.employeeId === 'e-bad') {
            return { status: 'error', error: 'boom-empleado' };
          }
          return { status: 'ready', facts: good };
        },
      },
      options: {
        horizonStart: '2026-07-20',
        horizonEnd: '2026-07-26',
        runId: 'run-partial-fail',
        clock: CLOCK,
        fixedDurationMs: 3,
      },
    });
    assert.equal(result.status, 'completed');
    assert.equal(result.metrics.failed, 1);
    assert.equal(result.metrics.succeeded, 1);
    assert.equal(result.metrics.comparisons, 1);
    assert.equal(
      result.subjectOutcomes.find((o) => o.employeeId === 'e-bad')?.outcome,
      'failed',
    );
    assert.equal(
      result.subjectOutcomes.find((o) => o.employeeId === 'e1')?.outcome,
      'succeeded',
    );
  });
});
