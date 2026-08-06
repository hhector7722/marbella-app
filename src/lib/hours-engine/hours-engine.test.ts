import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeCarry } from './carry-engine.ts';
import { resolveEffectiveContract } from './contract-resolver.ts';
import { liquidateWeek } from './liquidation-engine.ts';
import { roundMarbellaHours } from './marbella-round.ts';
import type { EmployeeBoundaryFacts, LiquidationInput } from './types.ts';

/** Contrato efectivo = Σ roundMarbella(días/7 × jornada) por tramo. */
function expectedContract(parts: readonly [days: number, weekly: number][]): number {
  return parts.reduce((acc, [d, w]) => acc + roundMarbellaHours((d / 7) * w), 0);
}

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

function input(partial: Partial<LiquidationInput> & Pick<LiquidationInput, 'weekStart'>): LiquidationInput {
  return {
    employee: employeeBase(),
    logs: [],
    isPaid: false,
    carryIn: 0,
    ...partial,
  };
}

describe('Contract Resolver', () => {
  it('prorratea mid-week por días/7', () => {
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
    // Lunes 2 marzo 2026
    const resolved = resolveEffectiveContract(emp, '2026-03-02');
    // 2-3 (2 días) ×16/7 + 4-8 (5 días) ×40/7 → redondeo Marbella por tramo
    const expected = expectedContract([
      [2, 16],
      [5, 40],
    ]);
    assert.equal(resolved.segments.length, 2);
    assert.equal(resolved.contractedHoursEffective, expected);
  });

  it('incluye post-baja como gap cuando el tramo finaliza', () => {
    const emp = employeeBase({
      joiningDate: '2026-03-04',
      endDate: '2026-03-06', // Ya no importa
      terms: [
        {
          effectiveFrom: '2026-03-04',
          effectiveTo: '2026-03-06',
          weeklyHours: 40,
          bagMode: true,
          regime: 'staff',
        },
      ],
    });
    const resolved = resolveEffectiveContract(emp, '2026-03-02');
    // pre_alta: 2-3; term: 4-6; gap: 7-8
    assert.equal(resolved.segments.length, 3);
    assert.equal(resolved.segments[0]!.kind, 'pre_alta');
    assert.deepEqual([...resolved.segments[0]!.days], ['2026-03-02', '2026-03-03']);
    assert.equal(resolved.segments[1]!.kind, 'term');
    assert.deepEqual(resolved.segments[1]!.days, ['2026-03-04', '2026-03-05', '2026-03-06']);
    assert.equal(resolved.segments[2]!.kind, 'gap');
    assert.deepEqual(resolved.segments[2]!.days, ['2026-03-07', '2026-03-08']);
    assert.equal(resolved.contractedHoursEffective, expectedContract([[3, 40]]));
  });
});

describe('Carry Engine', () => {
  it('deuda arrastra siempre; crédito pago no; crédito bolsa sí', () => {
    const a = computeCarry({
      carryIn: 0,
      parts: [
        { weeklyBalancePart: 5, bagMode: true },
        { weeklyBalancePart: 3, bagMode: false },
      ],
      isPaid: false,
    });
    assert.equal(a.weeklyBalance, 8);
    assert.equal(a.balanceFinal, 8);
    assert.equal(a.carryOut, 5);

    const b = computeCarry({
      carryIn: -4,
      parts: [{ weeklyBalancePart: 10, bagMode: false }],
      isPaid: false,
    });
    assert.equal(b.balanceFinal, 6);
    assert.equal(b.carryOut, 0);

    const c = computeCarry({
      carryIn: 2,
      parts: [{ weeklyBalancePart: -5, bagMode: true }],
      isPaid: false,
    });
    assert.equal(c.balanceFinal, -3);
    assert.equal(c.carryOut, -3);
  });

  it('Pagada sella crédito residual', () => {
    const r = computeCarry({
      carryIn: 0,
      parts: [{ weeklyBalancePart: 8, bagMode: true }],
      isPaid: true,
    });
    assert.equal(r.balanceFinal, 8);
    assert.equal(r.carryOut, 0);
  });
});

