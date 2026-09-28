/**
 * Cierre de agosto en semanas frontera.
 * La distribución es un hecho de empleado + semana, no del contrato.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { buildAugustClosureEditorModel } from './august-closure-editor-model.ts';
import { resolveEffectiveContract, weeklyContractReferenceHours } from './contract-resolver.ts';
import {
  assertExpectedHoursMatchReference,
  assertSavableExpectedWeek,
  expectedHoursLookupFromRows,
  expectedHoursUpsertPayload,
  ExpectedHoursError,
  interpretExpectedHoursRows,
  summarizeClosureHours,
} from './expected-hours.ts';
import {
  assertExpectedHoursMatchContract,
  expectedHoursContractReference,
} from './expected-hours-contract-validation.ts';
import { liquidateWeek } from './liquidation-engine.ts';
import { resolveOpeningCarryIn } from './opening-carry.ts';
import type {
  CivilDate,
  EmployeeBoundaryFacts,
  ExpectedHoursByDay,
  TimeLogFact,
} from './types.ts';
import {
  isAugustCivilDate,
  isPartialAugustClosureWeek,
  weekBounds,
} from './week-dates.ts';
import { isMasterDashboardUser } from '../staff/simulation-identity.ts';

function staff(weeklyHours: number, from = '2020-01-06'): EmployeeBoundaryFacts {
  return {
    employeeId: 'emp',
    joiningDate: from,
    endDate: null,
    terms: [
      {
        effectiveFrom: from,
        effectiveTo: null,
        weeklyHours,
        bagMode: false,
        regime: 'staff',
        overtimeRatePerHour: 10,
      },
    ],
  };
}

function distribution(weekStart: CivilDate, hours: readonly number[]): ExpectedHoursByDay {
  const { days } = weekBounds(weekStart);
  assert.equal(hours.length, 7);
  return Object.fromEntries(days.map((day, index) => [day, hours[index]!]));
}

function debtOf(
  employee: EmployeeBoundaryFacts,
  weekStart: CivilDate,
  expected?: ExpectedHoursByDay | null,
): number {
  return resolveEffectiveContract(employee, weekStart, expected).segments.reduce(
    (acc, segment) => acc + segment.debtContractedHours,
    0,
  );
}

function worked(day: string, hours: number): TimeLogFact[] {
  if (hours === 0) return [];
  return [{ clockInIso: `${day}T10:00:00.000Z`, totalHours: hours }];
}

const MAMADOU = [8, 8, 8, 8, 8, 0, 0] as const;
const SILVIA = [0, 0, 0, 0, 0, 8, 8] as const;

describe('detector de semana frontera', () => {
  it('2026: solo las dos fronteras', () => {
    assert.equal(isPartialAugustClosureWeek('2026-07-27'), true);
    assert.equal(isPartialAugustClosureWeek('2026-08-03'), false);
    assert.equal(isPartialAugustClosureWeek('2026-08-24'), false);
    assert.equal(isPartialAugustClosureWeek('2026-08-31'), true);
    assert.equal(isPartialAugustClosureWeek('2026-09-07'), false);
  });

  it('otros años, sin fechas fijas', () => {
    assert.equal(isPartialAugustClosureWeek('2027-07-26'), true);
    assert.equal(isPartialAugustClosureWeek('2027-08-02'), false);
    assert.equal(isPartialAugustClosureWeek('2027-08-30'), true);
    assert.equal(isPartialAugustClosureWeek('2027-09-06'), false);
    assert.equal(isPartialAugustClosureWeek('2028-07-31'), true);
    assert.equal(isPartialAugustClosureWeek('2028-08-07'), false);
    assert.equal(isPartialAugustClosureWeek('2028-08-28'), true);
  });

  it('cuenta días de agosto, no el mes del lunes', () => {
    const early = weekBounds('2026-07-27').days.filter(isAugustCivilDate);
    const late = weekBounds('2026-08-31').days.filter(isAugustCivilDate);
    assert.deepEqual(early, ['2026-08-01', '2026-08-02']);
    assert.deepEqual(late, ['2026-08-31']);
  });
});

describe('mapper de horas previstas', () => {
  const week = '2026-07-27' as CivilDate;

  it('7 filas válidas', () => {
    const byDay = distribution(week, MAMADOU);
    const rows = Object.entries(byDay).map(([day, expected_hours]) => ({
      week_start: week,
      day,
      expected_hours,
    }));
    const interpreted = interpretExpectedHoursRows(week, rows);
    assert.equal(interpreted.status, 'configured');
    if (interpreted.status === 'configured') {
      assert.equal(interpreted.byDay['2026-07-27'], 8);
      assert.equal(interpreted.byDay['2026-08-01'], 0);
    }
  });

  it('0 filas = sin configurar', () => {
    assert.deepEqual(interpretExpectedHoursRows(week, []), { status: 'unconfigured' });
    assert.equal(expectedHoursLookupFromRows([])(week), null);
  });

  it('1 a 6 filas es error y no se mezcla con el legado', () => {
    assert.throws(
      () =>
        interpretExpectedHoursRows(week, [
          { week_start: week, day: '2026-07-27', expected_hours: 8 },
        ]),
      (error: unknown) => error instanceof ExpectedHoursError && error.code === 'incomplete',
    );
  });

  it('día fuera de la semana, horas negativas y duplicado', () => {
    assert.throws(
      () =>
        interpretExpectedHoursRows(week, [
          ...weekBounds(week).days.map((day) => ({
            week_start: week,
            day,
            expected_hours: 0,
          })),
          { week_start: week, day: '2026-08-10', expected_hours: 8 },
        ]),
      (error: unknown) => error instanceof ExpectedHoursError && error.code === 'day_outside_week',
    );
    assert.throws(
      () =>
        interpretExpectedHoursRows(week, [
          ...weekBounds(week).days.map((day) => ({
            week_start: week,
            day,
            expected_hours: day === '2026-07-27' ? -1 : 0,
          })),
        ]),
      (error: unknown) => error instanceof ExpectedHoursError && error.code === 'invalid_hours',
    );
    const days = weekBounds(week).days;
    assert.throws(
      () =>
        interpretExpectedHoursRows(week, [
          ...days.map((day) => ({ week_start: week, day, expected_hours: 0 })),
          { week_start: week, day: days[0]!, expected_hours: 8 },
        ]),
      (error: unknown) => error instanceof ExpectedHoursError && error.code === 'duplicate_day',
    );
  });

  it('una semana normal ignora filas accidentales', () => {
    const lookup = expectedHoursLookupFromRows([
      { week_start: '2026-09-07', day: '2026-09-07', expected_hours: 8 },
    ]);
    assert.equal(lookup('2026-09-07'), null);
  });
});

describe('Mamadou y Silvia en las fronteras de 2026', () => {
  it('Mamadou 27 jul: 40 previstas, 0 exentas, deuda 40, balance −8, extras 0', () => {
    const week = '2026-07-27' as CivilDate;
    const expected = distribution(week, MAMADOU);
    const summary = summarizeClosureHours(weekBounds(week).days, expected);
    assert.deepEqual(summary, {
      expectedTotal: 40,
      closureExemptHours: 0,
      requiredHours: 40,
    });
    const employee = staff(40);
    assert.equal(debtOf(employee, week, expected), 40);
    const result = liquidateWeek({
      employee,
      weekStart: week,
      logs: worked('2026-07-27', 32),
      isPaid: false,
      carryIn: 0,
      expectedHoursByDay: expected,
    });
    assert.equal(result.contractedHoursEffective, 40);
    assert.equal(result.weeklyBalance, -8);
    assert.equal(result.overtimeHours, 0);
    assert.equal(result.closureObligationSource, 'weekly_expected_hours');
  });

  it('el viernes sin fichaje no baja la obligación', () => {
    const week = '2026-07-27' as CivilDate;
    const expected = distribution(week, MAMADOU);
    assert.equal(expected['2026-07-31'], 8);
    const result = liquidateWeek({
      employee: staff(40),
      weekStart: week,
      logs: worked('2026-07-27', 32),
      isPaid: false,
      carryIn: 0,
      expectedHoursByDay: expected,
    });
    assert.equal(debtOf(staff(40), week, expected), 40);
    assert.equal(result.weeklyBalance, -8);
  });

  it('Silvia 27 jul: 16 previstas, 16 exentas, exigible 0, balance 0, umbral de extras intacto', () => {
    const week = '2026-07-27' as CivilDate;
    const expected = distribution(week, SILVIA);
    const summary = summarizeClosureHours(weekBounds(week).days, expected);
    assert.deepEqual(summary, {
      expectedTotal: 16,
      closureExemptHours: 16,
      requiredHours: 0,
    });
    const employee = staff(16);
    assert.equal(debtOf(employee, week, expected), 0);
    const idle = liquidateWeek({
      employee,
      weekStart: week,
      logs: [],
      isPaid: false,
      carryIn: 0,
      expectedHoursByDay: expected,
    });
    assert.equal(idle.contractedHoursEffective, 16);
    assert.equal(idle.weeklyBalance, 0);
    assert.equal(idle.overtimeHours, 0);

    const above = liquidateWeek({
      employee,
      weekStart: week,
      logs: worked('2026-07-27', 20),
      isPaid: false,
      carryIn: 0,
      expectedHoursByDay: expected,
    });
    assert.equal(above.overtimeHours, 4);
    assert.equal(above.weeklyBalance, 4);
  });

  it('Mamadou 31 ago: 8 exentas, exigible 32, umbral de extras 40', () => {
    const week = '2026-08-31' as CivilDate;
    const expected = distribution(week, MAMADOU);
    const summary = summarizeClosureHours(weekBounds(week).days, expected);
    assert.deepEqual(summary, {
      expectedTotal: 40,
      closureExemptHours: 8,
      requiredHours: 32,
    });
    const employee = staff(40);
    assert.equal(debtOf(employee, week, expected), 32);
    const atRequired = liquidateWeek({
      employee,
      weekStart: week,
      logs: worked('2026-09-01', 32),
      isPaid: false,
      carryIn: 0,
      expectedHoursByDay: expected,
    });
    assert.equal(atRequired.weeklyBalance, 0);
    assert.equal(atRequired.overtimeHours, 0);
    assert.equal(atRequired.contractedHoursEffective, 40);
  });

  it('Silvia 31 ago: el lunes cerrado vale 0, exigible 16', () => {
    const week = '2026-08-31' as CivilDate;
    const expected = distribution(week, SILVIA);
    const summary = summarizeClosureHours(weekBounds(week).days, expected);
    assert.deepEqual(summary, {
      expectedTotal: 16,
      closureExemptHours: 0,
      requiredHours: 16,
    });
    const employee = staff(16);
    assert.equal(debtOf(employee, week, expected), 16);
    const idle = liquidateWeek({
      employee,
      weekStart: week,
      logs: [],
      isPaid: false,
      carryIn: 0,
      expectedHoursByDay: expected,
    });
    assert.equal(idle.weeklyBalance, -16);
    assert.equal(idle.overtimeHours, 0);
  });
});

describe('fuera de la distribución explícita', () => {
  it('semana normal ignora la tabla y conserva el consumo sin fichajes', () => {
    const week = '2026-09-07' as CivilDate;
    const expected = distribution(week, MAMADOU);
    const employee = staff(40);
    const withMap = liquidateWeek({
      employee,
      weekStart: week,
      logs: [],
      isPaid: false,
      carryIn: 0,
      expectedHoursByDay: expected,
    });
    const without = liquidateWeek({
      employee,
      weekStart: week,
      logs: [],
      isPaid: false,
      carryIn: 0,
    });
    assert.equal(withMap.closureObligationSource, 'not_boundary');
    assert.equal(withMap.weeklyBalance, -40);
    assert.equal(withMap.weeklyBalance, without.weeklyBalance);
    assert.equal(withMap.overtimeHours, without.overtimeHours);
    assert.equal(debtOf(employee, week, expected), 40);
  });

  it('semana completa de agosto no necesita la tabla', () => {
    const week = '2026-08-03' as CivilDate;
    const result = liquidateWeek({
      employee: staff(40),
      weekStart: week,
      logs: [],
      isPaid: false,
      carryIn: 0,
    });
    assert.equal(result.closureObligationSource, 'not_boundary');
    assert.equal(debtOf(staff(40), week, null), 0);
    assert.equal(result.weeklyBalance, 0);
    assert.equal(result.contractedHoursEffective, 40);
  });

  it('frontera sin filas mantiene el prorrateo civil y lo marca como legado', () => {
    const week = '2026-07-27' as CivilDate;
    const contract = resolveEffectiveContract(staff(40), week, null);
    assert.equal(contract.closureObligationSource, 'legacy_unconfigured');
    assert.equal(debtOf(staff(40), week, null), 28.5);
    const result = liquidateWeek({
      employee: staff(40),
      weekStart: week,
      logs: [],
      isPaid: false,
      carryIn: 0,
    });
    assert.equal(result.closureObligationSource, 'legacy_unconfigured');
    assert.equal(result.weeklyBalance, -28.5);
  });

  it('el arrastre posterior ve la distribución de julio', () => {
    const july = '2026-07-27' as CivilDate;
    const employee = staff(40, july);
    const expected = distribution(july, MAMADOU);
    const opening = resolveOpeningCarryIn({
      employee,
      chainStart: '2026-08-31',
      logs: worked('2026-07-27', 32),
      isPaidByWeek: () => false,
      expectedHoursByWeek: (week) => (week === july ? expected : null),
    });
    const legacy = resolveOpeningCarryIn({
      employee,
      chainStart: '2026-08-31',
      logs: worked('2026-07-27', 32),
      isPaidByWeek: () => false,
    });
    assert.equal(opening, -8);
    assert.equal(legacy, 0);
  });

  it('alta a mitad de frontera: no crea obligación en los días previos al tramo', () => {
    const week = '2026-07-27' as CivilDate;
    const employee = staff(40, '2026-07-29');
    const expected = distribution(week, MAMADOU);
    assert.equal(debtOf(employee, week, expected), 24);
    const contract = resolveEffectiveContract(employee, week, expected);
    const pre = contract.segments.find((segment) => segment.kind === 'pre_alta');
    assert.equal(pre?.debtContractedHours, 0);
  });
});

describe('persistencia y permisos', () => {
  it('guardar y editar conserva 7 filas y el cero', () => {
    const week = '2026-07-27' as CivilDate;
    const first = distribution(week, MAMADOU);
    const rows = expectedHoursUpsertPayload('user-1', week, first, 'editor-1');
    assert.equal(rows.length, 7);
    assert.equal(rows.find((row) => row.day === '2026-08-01')?.expected_hours, 0);
    const edited = { ...first, '2026-07-31': 4 };
    const again = expectedHoursUpsertPayload('user-1', week, edited, 'editor-1');
    assert.equal(again.length, 7);
    assert.equal(again.find((row) => row.day === '2026-08-01')?.expected_hours, 0);
    assert.equal(again.find((row) => row.day === '2026-07-31')?.expected_hours, 4);
  });

  it('no deja guardar una semana que no es frontera', () => {
    assert.throws(
      () => assertSavableExpectedWeek('2026-09-07', []),
      (error: unknown) => error instanceof ExpectedHoursError && error.code === 'not_partial_week',
    );
  });

  it('staff no guarda; manager y master sí', () => {
    const access = readFileSync('src/lib/staff/attendance-access.ts', 'utf8');
    assert.match(access, /new Set\(\['manager', 'admin'\]\)/);
    assert.match(access, /isMasterDashboardUser\(email\)/);
    const managerRoles = new Set(['manager', 'admin']);
    const canManage = (role: string, email: string) =>
      isMasterDashboardUser(email) || managerRoles.has(role);
    assert.equal(canManage('staff', 'persona@marbella.test'), false);
    assert.equal(canManage('supervisor', 'persona@marbella.test'), false);
    assert.equal(canManage('manager', 'persona@marbella.test'), true);
    assert.equal(canManage('admin', 'persona@marbella.test'), true);
    assert.equal(canManage('staff', 'hhector7722@gmail.com'), true);
    const action = readFileSync('src/app/actions/weekly-expected-hours.ts', 'utf8');
    assert.match(action, /canManageStaffAttendance/);
  });
});

describe('editor de /staff/history', () => {
  it('semana normal: no hay bloque', () => {
    assert.equal(
      buildAugustClosureEditorModel({
        weekStart: '2026-09-07',
        weeklyContractHours: 40,
        persisted: 'unconfigured',
        draft: [null, null, null, null, null, null, null],
      }),
      null,
    );
  });

  it('semana completa de agosto: no hay bloque', () => {
    assert.equal(
      buildAugustClosureEditorModel({
        weekStart: '2026-08-03',
        weeklyContractHours: 40,
        persisted: 'unconfigured',
        draft: [null, null, null, null, null, null, null],
      }),
      null,
    );
  });

  it('frontera sin config: pendiente, inputs vacíos y jornada de referencia', () => {
    const model = buildAugustClosureEditorModel({
      weekStart: '2026-07-27',
      weeklyContractHours: 40,
      persisted: 'unconfigured',
      draft: [null, null, null, null, null, null, null],
    });
    assert.ok(model);
    assert.equal(model!.pendingLabel, 'Distribución pendiente');
    assert.equal(model!.weeklyContractLabel, 'Jornada prevista de referencia: 40 h');
    assert.equal(model!.preview, null);
    assert.equal(model!.canSave, false);
    assert.deepEqual(
      model!.days.map((day) => day.hours),
      [null, null, null, null, null, null, null],
    );
  });

  it('configurada: 7 valores, cierre en agosto y preview', () => {
    const model = buildAugustClosureEditorModel({
      weekStart: '2026-07-27',
      weeklyContractHours: 16,
      persisted: 'configured',
      draft: [...SILVIA],
    });
    assert.ok(model);
    assert.equal(model!.pendingLabel, null);
    assert.deepEqual(
      model!.days.map((day) => day.hours),
      [...SILVIA],
    );
    assert.deepEqual(
      model!.days.map((day) => day.closureLabel),
      [null, null, null, null, null, 'Cierre empresa', 'Cierre empresa'],
    );
    assert.equal(model!.preview?.expectedLabel, 'Total previsto');
    assert.equal(model!.preview?.exemptLabel, 'Exento por cierre');
    assert.equal(model!.preview?.requiredLabel, 'Horas exigibles');
    assert.equal(model!.preview?.expectedTotal, 16);
    assert.equal(model!.preview?.closureExemptHours, 16);
    assert.equal(model!.preview?.requiredHours, 0);
    assert.equal(model!.preview?.referenceHours, 16);
    assert.equal(model!.error, null);
    assert.equal(model!.canSave, true);
  });

  it('permite dejar vacíos los días sin horas y los interpreta como cero', () => {
    const model = buildAugustClosureEditorModel({
      weekStart: '2026-07-27',
      weeklyContractHours: 40,
      persisted: 'unconfigured',
      draft: [8, 8, 8, 8, 8, null, null],
    });
    assert.ok(model);
    assert.equal(model!.preview?.expectedTotal, 40);
    assert.equal(model!.canSave, true);
  });

  it('rechaza si el total no es la jornada de referencia', () => {
    const model = buildAugustClosureEditorModel({
      weekStart: '2026-07-27',
      weeklyContractHours: 40,
      persisted: 'configured',
      draft: [8, 8, 8, 8, 0, 0, 0],
    });
    assert.equal(model!.error, 'El total previsto debe sumar 40 h para esta semana.');
    assert.equal(model!.preview?.expectedTotal, 32);
    assert.equal(model!.preview?.referenceHours, 40);
    assert.equal(model!.canSave, false);
  });
});

describe('total previsto contra la jornada de referencia', () => {
  const week = '2026-07-27' as CivilDate;

  it('A. referencia 40 y total 40: acepta', () => {
    const byDay = distribution(week, MAMADOU);
    const reference = weeklyContractReferenceHours(staff(40), week);
    assert.equal(reference, 40);
    const summary = assertExpectedHoursMatchReference(week, byDay, reference);
    assert.equal(summary.expectedTotal, 40);
    assert.equal(summary.requiredHours, 40);
  });

  it('B. referencia 40 y total 32: rechaza', () => {
    const byDay = distribution(week, [8, 8, 8, 8, 0, 0, 0]);
    assert.throws(
      () => assertExpectedHoursMatchReference(week, byDay, 40),
      (error: unknown) =>
        error instanceof ExpectedHoursError &&
        error.code === 'reference_mismatch' &&
        error.message === 'El total previsto debe sumar 40 h para esta semana.',
    );
  });

  it('C. referencia 16 y total 16: acepta', () => {
    const byDay = distribution(week, SILVIA);
    const summary = assertExpectedHoursMatchReference(week, byDay, 16);
    assert.equal(summary.expectedTotal, 16);
    assert.equal(summary.requiredHours, 0);
  });

  it('D. cliente manipulado con total incorrecto: el servidor rechaza', () => {
    const manipulated = distribution(week, [8, 8, 8, 8, 0, 0, 0]);
    assert.throws(
      () => assertExpectedHoursMatchReference(week, manipulated, 40),
      (error: unknown) =>
        error instanceof ExpectedHoursError && error.code === 'reference_mismatch',
    );
    const action = readFileSync('src/app/actions/weekly-expected-hours.ts', 'utf8');
    assert.match(action, /assertExpectedHoursMatchContract/);
    assert.match(action, /loadEmployeeBoundaryFacts/);
  });

  it('E. alta parcial: no exige indebidamente 40', () => {
    const employee = staff(40, '2026-07-29');
    const reference = weeklyContractReferenceHours(employee, week);
    assert.notEqual(reference, 40);
    assert.equal(reference, 28.5);
    assert.throws(
      () => assertExpectedHoursMatchReference(week, distribution(week, MAMADOU), reference),
      (error: unknown) =>
        error instanceof ExpectedHoursError && error.code === 'reference_mismatch',
    );
  });

  it('F. baja parcial: referencia proporcional de los días activos', () => {
    const ended = staff(40, '2020-01-06');
    ended.terms[0]!.effectiveTo = '2026-07-29';
    const reference = weeklyContractReferenceHours(ended, week);
    assert.equal(reference, 17);
    assert.throws(
      () => assertExpectedHoursMatchReference(week, distribution(week, MAMADOU), reference),
      (error: unknown) =>
        error instanceof ExpectedHoursError && error.code === 'reference_mismatch',
    );
    assert.doesNotThrow(() =>
      assertExpectedHoursMatchReference(
        week,
        distribution(week, [8, 8, 1, 0, 0, 0, 0]),
        reference,
      ),
    );
  });

  it('G. gap contractual: las horas del gap no crean obligación', () => {
    const gap: EmployeeBoundaryFacts = {
      employeeId: 'emp',
      joiningDate: '2020-01-06',
      endDate: null,
      terms: [
        {
          effectiveFrom: '2020-01-06',
          effectiveTo: '2026-07-28',
          weeklyHours: 40,
          bagMode: false,
          regime: 'staff',
          overtimeRatePerHour: 10,
        },
        {
          effectiveFrom: '2026-07-31',
          effectiveTo: null,
          weeklyHours: 40,
          bagMode: false,
          regime: 'staff',
          overtimeRatePerHour: 10,
        },
      ],
    };
    const withGapHours = distribution(week, [8, 8, 8, 8, 8, 8, 8]);
    const withoutGapHours = distribution(week, [8, 8, 0, 0, 8, 8, 8]);
    assert.equal(debtOf(gap, week, withGapHours), 24);
    assert.equal(debtOf(gap, week, withoutGapHours), 24);
  });

  it('H. cambio de jornada dentro de la semana: referencia por tramos', () => {
    const changed: EmployeeBoundaryFacts = {
      employeeId: 'emp',
      joiningDate: '2020-01-06',
      endDate: null,
      terms: [
        {
          effectiveFrom: '2020-01-06',
          effectiveTo: '2026-07-29',
          weeklyHours: 40,
          bagMode: false,
          regime: 'staff',
          overtimeRatePerHour: 10,
        },
        {
          effectiveFrom: '2026-07-30',
          effectiveTo: null,
          weeklyHours: 20,
          bagMode: false,
          regime: 'staff',
          overtimeRatePerHour: 10,
        },
      ],
    };
    const reference = weeklyContractReferenceHours(changed, week);
    assert.equal(reference, 28.5);
    assert.doesNotThrow(() =>
      assertExpectedHoursMatchReference(
        week,
        distribution(week, [8, 8, 1, 5, 5, 1.5, 0]),
        reference,
      ),
    );
  });

  it('I. semana no frontera: no se puede guardar distribución', () => {
    assert.throws(
      () => assertSavableExpectedWeek('2026-09-07', []),
      (error: unknown) =>
        error instanceof ExpectedHoursError && error.code === 'not_partial_week',
    );
  });

  it('semana completa activa: 40 horas válidas aceptadas por la función compartida', () => {
    const result = assertExpectedHoursMatchContract(
      staff(40),
      week,
      distribution(week, MAMADOU),
    );
    assert.equal(result.referenceHours, 40);
    assert.equal(result.summary.expectedTotal, 40);
  });

  it('gap con horas previstas: rechaza aunque el total global cuadre', () => {
    const employee: EmployeeBoundaryFacts = {
      employeeId: 'emp',
      joiningDate: '2020-01-06',
      endDate: null,
      terms: [
        { effectiveFrom: '2020-01-06', effectiveTo: '2026-07-28', weeklyHours: 40, bagMode: false, regime: 'staff' },
        { effectiveFrom: '2026-07-31', effectiveTo: null, weeklyHours: 40, bagMode: false, regime: 'staff' },
      ],
    };
    assert.throws(
      () => assertExpectedHoursMatchContract(employee, week, distribution(week, [0, 0, 14.5, 14, 0, 0, 0])),
      (error: unknown) => error instanceof ExpectedHoursError && error.code === 'inactive_day',
    );
  });

  it('gap con cero y suma activa correcta: acepta', () => {
    const employee: EmployeeBoundaryFacts = {
      employeeId: 'emp',
      joiningDate: '2020-01-06',
      endDate: null,
      terms: [
        { effectiveFrom: '2020-01-06', effectiveTo: '2026-07-28', weeklyHours: 40, bagMode: false, regime: 'staff' },
        { effectiveFrom: '2026-07-31', effectiveTo: null, weeklyHours: 40, bagMode: false, regime: 'staff' },
      ],
    };
    const result = assertExpectedHoursMatchContract(employee, week, distribution(week, [8, 3.5, 0, 0, 8, 8, 1]));
    assert.equal(result.referenceHours, 28.5);
  });

  it('pre-alta con horas previstas: rechaza', () => {
    const employee = staff(40, '2026-07-29');
    assert.throws(
      () => assertExpectedHoursMatchContract(employee, week, distribution(week, [8, 0, 8, 8, 8, 4.5, 0])),
      (error: unknown) => error instanceof ExpectedHoursError && error.code === 'inactive_day',
    );
  });

  it('post-baja con horas previstas: rechaza', () => {
    const employee = staff(40);
    employee.terms[0]!.effectiveTo = '2026-07-29';
    assert.throws(
      () => assertExpectedHoursMatchContract(employee, week, distribution(week, [8, 8, 1, 8, 0, 0, 0])),
      (error: unknown) => error instanceof ExpectedHoursError && error.code === 'inactive_day',
    );
  });

  it('sin tramo staff efectivo: rechaza la distribución', () => {
    const employee = staff(0);
    employee.terms[0]!.regime = 'fixed';
    assert.throws(
      () => expectedHoursContractReference(employee, week),
      (error: unknown) => error instanceof ExpectedHoursError && error.code === 'no_staff_contract',
    );
  });

  it('cambio de régimen: solo los días staff pueden llevar horas', () => {
    const employee: EmployeeBoundaryFacts = {
      employeeId: 'emp',
      joiningDate: '2020-01-06',
      endDate: null,
      terms: [
        { effectiveFrom: '2020-01-06', effectiveTo: '2026-07-29', weeklyHours: 40, bagMode: false, regime: 'staff' },
        { effectiveFrom: '2026-07-30', effectiveTo: null, weeklyHours: 0, bagMode: false, regime: 'fixed' },
      ],
    };
    const result = assertExpectedHoursMatchContract(employee, week, distribution(week, [8, 8, 1, 0, 0, 0, 0]));
    assert.equal(result.referenceHours, 17);
  });

  it('Writer valida antes de liquidar y escribir snapshots', () => {
    const writer = readFileSync('src/lib/hours-engine/projection/write-weekly-projection.ts', 'utf8');
    const validation = writer.indexOf('assertExpectedHoursMatchContract(employee, weekStart, expectedHoursByDay)');
    const liquidation = writer.indexOf('const liquidation = liquidateWeek', validation);
    const snapshotWrite = writer.indexOf("from('weekly_snapshots')", liquidation);
    assert.ok(validation >= 0);
    assert.ok(liquidation > validation);
    assert.ok(snapshotWrite > liquidation);
  });
});

describe('la obligación no sale de turnos ni de fichajes', () => {
  it('el motor y la acción no leen shifts ni fn_recalc', () => {
    const files = [
      'src/lib/hours-engine/expected-hours.ts',
      'src/lib/hours-engine/contract-resolver.ts',
      'src/lib/hours-engine/liquidation-engine.ts',
      'src/app/actions/weekly-expected-hours.ts',
      'src/components/staff/AugustClosureDistribution.tsx',
      'src/app/staff/history/WeekCard.tsx',
    ];
    for (const file of files) {
      const body = readFileSync(file, 'utf8');
      assert.doesNotMatch(body, /contractWorkdays/);
      assert.doesNotMatch(body, /from\('shifts'\)/);
      assert.doesNotMatch(body, /fn_recalc/);
    }
    const action = readFileSync('src/app/actions/weekly-expected-hours.ts', 'utf8');
    assert.match(action, /canManageStaffAttendance/);
    assert.match(action, /writeProjectionFromWeek/);
    assert.match(action, /assertSavableExpectedWeek/);
    const card = readFileSync('src/app/staff/history/WeekCard.tsx', 'utf8');
    assert.match(card, /AugustClosureDistribution/);
    assert.match(card, /isPartialAugustClosureWeek/);
  });
});
