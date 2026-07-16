import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { liquidateWeek } from './liquidation-engine.ts';
import type { EmployeeBoundaryFacts, LiquidationInput, TimeLogFact } from './types.ts';

const EPS = 1e-9;

const employeeBase = (
  overrides: Partial<EmployeeBoundaryFacts> = {},
): EmployeeBoundaryFacts => ({
  employeeId: 'emp-1',
  joiningDate: '2026-01-01',
  endDate: null,
  terms: [
    {
      effectiveFrom: '2026-01-01',
      effectiveTo: null,
      weeklyHours: 40,
      bagMode: true,
      regime: 'staff',
    },
  ],
  ...overrides,
});

function log(day: string, hours: number): TimeLogFact {
  return {
    clockInIso: `${day}T08:00:00.000Z`,
    clockOutIso: `${day}T16:00:00.000Z`,
    totalHours: hours,
  };
}

function input(
  partial: Partial<LiquidationInput> & Pick<LiquidationInput, 'weekStart'>,
): LiquidationInput {
  return {
    employee: employeeBase(),
    logs: [],
    isPaid: false,
    carryIn: 0,
    ...partial,
  };
}

function assertDailyEqualsWeekly(r: ReturnType<typeof liquidateWeek>) {
  const sumDailyOt = r.dailyBreakdown.days.reduce((a, d) => a + d.overtimeHours, 0);
  const sumDailyOrd = r.dailyBreakdown.days.reduce((a, d) => a + d.ordinaryHours, 0);
  assert.ok(Math.abs(sumDailyOt - r.overtimeHours) < EPS);
  assert.ok(Math.abs(sumDailyOrd - r.ordinaryHours) < EPS);
  assert.ok(Math.abs(r.dailyBreakdown.overtimeHoursTotal - r.overtimeHours) < EPS);
  assert.ok(Math.abs(r.dailyBreakdown.ordinaryHoursTotal - r.ordinaryHours) < EPS);
}