describe('Liquidation Engine', () => {
  it('semana sin fichajes → consume contrato (−jornada)', () => {
    const r = liquidateWeek(
      input({
        weekStart: '2026-03-02',
        carryIn: -3,
        logs: [],
      }),
    );
    assert.equal(r.hoursWorked, 0);
    assert.equal(r.weeklyBalance, -40);
    assert.equal(r.balanceFinal, -43);
    assert.equal(r.carryOut, -43);
  });

  it('semana sin fichajes con crédito positivo → resta del banco', () => {
    const r = liquidateWeek(
      input({
        weekStart: '2026-03-02',
        carryIn: 83.7, // se normaliza a 83.5 (Marbella)
        logs: [],
      }),
    );
    assert.equal(r.hoursWorked, 0);
    assert.equal(r.weeklyBalance, -40);
    assert.equal(r.carryIn, 83.5);
    assert.equal(r.balanceFinal, 43.5);
    assert.equal(r.carryOut, 43.5); // bolsa: crédito restante arrastra
  });

  it('staff: balance = horas − contrato efectivo', () => {
    const r = liquidateWeek(
      input({
        weekStart: '2026-03-02',
        logs: [
          { clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 50 },
        ],
      }),
    );
    assert.equal(r.hoursWorked, 50);
    assert.equal(r.contractedHoursEffective, 40);
    assert.equal(r.weeklyBalance, 10);
    assert.equal(r.balanceFinal, 10);
    assert.equal(r.carryOut, 10); // bolsa
  });

  it('pre-alta: horas no consumen contrato; contrato = días desde alta /7', () => {
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
          { clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 10 }, // pre-alta
          { clockInIso: '2026-03-04T08:00:00.000Z', totalHours: 30 },
        ],
      }),
    );
    const contract = expectedContract([[5, 40]]);
    assert.equal(r.contractedHoursEffective, contract);
    // pre_alta +10; staff 30 − contract (días 4–8)
    const expectedWeekly = 10 + (30 - contract);
    assert.ok(Math.abs(r.weeklyBalance - expectedWeekly) < 1e-9);
    
    // Verificamos el segmento inyectado
    const preAltaSeg = r.segments.find(s => s.kind === 'pre_alta');
    assert.ok(preAltaSeg);
    assert.equal(preAltaSeg.hoursWorked, 10);
  });

  it('gap: horas huérfanas posteriores al primer contrato son gap y se calculan igual que pre_alta', () => {
    const emp = employeeBase({
      joiningDate: '2026-01-01',
      terms: [
        {
          effectiveFrom: '2026-01-01',
          effectiveTo: '2026-03-01',
          weeklyHours: 40,
          bagMode: true,
          regime: 'staff',
        },
        // Hueco los días 2 y 3
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
        weekStart: '2026-03-02', // El 2 y 3 caen en gap
        logs: [
          { clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 10 }, // gap
          { clockInIso: '2026-03-04T08:00:00.000Z', totalHours: 30 },
        ],
      }),
    );
    const contract = expectedContract([[5, 40]]);
    assert.equal(r.contractedHoursEffective, contract);
    // gap +10; staff 30 − contract (días 4–8)
    const expectedWeekly = 10 + (30 - contract);
    assert.ok(Math.abs(r.weeklyBalance - expectedWeekly) < 1e-9);

    // No debe haber pre_alta, debe ser gap
    assert.equal(r.segments.find(s => s.kind === 'pre_alta'), undefined);
    
    const gapSeg = r.segments.find(s => s.kind === 'gap');
    assert.ok(gapSeg);
    assert.equal(gapSeg.hoursWorked, 10);
  });

  it('agosto: aplica reglas estándar de contrato (no genera automáticamente extras)', () => {
    // Lunes 3 agosto 2026: contrato 40h, trabajadas 50h -> 40 ord, 10 ext, balance = 10
    const r = liquidateWeek(
      input({
        weekStart: '2026-08-03',
        logs: [{ clockInIso: '2026-08-03T08:00:00.000Z', totalHours: 50 }],
      }),
    );
    assert.equal(r.contractedHoursEffective, 40);
    assert.equal(r.ordinaryHours, 40);
    assert.equal(r.overtimeHours, 10);
    assert.equal(r.weeklyBalance, 10);
  });

  it('manager: sin tope staff', () => {
    const emp = employeeBase({
      terms: [
        {
          effectiveFrom: '2026-01-01',
          effectiveTo: null,
          weeklyHours: 40,
          bagMode: false,
          regime: 'manager',
        },
      ],
    });
    const r = liquidateWeek(
      input({
        employee: emp,
        weekStart: '2026-03-02',
        logs: [{ clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 12 }],
      }),
    );
    assert.equal(r.weeklyBalance, 12);
    assert.equal(r.carryOut, 0); // pago
  });

  it('composición bolsa/pago por tramo mid-week', () => {
    const emp = employeeBase({
      terms: [
        {
          effectiveFrom: '2026-03-01',
          effectiveTo: '2026-03-03',
          weeklyHours: 40,
          bagMode: true,
          regime: 'staff',
        },
        {
          effectiveFrom: '2026-03-04',
          effectiveTo: null,
          weeklyHours: 40,
          bagMode: false,
          regime: 'staff',
        },
      ],
    });
    // 2-3: 2/7*40 contract, hours 10 → bal = 10 - 80/7
    // 4-8: 5/7*40, hours 20 → bal = 20 - 200/7
    const r = liquidateWeek(
      input({
        employee: emp,
        weekStart: '2026-03-02',
        logs: [
          { clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 10 },
          { clockInIso: '2026-03-04T08:00:00.000Z', totalHours: 20 },
        ],
      }),
    );
    assert.equal(r.segments.length, 2);
    assert.equal(r.segments[0]!.bagMode, true);
    assert.equal(r.segments[1]!.bagMode, false);
    const bagPart = r.segments[0]!.weeklyBalancePart;
    const payPart = r.segments[1]!.weeklyBalancePart;
    assert.ok(Math.abs(r.weeklyBalance - (bagPart + payPart)) < 1e-9);
    // carry: waterfall — bag credit stays, pay credit extracted
    const carry = computeCarry({
      carryIn: 0,
      parts: [
        { weeklyBalancePart: bagPart, bagMode: true },
        { weeklyBalancePart: payPart, bagMode: false },
      ],
      isPaid: false,
    });
    assert.equal(r.carryOut, carry.carryOut);
  });

  it('determinismo e idempotencia', () => {
    const payload = input({
      weekStart: '2026-03-02',
      carryIn: 1.5,
      logs: [
        { clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 42 },
        { clockInIso: '2026-03-05T08:00:00.000Z', totalHours: 8 },
      ],
    });
    const a = liquidateWeek(payload);
    const b = liquidateWeek(payload);
    assert.deepEqual(a, b);
    assert.deepEqual(liquidateWeek(payload), a);
  });
});

