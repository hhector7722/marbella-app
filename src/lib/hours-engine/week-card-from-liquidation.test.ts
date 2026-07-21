import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertCardMatchesLiquidation,
  liquidateWeekForCard,
  patchWeeksFromLiquidation,
  weekCardSummaryFromLiquidation,
} from './week-card-from-liquidation.ts';
import type {
  ContractTermFact,
  EmployeeBoundaryFacts,
  TimeLogFact,
} from './types.ts';

function term(
  from: string,
  to: string | null,
  weeklyHours: number,
  opts: Partial<ContractTermFact> = {},
): ContractTermFact {
  return {
    effectiveFrom: from,
    effectiveTo: to,
    weeklyHours,
    bagMode: opts.bagMode ?? false,
    regime: opts.regime ?? 'staff',
    overtimeRatePerHour: opts.overtimeRatePerHour ?? 10,
  };
}

function emp(terms: ContractTermFact[], id = 'u1'): EmployeeBoundaryFacts {
  return {
    employeeId: id,
    joiningDate: '2026-01-01',
    endDate: null,
    terms,
  };
}

function dayLog(day: string, hours: number): TimeLogFact {
  return {
    clockInIso: `${day}T08:00:00.000Z`,
    clockOutIso: `${day}T${String(8 + Math.floor(hours)).padStart(2, '0')}:00:00.000Z`,
    totalHours: hours,
  };
}

function assertCardCoherent(
  summary: ReturnType<typeof weekCardSummaryFromLiquidation>,
  result: ReturnType<typeof liquidateWeekForCard>['result'],
  daysExtra: ReadonlyArray<number>,
) {
  assertCardMatchesLiquidation(summary, result);
  // Σ Ex. diarias = overtimeHours del motor (desglose operativo).
  const sumDays = daysExtra.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sumDays - result.overtimeHours) < 1e-9);
  assert.ok(Math.abs(sumDays - result.dailyBreakdown.overtimeHoursTotal) < 1e-9);
  // Footer EXTRAS (pago) puede ser < OT bruto si hay deuda o absorción.
  if (summary.preferStock) {
    assert.ok(Math.abs(summary.weeklyBalance - result.overtimeHours) < 1e-9);
  } else {
    assert.ok(summary.weeklyBalance <= result.overtimeHours + 1e-9);
  }
}