describe('Daily Breakdown — regla running + coherencia semanal', () => {
  it('contrato 40h: exceso en un único día (vie Ex=2)', () => {
    const r = liquidateWeek(
      input({
        weekStart: '2026-03-02',
        logs: [
          log('2026-03-02', 8),
          log('2026-03-03', 8),
          log('2026-03-04', 8),
          log('2026-03-05', 8),
          log('2026-03-06', 10),
        ],
      }),
    );
    assert.equal(r.overtimeHours, 2);
    assert.equal(r.dailyBreakdown.days.find((d) => d.day === '2026-03-06')!.overtimeHours, 2);
    for (const d of ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05']) {
      assert.equal(r.dailyBreakdown.days.find((x) => x.day === d)!.overtimeHours, 0);
    }
    assertDailyEqualsWeekly(r);
  });

  it('contrato 16h: exceso repartido en varios días', () => {
    const emp = employeeBase({
      terms: [
        {
          effectiveFrom: '2026-01-01',
          effectiveTo: null,
          weeklyHours: 16,
          bagMode: false,
          regime: 'staff',
        },
      ],
    });
    const r = liquidateWeek(
      input({
        employee: emp,
        weekStart: '2026-03-02',
        logs: [
          log('2026-03-02', 8),
          log('2026-03-03', 8),
          log('2026-03-04', 8),
        ],
      }),
    );
    // 24 − 16 = 8 extras
    assert.equal(r.overtimeHours, 8);
    const byDay = Object.fromEntries(
      r.dailyBreakdown.days.map((d) => [d.day, d.overtimeHours]),
    );
    // lun 8 → Ex 0; mar 8 → Ex 0 hasta 16; mié 8 → Ex 8
    assert.equal(byDay['2026-03-02'], 0);
    assert.equal(byDay['2026-03-03'], 0);
    assert.equal(byDay['2026-03-04'], 8);
    assertDailyEqualsWeekly(r);
  });

  it('exceso parcial el día del cruce (jue 8 con tope 30 → Ex=2)', () => {
    const emp = employeeBase({
      terms: [
        {
          effectiveFrom: '2026-01-01',
          effectiveTo: null,
          weeklyHours: 30,
          bagMode: true,
          regime: 'staff',
        },
      ],
    });
    const r = liquidateWeek(
      input({
        employee: emp,
        weekStart: '2026-03-02',
        logs: [
          log('2026-03-02', 10),
          log('2026-03-03', 10),
          log('2026-03-04', 10),
          log('2026-03-05', 8),
        ],
      }),
    );
    // 38 − 30 = 8; jue: acc prev 30 → Ex 8
    assert.equal(r.overtimeHours, 8);
    assert.equal(r.dailyBreakdown.days.find((d) => d.day === '2026-03-05')!.overtimeHours, 8);
    assert.equal(r.dailyBreakdown.days.find((d) => d.day === '2026-03-05')!.ordinaryHours, 0);
    assertDailyEqualsWeekly(r);
  });

  it('cambio de contrato mid-week: Σ diarias = semanales', () => {
    const emp = employeeBase({
      terms: [
        {
          effectiveFrom: '2026-03-01',
          effectiveTo: '2026-03-03',
          weeklyHours: 16,
          bagMode: false,
          regime: 'staff',
        },
        {
          effectiveFrom: '2026-03-04',
          effectiveTo: null,
          weeklyHours: 40,
          bagMode: true,
          regime: 'staff',
        },
      ],
    });
    const r = liquidateWeek(
      input({
        employee: emp,
        weekStart: '2026-03-02',
        logs: [
          log('2026-03-02', 10),
          log('2026-03-03', 10),
          log('2026-03-04', 10),
          log('2026-03-05', 10),
          log('2026-03-06', 10),
        ],
      }),
    );
    assert.ok(r.overtimeHours > 0);
    assertDailyEqualsWeekly(r);
  });

  it('alta mid-week: días pre-alta son 100% extras', () => {
    const emp = employeeBase({
      joiningDate: '2026-03-04',
      terms: [
        {
          effectiveFrom: '2026-03-04',
          effectiveTo: null,
          weeklyHours: 40,
          bagMode: true,
          regime: 'staff',
        },
      ],
    });
    const r = liquidateWeek(
      input({
        employee: emp,
        weekStart: '2026-03-02',
        logs: [
          log('2026-03-02', 8),
          log('2026-03-03', 8),
          log('2026-03-04', 8),
        ],
      }),
    );
    assert.equal(r.dailyBreakdown.days.find((d) => d.day === '2026-03-02')!.overtimeHours, 8);
    assert.equal(r.dailyBreakdown.days.find((d) => d.day === '2026-03-03')!.overtimeHours, 8);
    assertDailyEqualsWeekly(r);
  });

  it('baja mid-week: post-baja no aporta horas al breakdown', () => {
    const emp = employeeBase({
      endDate: '2026-03-04',
      terms: [
        {
          effectiveFrom: '2026-01-01',
          effectiveTo: null,
          weeklyHours: 40,
          bagMode: true,
          regime: 'staff',
        },
      ],
    });
    const r = liquidateWeek(
      input({
        employee: emp,
        weekStart: '2026-03-02',
        logs: [
          log('2026-03-02', 8),
          log('2026-03-04', 8),
          log('2026-03-06', 8), // post-baja: aggregator ignora
        ],
      }),
    );
    assert.equal(r.hoursWorked, 16);
    assert.equal(r.dailyBreakdown.days.find((d) => d.day === '2026-03-06')!.hours, 0);
    assertDailyEqualsWeekly(r);
  });

  it('bolsa vs pago: no cambia extras diarias (solo carry)', () => {
    const logs = [
      log('2026-03-02', 8),
      log('2026-03-03', 8),
      log('2026-03-04', 8),
      log('2026-03-05', 8),
      log('2026-03-06', 10),
    ];
    const bag = liquidateWeek(
      input({
        weekStart: '2026-03-02',
        logs,
        employee: employeeBase({
          terms: [
            {
              effectiveFrom: '2026-01-01',
              effectiveTo: null,
              weeklyHours: 40,
              bagMode: true,
              regime: 'staff',
            },
          ],
        }),
      }),
    );
    const pay = liquidateWeek(
      input({
        weekStart: '2026-03-02',
        logs,
        employee: employeeBase({
          terms: [
            {
              effectiveFrom: '2026-01-01',
              effectiveTo: null,
              weeklyHours: 40,
              bagMode: false,
              regime: 'staff',
            },
          ],
        }),
      }),
    );
    assert.equal(bag.overtimeHours, pay.overtimeHours);
    assert.deepEqual(
      bag.dailyBreakdown.days.map((d) => d.overtimeHours),
      pay.dailyBreakdown.days.map((d) => d.overtimeHours),
    );
    assertDailyEqualsWeekly(bag);
    assertDailyEqualsWeekly(pay);
  });

  it('semana sin extras', () => {
    const r = liquidateWeek(
      input({
        weekStart: '2026-03-02',
        logs: [
          log('2026-03-02', 8),
          log('2026-03-03', 8),
          log('2026-03-04', 8),
          log('2026-03-05', 8),
          log('2026-03-06', 8),
        ],
      }),
    );
    assert.equal(r.overtimeHours, 0);
    assert.ok(r.dailyBreakdown.days.every((d) => d.overtimeHours === 0));
    assertDailyEqualsWeekly(r);
  });

  it('semana sin fichajes', () => {
    const r = liquidateWeek(input({ weekStart: '2026-03-02', logs: [] }));
    assert.equal(r.overtimeHours, 0);
    assert.equal(r.dailyBreakdown.days.length, 7);
    assert.ok(r.dailyBreakdown.days.every((d) => d.hours === 0 && d.overtimeHours === 0));
    assertDailyEqualsWeekly(r);
  });

  it('propiedad global: Σ extras diarias === extras semanales (matriz)', () => {
    const cases: LiquidationInput[] = [
      input({
        weekStart: '2026-03-02',
        logs: [log('2026-03-02', 12), log('2026-03-06', 12)],
      }),
      input({
        weekStart: '2026-08-03', // agosto → todo extra
        logs: [log('2026-08-03', 5), log('2026-08-04', 5)],
      }),
      input({
        weekStart: '2026-03-02',
        employee: employeeBase({
          terms: [
            {
              effectiveFrom: '2026-01-01',
              effectiveTo: null,
              weeklyHours: 40,
              bagMode: true,
              regime: 'manager',
            },
          ],
        }),
        logs: [log('2026-03-02', 7)],
      }),
    ];
    for (const c of cases) {
      assertDailyEqualsWeekly(liquidateWeek(c));
    }
  });
});