describe('Nueva Política Funcional — Eliminación Régimen Agosto (Invariantes INV-R01 a INV-R06)', () => {
  it('Caso 1: Contrato 40h, trabajadas 40.5h en semana julio/agosto -> 40 ordinarias, 0.5 extras', () => {
    const r = liquidateWeek(
      input({
        weekStart: '2026-07-27',
        logs: [{ clockInIso: '2026-07-27T08:00:00.000Z', totalHours: 40.5 }],
      }),
    );
    assert.equal(r.contractedHoursEffective, 40);
    assert.equal(r.hoursWorked, 40.5);
    assert.equal(r.ordinaryHours, 40);
    assert.equal(r.overtimeHours, 0.5);
  });

  it('Caso 2: Mismo contrato (40h) y mismas horas (40.5h) en distintos años produce resultado idéntico', () => {
    const r2026 = liquidateWeek(
      input({
        weekStart: '2026-07-27',
        logs: [{ clockInIso: '2026-07-27T08:00:00.000Z', totalHours: 40.5 }],
      }),
    );
    const r2029 = liquidateWeek(
      input({
        weekStart: '2029-07-30',
        logs: [{ clockInIso: '2029-07-30T08:00:00.000Z', totalHours: 40.5 }],
      }),
    );
    const r2033 = liquidateWeek(
      input({
        weekStart: '2033-08-01',
        logs: [{ clockInIso: '2033-08-01T08:00:00.000Z', totalHours: 40.5 }],
      }),
    );

    assert.equal(r2026.ordinaryHours, 40);
    assert.equal(r2026.overtimeHours, 0.5);
    assert.equal(r2029.ordinaryHours, 40);
    assert.equal(r2029.overtimeHours, 0.5);
    assert.equal(r2033.ordinaryHours, 40);
    assert.equal(r2033.overtimeHours, 0.5);
  });

  it('Caso 3: Alta a mitad de semana mantiene el prorrateo contractual', () => {
    const emp = employeeBase({
      joiningDate: '2026-07-29',
      terms: [
        {
          effectiveFrom: '2026-07-29',
          effectiveTo: null,
          weeklyHours: 40,
          bagMode: false,
          regime: 'staff',
        },
      ],
    });
    const r = liquidateWeek(
      input({
        employee: emp,
        weekStart: '2026-07-27',
        logs: [{ clockInIso: '2026-07-29T08:00:00.000Z', totalHours: 30 }],
      }),
    );
    // 5 días / 7 * 40h = 28.5714... -> redondeado Marbella (enteros/medias) = 28.5h
    const expectedContract = 28.5;
    assert.equal(r.contractedHoursEffective, expectedContract);
    assert.equal(r.ordinaryHours, expectedContract);
    assert.equal(r.overtimeHours, 1.5);
  });

  it('Caso 4: Cambio de contrato a mitad de semana mantiene el prorrateo contractual', () => {
    const emp = employeeBase({
      terms: [
        {
          effectiveFrom: '2026-01-01',
          effectiveTo: '2026-07-28',
          weeklyHours: 16,
          bagMode: false,
          regime: 'staff',
        },
        {
          effectiveFrom: '2026-07-29',
          effectiveTo: null,
          weeklyHours: 40,
          bagMode: false,
          regime: 'staff',
        },
      ],
    });
    const r = liquidateWeek(
      input({
        employee: emp,
        weekStart: '2026-07-27',
        logs: [
          { clockInIso: '2026-07-27T08:00:00.000Z', totalHours: 5 },
          { clockInIso: '2026-07-29T08:00:00.000Z', totalHours: 30 },
        ],
      }),
    );
    // 2/7 * 16 (4.5h) + 5/7 * 40 (28.5h) = 33h
    const expectedContract = 33;
    assert.equal(r.contractedHoursEffective, expectedContract);
    assert.equal(r.ordinaryHours, expectedContract);
    assert.equal(r.overtimeHours, 2);
  });

  it('gap post-contrato: empleado ficha en fin de semana tras finalizar contrato', () => {
    // Escenario Bali: contrato finaliza el 28/06/2026. Ficha el 4 y 5 de julio.
    const emp = employeeBase({
      joiningDate: '2025-01-01',
      endDate: '2026-06-28',
      terms: [
        {
          effectiveFrom: '2025-01-01',
          effectiveTo: '2026-06-28',
          weeklyHours: 40,
          bagMode: false,
          regime: 'staff',
          overtimeRatePerHour: 15,
        },
      ],
    });
    const r = liquidateWeek(
      input({
        employee: emp,
        weekStart: '2026-06-29', // Semana del 29 junio al 5 julio
        logs: [
          { clockInIso: '2026-07-04T08:00:00.000Z', totalHours: 8 },
          { clockInIso: '2026-07-05T08:00:00.000Z', totalHours: 8 },
        ],
      }),
    );
    
    assert.equal(r.hoursWorked, 16);
    assert.equal(r.contractedHoursEffective, 0); // No hay contrato en la semana
    assert.equal(r.ordinaryHours, 0);
    assert.equal(r.overtimeHours, 16);
    
    // Verificamos que el segmento gap está presente y acumula las horas extra
    assert.equal(r.segments.length, 1);
    const gapSeg = r.segments[0]!;
    assert.equal(gapSeg.kind, 'gap');
    assert.equal(gapSeg.overtimeHours, 16);
    assert.equal(gapSeg.ordinaryHours, 0);
  });
});
