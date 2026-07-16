import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveEffectiveContract } from './contract-resolver.ts';
import { liquidateWeek } from './liquidation-engine.ts';
import {
  appendContractTerm,
  employeeFactsFromContractTerms,
  mapContractTermRows,
} from './ui-bridge.ts';
import type {
  ContractTermFact,
  EmployeeBoundaryFacts,
  LiquidationInput,
  TimeLogFact,
} from './types.ts';

const EPS = 1e-9;

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
    overtimeRatePerHour: opts.overtimeRatePerHour ?? null,
  };
}

function log(day: string, hours: number): TimeLogFact {
  return {
    clockInIso: `${day}T08:00:00.000Z`,
    totalHours: hours,
  };
}

function employee(terms: ContractTermFact[]): EmployeeBoundaryFacts {
  return {
    employeeId: 'emp-hist',
    joiningDate: '2026-01-01',
    endDate: null,
    terms,
  };
}

function liq(
  emp: EmployeeBoundaryFacts,
  weekStart: string,
  logs: TimeLogFact[],
  extras?: Partial<LiquidationInput>,
) {
  return liquidateWeek({
    employee: emp,
    weekStart,
    logs,
    isPaid: false,
    carryIn: 0,
    ...extras,
  });
}

describe('Contract terms versionados — histórico', () => {
  it('Caso 1: 16→40→28 — antes / mid-week / después', () => {
    const emp = employee([
      term('2026-01-01', '2026-03-03', 16), // hasta mié de la semana del cambio
      term('2026-03-04', '2026-03-15', 40),
      term('2026-03-16', null, 28),
    ]);

    // Semana antes del cambio (feb 23–mar 1): aún 16h
    const before = liq(emp, '2026-02-23', [
      log('2026-02-23', 8),
      log('2026-02-24', 8),
      log('2026-02-25', 8),
    ]);
    // 24 − 16 = 8 extras
    assert.ok(Math.abs(before.contractedHoursEffective - 16) < EPS);
    assert.equal(before.overtimeHours, 8);

    // Semana del cambio (lun 2 mar): 2 días×16/7 + 5×40/7
    const mid = resolveEffectiveContract(emp, '2026-03-02');
    const expectedMid = (2 / 7) * 16 + (5 / 7) * 40;
    assert.ok(Math.abs(mid.contractedHoursEffective - expectedMid) < EPS);

    // Semana después (23 mar): solo 28h
    const after = liq(emp, '2026-03-23', [
      log('2026-03-23', 8),
      log('2026-03-24', 8),
      log('2026-03-25', 8),
      log('2026-03-26', 8),
    ]);
    assert.ok(Math.abs(after.contractedHoursEffective - 28) < EPS);
    // 32 − 28 = 4
    assert.equal(after.overtimeHours, 4);
  });

  it('Caso 2: cambio de tarifa OT — resolver expone tarifa del tramo vigente', () => {
    const emp = employee([
      term('2026-01-01', '2026-03-01', 40, { overtimeRatePerHour: 10 }),
      term('2026-03-02', null, 40, { overtimeRatePerHour: 15 }),
    ]);
    const wBefore = resolveEffectiveContract(emp, '2026-02-23');
    assert.equal(wBefore.segments[0]!.overtimeRatePerHour, 10);

    const wAfter = resolveEffectiveContract(emp, '2026-03-02');
    assert.equal(wAfter.segments[0]!.overtimeRatePerHour, 15);

    // Liquidación de horas idéntica (tarifa no altera overtimeHours)
    const logs = [log('2026-03-02', 45)];
    const a = liq(
      employee([term('2026-01-01', null, 40, { overtimeRatePerHour: 10 })]),
      '2026-03-02',
      logs,
    );
    const b = liq(
      employee([term('2026-01-01', null, 40, { overtimeRatePerHour: 99 })]),
      '2026-03-02',
      logs,
    );
    assert.equal(a.overtimeHours, b.overtimeHours);
  });

  it('Caso 3: cambio de régimen staff → fixed', () => {
    const emp = employee([
      term('2026-01-01', '2026-03-01', 40, { regime: 'staff' }),
      term('2026-03-02', null, 40, { regime: 'fixed' }),
    ]);
    const staffWeek = liq(emp, '2026-02-23', [log('2026-02-23', 10)]);
    assert.equal(staffWeek.overtimeHours, 0); // 10 < 40

    const fixedWeek = liq(emp, '2026-03-02', [log('2026-03-02', 10)]);
    assert.equal(fixedWeek.overtimeHours, 10); // fixed = todo extra
  });

  it('Caso 4: cambio bolsa ↔ pago — extras iguales; carry distinto', () => {
    const logs = [
      log('2026-03-02', 8),
      log('2026-03-03', 8),
      log('2026-03-04', 8),
      log('2026-03-05', 8),
      log('2026-03-06', 10),
    ];
    const bag = liq(
      employee([term('2026-01-01', null, 40, { bagMode: true })]),
      '2026-03-02',
      logs,
    );
    const pay = liq(
      employee([term('2026-01-01', null, 40, { bagMode: false })]),
      '2026-03-02',
      logs,
    );
    assert.equal(bag.overtimeHours, pay.overtimeHours);
    assert.equal(bag.overtimeHours, 2);
    assert.equal(bag.carryOut, 2);
    assert.equal(pay.carryOut, 0);
  });

  it('Caso 5: cambio a salario fijo (regime fixed, jornada 0)', () => {
    const emp = employee([
      term('2026-01-01', '2026-03-01', 40, { regime: 'staff' }),
      term('2026-03-02', null, 0, { regime: 'fixed' }),
    ]);
    const after = liq(emp, '2026-03-02', [log('2026-03-02', 8), log('2026-03-03', 8)]);
    assert.equal(after.contractedHoursEffective, 0);
    assert.equal(after.overtimeHours, 16);
  });
});

