import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  employeeTimelineStartWeek,
  resolveOpeningCarryIn,
} from './opening-carry.ts';
import {
  liquidateWeekForCard,
  patchWeeksFromLiquidation,
} from './week-card-from-liquidation.ts';
import type {
  ContractTermFact,
  EmployeeBoundaryFacts,
  TimeLogFact,
} from './types.ts';
import { addCivilDays, mondayOnOrBefore } from './week-dates.ts';

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
    bagMode: opts.bagMode ?? true,
    regime: opts.regime ?? 'staff',
    overtimeRatePerHour: opts.overtimeRatePerHour ?? 10,
  };
}

function emp(
  terms: ContractTermFact[],
  joiningDate: string | null = '2026-01-05',
  id = 'u1',
): EmployeeBoundaryFacts {
  return {
    employeeId: id,
    joiningDate,
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

/** 5×8h = 40h en una semana (lun–vie). */
function week40(weekStart: string): TimeLogFact[] {
  return [0, 1, 2, 3, 4].map((i) => dayLog(addCivilDays(weekStart, i), 8));
}

/** 5×7h = 35h → deuda −5 si contrato 40. */
function week35(weekStart: string): TimeLogFact[] {
  return [0, 1, 2, 3, 4].map((i) => dayLog(addCivilDays(weekStart, i), 7));
}

const unpaid = () => false;

function emptyDays(weekStart: string) {
  return Array.from({ length: 7 }, (_, i) => ({
    date: addCivilDays(weekStart, i),
    extraHours: 0,
  }));
}

describe('opening-carry — cadena continua', () => {
  it('primer mes del histórico → openingCarryIn = 0', () => {
    const employee = emp([term('2026-01-05', null, 40)]);
    const timeline = employeeTimelineStartWeek(employee)!;
    assert.equal(timeline, mondayOnOrBefore('2026-01-05'));

    const opening = resolveOpeningCarryIn({
      employee,
      chainStart: timeline,
      logs: [],
      isPaidByWeek: unpaid,
    });
    assert.equal(opening, 0);
  });

  it('continuidad mismo mes: W2 recibe carryOut de W1', () => {
    const employee = emp([term('2026-05-01', null, 40)], '2026-05-01');
    const w1 = '2026-05-04';
    const w2 = '2026-05-11';
    const logs = [...week35(w1), ...week40(w2)];

    const openingW2 = resolveOpeningCarryIn({
      employee,
      chainStart: w2,
      logs,
      isPaidByWeek: unpaid,
    });
    assert.equal(openingW2, -5);

    const { summary } = liquidateWeekForCard({
      employee,
      weekStart: w2,
      logs,
      carryIn: openingW2,
    });
    assert.equal(summary.startBalance, -5);
  });

  it('continuidad mayo → junio (límite de mes)', () => {
    const employee = emp([term('2026-05-01', null, 40)], '2026-05-01');
    const w22 = '2026-05-25';
    const w23 = '2026-06-01';
    const logs = [...week35(w22), ...week40(w23)];

    // Cadena parcial: solo mayo (como historial filtrado) + opening para junio
    const mayPatched = patchWeeksFromLiquidation(
      [{ startDate: w22, days: emptyDays(w22), summary: { isPaid: false } }],
      employee,
      logs,
      {
        openingCarryIn: resolveOpeningCarryIn({
          employee,
          chainStart: w22,
          logs,
          isPaidByWeek: unpaid,
        }),
      },
    );

    const juneOpening = resolveOpeningCarryIn({
      employee,
      chainStart: w23,
      logs,
      isPaidByWeek: unpaid,
    });

    const junePatched = patchWeeksFromLiquidation(
      [{ startDate: w23, days: emptyDays(w23), summary: { isPaid: false } }],
      employee,
      logs,
      { openingCarryIn: juneOpening },
    );

    // carryOut de mayo W22 = startBalance+weekly de esa liquidación → PENDIENTES junio
    assert.equal(mayPatched[0]!.summary!.finalBalance, junePatched[0]!.summary!.startBalance);
    assert.equal(junePatched[0]!.summary!.startBalance, juneOpening);
    assert.ok(Math.abs(juneOpening) > 0.05);
  });

  it('continuidad diciembre → enero (cambio de año)', () => {
    const employee = emp([term('2025-12-01', null, 40)], '2025-12-01');
    const wDec = '2025-12-29';
    const wJan = '2026-01-05';
    const logs = [...week35(wDec), ...week40(wJan)];

    const janOpening = resolveOpeningCarryIn({
      employee,
      chainStart: wJan,
      logs,
      isPaidByWeek: unpaid,
    });
    assert.equal(janOpening, -5);

    const { summary } = liquidateWeekForCard({
      employee,
      weekStart: wJan,
      logs,
      carryIn: janOpening,
    });
    assert.equal(summary.startBalance, -5);
  });

  it('apertura directa en junio (mes intermedio) sin cargar mayo en la UI', () => {
    const employee = emp([term('2026-05-01', null, 40)], '2026-05-01');
    const wMay = '2026-05-25';
    const wJun = '2026-06-01';
    const logs = [...week35(wMay), ...week40(wJun)];

    // Solo se “abre” junio: opening debe reconstruir el carry desde el timeline
    const opening = resolveOpeningCarryIn({
      employee,
      chainStart: wJun,
      logs,
      isPaidByWeek: unpaid,
    });
    assert.equal(opening, -5);

    const patched = patchWeeksFromLiquidation(
      [{ startDate: wJun, days: emptyDays(wJun), summary: { isPaid: false } }],
      employee,
      logs,
      { openingCarryIn: opening },
    );
    assert.equal(patched[0]!.summary!.startBalance, -5);
  });

  it('cambio de empleado: timeline y carry independientes', () => {
    const alba = emp([term('2026-05-01', null, 40)], '2026-05-01', 'alba');
    const pere = emp([term('2026-05-01', null, 40)], '2026-05-01', 'pere');
    const w1 = '2026-05-25';
    const w2 = '2026-06-01';
    const logsAlba = [...week35(w1), ...week40(w2)];
    const logsPere = [...week40(w1), ...week40(w2)];

    const openAlba = resolveOpeningCarryIn({
      employee: alba,
      chainStart: w2,
      logs: logsAlba,
      isPaidByWeek: unpaid,
    });
    const openPere = resolveOpeningCarryIn({
      employee: pere,
      chainStart: w2,
      logs: logsPere,
      isPaidByWeek: unpaid,
    });
    assert.equal(openAlba, -5);
    assert.equal(openPere, 0);
  });

  it('modal y pantalla principal: mismo carryIn para la misma semana', () => {
    const employee = emp([term('2026-05-01', null, 40)], '2026-05-01');
    const wMay = '2026-05-25';
    const wJun = '2026-06-01';
    const logs = [...week35(wMay), ...week40(wJun)];
    const isPaidByWeek = unpaid;

    // Pantalla: patch del mes de junio
    const historyOpening = resolveOpeningCarryIn({
      employee,
      chainStart: wJun,
      logs,
      isPaidByWeek,
    });
    const history = patchWeeksFromLiquidation(
      [{ startDate: wJun, days: emptyDays(wJun), summary: { isPaid: false } }],
      employee,
      logs,
      { openingCarryIn: historyOpening },
    );

    // Modal: liquidateWeekForCard de una sola semana
    const modalOpening = resolveOpeningCarryIn({
      employee,
      chainStart: wJun,
      logs,
      isPaidByWeek,
    });
    const modal = liquidateWeekForCard({
      employee,
      weekStart: wJun,
      logs,
      carryIn: modalOpening,
      isPaid: false,
    });

    assert.equal(historyOpening, modalOpening);
    assert.equal(history[0]!.summary!.startBalance, modal.summary.startBalance);
    assert.equal(history[0]!.summary!.finalBalance, modal.summary.finalBalance);
  });

  it('sin ancla de timeline → opening 0', () => {
    const employee: EmployeeBoundaryFacts = {
      employeeId: 'x',
      joiningDate: null,
      endDate: null,
      terms: [],
    };
    assert.equal(employeeTimelineStartWeek(employee), null);
    assert.equal(
      resolveOpeningCarryIn({
        employee,
        chainStart: '2026-06-01',
        logs: [],
        isPaidByWeek: unpaid,
      }),
      0,
    );
  });
});
