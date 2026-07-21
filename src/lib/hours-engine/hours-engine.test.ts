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

  it('excluye post-baja y no crea tramo pre-alta sin días', () => {
    const emp = employeeBase({
      joiningDate: '2026-03-04',
      endDate: '2026-03-06',
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
    const resolved = resolveEffectiveContract(emp, '2026-03-02');
    // pre_alta: 2-3; term: 4-6 (baja inclusive); 7-8 post-baja fuera
    assert.equal(resolved.segments.length, 2);
    assert.equal(resolved.segments[0]!.kind, 'pre_alta');
    assert.deepEqual([...resolved.segments[0]!.days], ['2026-03-02', '2026-03-03']);
    assert.equal(resolved.segments[1]!.kind, 'term');
    assert.deepEqual([...resolved.segments[1]!.days], ['2026-03-04', '2026-03-05', '2026-03-06']);
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
        carryIn: 83.7,
        logs: [],
      }),
    );
    assert.equal(r.hoursWorked, 0);
    assert.equal(r.weeklyBalance, -40);
    assert.ok(Math.abs(r.balanceFinal - 43.7) < 1e-9);
    assert.ok(Math.abs(r.carryOut - 43.7) < 1e-9); // bolsa: crédito restante arrastra
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
  });

  it('agosto: balance = horas (sin restar contrato)', () => {
    // Lunes 3 agosto 2026
    const r = liquidateWeek(
      input({
        weekStart: '2026-08-03',
        logs: [{ clockInIso: '2026-08-03T08:00:00.000Z', totalHours: 50 }],
      }),
    );
    assert.equal(r.weeklyBalance, 50);
    assert.equal(r.contractedHoursEffective, 40);
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