describe('Inmutabilidad del pasado', () => {
  it('modificar tramo actual/futuro no cambia liquidación histórica', () => {
    const baseTerms = [
      term('2026-01-01', '2026-03-01', 16),
      term('2026-03-02', null, 40),
    ];
    const empBefore = employee(baseTerms);
    const histWeek = '2026-02-23';
    const histLogs = [log('2026-02-23', 10), log('2026-02-24', 10)];
    const histA = liq(empBefore, histWeek, histLogs);

    // Append: cierra 40 abierto y abre 28 desde junio (futuro)
    const termsAfter = appendContractTerm(baseTerms, term('2026-06-01', null, 28));
    const empAfter = employee(termsAfter);
    const histB = liq(empAfter, histWeek, histLogs);

    assert.deepEqual(
      {
        c: histA.contractedHoursEffective,
        ot: histA.overtimeHours,
        bal: histA.weeklyBalance,
        days: histA.dailyBreakdown.days.map((d) => d.overtimeHours),
      },
      {
        c: histB.contractedHoursEffective,
        ot: histB.overtimeHours,
        bal: histB.weeklyBalance,
        days: histB.dailyBreakdown.days.map((d) => d.overtimeHours),
      },
    );

    // Semana futura sí cambia
    const futureLogs = [log('2026-06-01', 30)];
    const futA = liq(empBefore, '2026-06-01', futureLogs);
    const futB = liq(empAfter, '2026-06-01', futureLogs);
    assert.notEqual(futA.contractedHoursEffective, futB.contractedHoursEffective);
  });

  it('modificar tramo antiguo SÍ afecta solo semanas bajo ese tramo', () => {
    const original = [
      term('2026-01-01', '2026-03-01', 16),
      term('2026-03-02', null, 40),
    ];
    const rewritten = [
      term('2026-01-01', '2026-03-01', 20), // antiguo cambiado 16→20
      term('2026-03-02', null, 40),
    ];
    const logs = [log('2026-02-23', 22)];
    const a = liq(employee(original), '2026-02-23', logs);
    const b = liq(employee(rewritten), '2026-02-23', logs);
    assert.notEqual(a.overtimeHours, b.overtimeHours);

    const laterLogs = [log('2026-03-09', 20)];
    const laterA = liq(employee(original), '2026-03-09', laterLogs);
    const laterB = liq(employee(rewritten), '2026-03-09', laterLogs);
    assert.equal(laterA.overtimeHours, laterB.overtimeHours);
    assert.equal(laterA.contractedHoursEffective, laterB.contractedHoursEffective);
  });

  it('semanas pagadas vs no pagadas: isPaid no altera extras ni contrato', () => {
    const emp = employee([term('2026-01-01', null, 40)]);
    const logs = [log('2026-03-02', 45)];
    const open = liq(emp, '2026-03-02', logs, { isPaid: false });
    const paid = liq(emp, '2026-03-02', logs, { isPaid: true });
    assert.equal(open.overtimeHours, paid.overtimeHours);
    assert.equal(open.contractedHoursEffective, paid.contractedHoursEffective);
    assert.notEqual(open.carryOut, paid.carryOut);
  });

  it('mapContractTermRows / employeeFactsFromContractTerms no usan perfil vivo', () => {
    const facts = employeeFactsFromContractTerms(
      { id: 'u1', joining_date: '2026-01-15', end_date: null },
      [
        {
          effective_from: '2026-01-15',
          effective_to: '2026-02-28',
          weekly_hours: 16,
          bag_mode: false,
          regime: 'staff',
          overtime_rate_per_hour: 12,
        },
        {
          effective_from: '2026-03-01',
          effective_to: null,
          weekly_hours: 40,
          bag_mode: true,
          regime: 'staff',
          overtime_rate_per_hour: 14,
        },
      ],
    );
    assert.equal(facts.terms.length, 2);
    assert.equal(facts.terms[0]!.weeklyHours, 16);
    assert.equal(facts.terms[1]!.weeklyHours, 40);
    assert.equal(facts.joiningDate, '2026-01-15');

    // Semana íntegra bajo el tramo 16h (lun 16–dom 22 feb)
    const feb = resolveEffectiveContract(facts, '2026-02-16');
    assert.ok(Math.abs(feb.contractedHoursEffective - 16) < EPS);
    const mar = resolveEffectiveContract(facts, '2026-03-02');
    assert.ok(Math.abs(mar.contractedHoursEffective - 40) < EPS);
  });

  it('tres contratos + cambio del vigente: solo semanas del tramo tocado', () => {
    const t0 = [
      term('2026-01-01', '2026-02-01', 16),
      term('2026-02-02', '2026-03-01', 40),
      term('2026-03-02', null, 28),
    ];
    // Cambiar solo el vigente 28→30 desde mar 2
    const t1 = [
      term('2026-01-01', '2026-02-01', 16),
      term('2026-02-02', '2026-03-01', 40),
      term('2026-03-02', null, 30),
    ];
    const wJan = '2026-01-05';
    const wFeb = '2026-02-09';
    const wMar = '2026-03-09';
    const logs = [log('2026-01-05', 20)];
    // same structure for each week - use week-appropriate log days
    assert.deepEqual(
      liq(employee(t0), wJan, [log('2026-01-05', 20)]).contractedHoursEffective,
      liq(employee(t1), wJan, [log('2026-01-05', 20)]).contractedHoursEffective,
    );
    assert.deepEqual(
      liq(employee(t0), wFeb, [log('2026-02-09', 20)]).contractedHoursEffective,
      liq(employee(t1), wFeb, [log('2026-02-09', 20)]).contractedHoursEffective,
    );
    assert.notEqual(
      liq(employee(t0), wMar, [log('2026-03-09', 20)]).contractedHoursEffective,
      liq(employee(t1), wMar, [log('2026-03-09', 20)]).contractedHoursEffective,
    );
  });
});

describe('Gate — puente no materializa desde perfil', () => {
  it('ui-bridge no materializa hechos desde perfil vivo', async () => {
    const fs = await import('node:fs/promises');
    const path = new URL('./ui-bridge.ts', import.meta.url);
    const body = await fs.readFile(path, 'utf8');
    assert.doesNotMatch(body, /employeeFactsFromProfile/);
    assert.doesNotMatch(body, /from\(['"]profiles['"]\)/);
    assert.match(body, /employeeFactsFromContractTerms/);
  });

  it('mapContractTermRows rechaza régimen inválido', () => {
    assert.throws(() =>
      mapContractTermRows([
        {
          effective_from: '2026-01-01',
          effective_to: null,
          weekly_hours: 40,
          bag_mode: true,
          regime: 'ceo',
        },
      ]),
    );
  });
});