describe('week-card-from-liquidation — tarjeta = LiquidationResult', () => {
  it('semana normal sin extras', () => {
    const employee = emp([term('2026-01-01', null, 40)]);
    const logs = [
      dayLog('2026-03-02', 8),
      dayLog('2026-03-03', 8),
      dayLog('2026-03-04', 8),
      dayLog('2026-03-05', 8),
      dayLog('2026-03-06', 8),
    ];
    const { result, summary, extrasByDay } = liquidateWeekForCard({
      carryIn: 0,
      employee,
      weekStart: '2026-03-02',
      logs,
    });
    assert.equal(summary.weeklyBalance, 0);
    assert.equal(summary.totalHours, 40);
    assertCardCoherent(summary, result, Object.values(extrasByDay));
  });

  it('semana con extras (pago)', () => {
    const employee = emp([term('2026-01-01', null, 16, { bagMode: false, overtimeRatePerHour: 10 })]);
    const logs = [
      dayLog('2026-07-13', 8),
      dayLog('2026-07-14', 8),
      dayLog('2026-07-15', 8),
      dayLog('2026-07-16', 8),
    ];
    const { result, summary, extrasByDay } = liquidateWeekForCard({
      carryIn: 0,
      employee,
      weekStart: '2026-07-13',
      logs,
    });
    assert.equal(summary.weeklyBalance, 16);
    assert.equal(summary.estimatedValue, 160);
    assert.equal(preferStock(summary), false);
    assert.equal(extrasByDay['2026-07-15'], 8);
    assert.equal(extrasByDay['2026-07-16'], 8);
    assertCardCoherent(summary, result, Object.values(extrasByDay));
  });

  it('semana sin extras (trabajado = contrato)', () => {
    const employee = emp([term('2026-01-01', null, 16)]);
    const logs = [dayLog('2026-03-02', 8), dayLog('2026-03-03', 8)];
    const { result, summary, extrasByDay } = liquidateWeekForCard({
      carryIn: 0,
      employee,
      weekStart: '2026-03-02',
      logs,
    });
    assert.equal(summary.weeklyBalance, 0);
    assert.equal(summary.estimatedValue, 0);
    assertCardCoherent(summary, result, Object.values(extrasByDay));
  });

  it('contrato 16→40 mid-week: footer coherente con liquidación', () => {
    const employee = emp([
      term('2026-01-01', '2026-03-04', 16),
      term('2026-03-05', null, 40),
    ]);
    const logs = [
      dayLog('2026-03-02', 8),
      dayLog('2026-03-03', 8),
      dayLog('2026-03-04', 8),
      dayLog('2026-03-05', 8),
      dayLog('2026-03-06', 8),
    ];
    const { result, summary, extrasByDay } = liquidateWeekForCard({
      carryIn: 0,
      employee,
      weekStart: '2026-03-02',
      logs,
    });
    assertCardCoherent(summary, result, Object.values(extrasByDay));
    // Footer EXTRAS ≤ OT bruto; si hay cobro, coincide con netPayable.
    assert.ok(summary.weeklyBalance <= result.overtimeHours + 1e-9);
  });

  it('bolsa: extras en footer, importe 0', () => {
    const employee = emp([
      term('2026-01-01', null, 16, { bagMode: true, overtimeRatePerHour: 10 }),
    ]);
    const logs = [
      dayLog('2026-03-02', 8),
      dayLog('2026-03-03', 8),
      dayLog('2026-03-04', 8),
      dayLog('2026-03-05', 8),
    ];
    const { result, summary, extrasByDay } = liquidateWeekForCard({
      carryIn: 0,
      employee,
      weekStart: '2026-03-02',
      logs,
    });
    assert.ok(summary.weeklyBalance > 0);
    assert.equal(summary.estimatedValue, 0);
    assert.equal(summary.preferStock, true);
    assertCardCoherent(summary, result, Object.values(extrasByDay));
  });

  it('pago: extras + importe', () => {
    const employee = emp([
      term('2026-01-01', null, 16, { bagMode: false, overtimeRatePerHour: 12 }),
    ]);
    const logs = [
      dayLog('2026-03-02', 8),
      dayLog('2026-03-03', 8),
      dayLog('2026-03-04', 8),
    ];
    const { result, summary, extrasByDay } = liquidateWeekForCard({
      carryIn: 0,
      employee,
      weekStart: '2026-03-02',
      logs,
    });
    assert.equal(summary.preferStock, false);
    assert.equal(summary.estimatedValue, summary.weeklyBalance * 12);
    assertCardCoherent(summary, result, Object.values(extrasByDay));
  });

  it('agosto: régimen agosto vía días del mes', () => {
    const employee = emp([term('2026-01-01', null, 40, { bagMode: false })]);
    const logs = [
      dayLog('2026-08-03', 8),
      dayLog('2026-08-04', 8),
      dayLog('2026-08-05', 8),
      dayLog('2026-08-06', 8),
      dayLog('2026-08-07', 8),
    ];
    const { result, summary, extrasByDay } = liquidateWeekForCard({
      carryIn: 0,
      employee,
      weekStart: '2026-08-03',
      logs,
    });
    // Agosto: todo trabajado es extra (contrato efectivo 0 en días agosto)
    assert.ok(summary.weeklyBalance > 0);
    assertCardCoherent(summary, result, Object.values(extrasByDay));
  });

  it('manager: jornada 0, extras = trabajado', () => {
    const employee = emp([
      term('2026-01-01', null, 0, { regime: 'manager', bagMode: false }),
    ]);
    const logs = [dayLog('2026-03-02', 8), dayLog('2026-03-03', 8)];
    const { result, summary, extrasByDay } = liquidateWeekForCard({
      carryIn: 0,
      employee,
      weekStart: '2026-03-02',
      logs,
    });
    assert.equal(summary.totalHours, 16);
    assert.equal(summary.weeklyBalance, 16);
    assertCardCoherent(summary, result, Object.values(extrasByDay));
  });

  it('deuda total absorbe extras: importe = 0', () => {
    const employee = emp([term('2026-01-01', null, 16, { bagMode: false, overtimeRatePerHour: 10 })]);
    const logs = [
      dayLog('2026-03-02', 8),
      dayLog('2026-03-03', 8),
      dayLog('2026-03-04', 8),
    ];
    // 24h trabajadas − 16h contrato = 8h extras; −13.3 → Marbella −13
    const { summary, result } = liquidateWeekForCard({
      carryIn: -13.3,
      employee,
      weekStart: '2026-03-02',
      logs,
    });
    assert.equal(result.overtimeHours, 8);
    assert.equal(summary.startBalance, -13);
    assert.ok(result.carryOut < 0);
    // Deuda no cubierta → no se cobra ni se muestran extras a cobro
    assert.equal(summary.weeklyBalance, 0);
    assert.equal(summary.estimatedValue, 0);
  });

  it('deuda parcial: paga solo el excedente', () => {
    const employee = emp([term('2026-01-01', null, 16, { bagMode: false, overtimeRatePerHour: 10 })]);
    const logs = [
      dayLog('2026-03-02', 8),
      dayLog('2026-03-03', 8),
      dayLog('2026-03-04', 8),
      dayLog('2026-03-05', 8),
    ];
    // 32h − 16h = 16h extras, carryIn = −5
    const { summary } = liquidateWeekForCard({
      carryIn: -5,
      employee,
      weekStart: '2026-03-02',
      logs,
    });
    assert.equal(summary.startBalance, -5);
    // 16 extras − 5 deuda = 11 pagables × 10€ = 110€; EXTRAS footer = 11
    assert.equal(summary.weeklyBalance, 11);
    assert.equal(summary.estimatedValue, 110);
  });

  it('sin deuda: extras se pagan completas', () => {
    const employee = emp([term('2026-01-01', null, 16, { bagMode: false, overtimeRatePerHour: 10 })]);
    const logs = [
      dayLog('2026-03-02', 8),
      dayLog('2026-03-03', 8),
      dayLog('2026-03-04', 8),
    ];
    // 24h − 16h = 8h extras, carryIn = 0
    const { summary } = liquidateWeekForCard({
      carryIn: 0,
      employee,
      weekStart: '2026-03-02',
      logs,
    });
    assert.equal(summary.weeklyBalance, 8);
    assert.equal(summary.estimatedValue, 80);
  });

  it('crédito positivo + extras se liquidan en pago', () => {
    const employee = emp([term('2026-01-01', null, 16, { bagMode: false, overtimeRatePerHour: 10 })]);
    const logs = [
      dayLog('2026-03-02', 8),
      dayLog('2026-03-03', 8),
      dayLog('2026-03-04', 8),
    ];
    // 8h extras, carryIn = +5 (crédito acumulado)
    const { summary } = liquidateWeekForCard({
      carryIn: 5,
      employee,
      weekStart: '2026-03-02',
      logs,
    });
    // EXTRAS footer = solo las de esta semana (8); IMPORTE liquida 5+8=13h
    assert.equal(summary.weeklyBalance, 8);
    assert.equal(summary.estimatedValue, 130);
  });

  it('bolsa: crédito positivo no genera importe', () => {
    const employee = emp([term('2026-01-01', null, 16, { bagMode: true, overtimeRatePerHour: 10 })]);
    const logs = [
      dayLog('2026-03-02', 8),
      dayLog('2026-03-03', 8),
      dayLog('2026-03-04', 8),
    ];
    const { summary } = liquidateWeekForCard({
      carryIn: 5,
      employee,
      weekStart: '2026-03-02',
      logs,
    });
    assert.equal(summary.estimatedValue, 0);
    assert.equal(summary.preferStock, true);
  });

  it('cambio 16→40 + baja solo en tramo 40: NO cobra si queda deuda', () => {
    // Caso Alba S18: lun–jue bajo 16 (0h), vie–dom bajo 40 con 24h baja.
    // OT bruto del 2º tramo ≈6.9 pero la semana queda en −2.3 → extras=0, importe=0.
    const employee = emp([
      term('2026-01-01', '2026-04-30', 16, { bagMode: false, overtimeRatePerHour: 10 }),
      term('2026-05-01', null, 40, { bagMode: false, overtimeRatePerHour: 10 }),
    ]);
    const logs = [
      dayLog('2026-05-01', 8),
      dayLog('2026-05-02', 8),
      dayLog('2026-05-03', 8),
    ];
    const { summary, result } = liquidateWeekForCard({
      carryIn: 0,
      employee,
      weekStart: '2026-04-27',
      logs,
    });
    assert.equal(summary.totalHours, 24);
    assert.ok(result.overtimeHours > 6); // OT bruto del tramo 40 existe
    assert.ok(result.carryOut <= -2); // arrastra deuda (~2h; contrato redondeado a 26)
    assert.equal(summary.weeklyBalance, 0); // no se muestran extras a cobro
    assert.equal(summary.estimatedValue, 0); // no se cobra
    assert.equal(result.contractedHoursEffective, 26); // enteros/medias, no 26.285
  });

  it('override semanal BOLSA: no cobra e importa preferStock', () => {
    const employee = emp([term('2026-01-01', null, 16, { bagMode: false, overtimeRatePerHour: 10 })]);
    const logs = [
      dayLog('2026-03-02', 8),
      dayLog('2026-03-03', 8),
      dayLog('2026-03-04', 8),
    ];
    // Contrato en PAGO, pero override semanal → BOLSA
    const { summary, result } = liquidateWeekForCard({
      carryIn: 0,
      employee,
      weekStart: '2026-03-02',
      logs,
      bagModeOverride: true,
    });
    assert.equal(summary.preferStock, true);
    assert.equal(summary.estimatedValue, 0);
    assert.ok(summary.weeklyBalance > 0);
    assert.ok(result.carryOut > 0); // crédito arrastra en bolsa
  });

  it('override semanal PAGO: fuerza liquidación aunque el contrato sea bolsa', () => {
    const employee = emp([term('2026-01-01', null, 16, { bagMode: true, overtimeRatePerHour: 10 })]);
    const logs = [
      dayLog('2026-03-02', 8),
      dayLog('2026-03-03', 8),
      dayLog('2026-03-04', 8),
    ];
    const { summary, result } = liquidateWeekForCard({
      carryIn: 0,
      employee,
      weekStart: '2026-03-02',
      logs,
      bagModeOverride: false,
    });
    assert.equal(summary.preferStock, false);
    assert.equal(summary.estimatedValue, 80);
    assert.equal(result.carryOut, 0);
  });

  it('fijo: jornada 0, extras = trabajado', () => {
    const employee = emp([
      term('2026-01-01', null, 0, { regime: 'fixed', bagMode: false }),
    ]);
    const logs = [dayLog('2026-03-02', 5)];
    const { result, summary, extrasByDay } = liquidateWeekForCard({
      carryIn: 0,
      employee,
      weekStart: '2026-03-02',
      logs,
    });
    assert.equal(summary.weeklyBalance, 5);
    assertCardCoherent(summary, result, Object.values(extrasByDay));
  });

  it('patchWeeksFromLiquidation: imposible Ex. diarias ≠ EXTRAS footer', () => {
    const employee = emp([term('2026-01-01', null, 16, { overtimeRatePerHour: 10 })]);
    const logs = [
      dayLog('2026-07-13', 8),
      dayLog('2026-07-14', 8),
      dayLog('2026-07-15', 8),
      dayLog('2026-07-16', 8),
    ];
    const patched = patchWeeksFromLiquidation(
      [
        {
          startDate: '2026-07-13',
          summary: { isPaid: false },
          days: [
            { date: '2026-07-13', extraHours: 99 },
            { date: '2026-07-14', extraHours: 99 },
            { date: '2026-07-15', extraHours: 99 },
            { date: '2026-07-16', extraHours: 99 },
            { date: '2026-07-17', extraHours: 99 },
            { date: '2026-07-18', extraHours: 99 },
            { date: '2026-07-19', extraHours: 99 },
          ],
        },
      ],
      employee,
      logs,
      { openingCarryIn: 0 },
    );
    const week = patched[0]!;
    const sumDaily = week.days.reduce((a, d) => a + d.extraHours, 0);
    assert.equal(week.summary!.weeklyBalance, 16);
    assert.equal(sumDaily, week.summary!.weeklyBalance);
    assert.equal(week.summary!.estimatedValue, 160);
  });
});

function preferStock(s: { preferStock: boolean }) {
  return s.preferStock;
}
