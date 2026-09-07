/**
 * Tests Fase 1 — Writer de proyección (mapeo, invariantes, idempotencia pura).
 * No conecta cron/fichajes (Fase 1b). No toca BD.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { liquidateWeek } from '../liquidation-engine.ts';
import { priceLiquidationOvertime } from '../week-card-from-liquidation.ts';
import type { EmployeeBoundaryFacts, LiquidationResult } from '../types.ts';
import {
  domainRowToInsertPayload,
  domainRowToUpdatePayload,
  mapEnginesToProjectionRow,
  projectionDomainEquals,
  roundMoneyCents,
} from './map-projection.ts';
import {
  validateProjectionBatch,
  validateWriterPreconditions,
  validateCarryInvariantsOnResult,
  validateLaborInvariantsOnResult,
  type ProjectionWeekCandidate,
} from './validate-projection.ts';
import { employeeTimelineStartWeek } from '../opening-carry.ts';
import type { CivilDate } from '../types.ts';
import {
  COST_ENGINE_VERSION,
  HOURS_ENGINE_VERSION,
  PROJECTION_CONTRACT_VERSION,
  buildProjectionMetadata,
} from './versions.ts';

function emp(overrides: Partial<EmployeeBoundaryFacts> = {}): EmployeeBoundaryFacts {
  return {
    employeeId: 'writer-emp',
    joiningDate: '2025-01-01',
    endDate: null,
    terms: [
      {
        effectiveFrom: '2025-01-01',
        effectiveTo: null,
        weeklyHours: 40,
        bagMode: false,
        regime: 'staff',
        overtimeRatePerHour: 10,
      },
    ],
    ...overrides,
  };
}

function candidateFromLiquidation(
  liquidation: LiquidationResult,
  estimatedValue: number | null,
): ProjectionWeekCandidate {
  return {
    liquidation,
    estimatedValue,
    overrides: {
      isPaid: liquidation.isPaid,
      preferStockHoursOverride: null,
      overtimePriceSnapshot: null,
    },
  };
}

describe('Projection Writer — versiones (metadata ≠ dominio)', () => {
  it('expone fingerprints de HE / Cost / contrato', () => {
    assert.equal(HOURS_ENGINE_VERSION, 'he-1.0.0');
    assert.equal(COST_ENGINE_VERSION, 'cost-1.0.0');
    assert.equal(PROJECTION_CONTRACT_VERSION, 'projection-contract-v1');
  });

  it('buildProjectionMetadata no inventa dominio', () => {
    const m = buildProjectionMetadata('writer', new Date('2026-07-27T12:00:00.000Z'));
    assert.equal(m.processKind, 'writer');
    assert.equal(m.hoursEngineVersion, HOURS_ENGINE_VERSION);
    assert.equal(m.costEngineVersion, COST_ENGINE_VERSION);
    assert.equal(m.projectionContractVersion, PROJECTION_CONTRACT_VERSION);
    assert.equal(m.generatedAtIso, '2026-07-27T12:00:00.000Z');
  });
});

describe('Projection Writer — mapeo PROJECTION CONTRACT v1', () => {
  it('mapea HE + Cost → columnas C sin reinterpretar', () => {
    const employee = emp();
    const liquidation = liquidateWeek({
      employee,
      weekStart: '2026-03-02',
      logs: [{ clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 45 }],
      isPaid: false,
      carryIn: -2,
    });
    const pricing = priceLiquidationOvertime(liquidation, employee);
    const row = mapEnginesToProjectionRow(liquidation, pricing.estimatedValue);

    assert.equal(row.user_id, 'writer-emp');
    assert.equal(row.week_start, '2026-03-02');
    assert.equal(row.week_end, liquidation.weekEnd);
    assert.equal(row.pending_balance, liquidation.carryIn);
    assert.equal(row.balance_hours, liquidation.weeklyBalance);
    assert.equal(row.final_balance, liquidation.balanceFinal);
    assert.equal(row.total_hours, liquidation.hoursWorked);
    assert.equal(row.ordinary_hours, liquidation.ordinaryHours);
    assert.equal(row.extra_hours, liquidation.overtimeHours);
    assert.equal(row.contracted_hours_snapshot, liquidation.contractedHoursEffective);
    assert.equal(row.total_cost, roundMoneyCents(pricing.estimatedValue!));
  });

  it('UPDATE payload no incluye columnas B (overrides)', () => {
    const row = mapEnginesToProjectionRow(
      liquidateWeek({
        employee: emp(),
        weekStart: '2026-03-02',
        logs: [],
        isPaid: false,
        carryIn: 0,
      }),
      0,
    );
    const upd = domainRowToUpdatePayload(row);
    assert.equal('is_paid' in upd, false);
    assert.equal('prefer_stock_hours_override' in upd, false);
    assert.equal('overtime_price_snapshot' in upd, false);
    assert.ok('pending_balance' in upd);
    assert.ok('total_cost' in upd);
  });

  it('INSERT payload no incluye columnas B', () => {
    const row = mapEnginesToProjectionRow(
      liquidateWeek({
        employee: emp(),
        weekStart: '2026-03-02',
        logs: [],
        isPaid: true,
        carryIn: 0,
      }),
      12.345,
    );
    const ins = domainRowToInsertPayload(row);
    assert.equal('is_paid' in ins, false);
    assert.equal(ins.total_cost, 12.35);
  });
});

describe('Projection Writer — validación de invariantes', () => {
  it('INV-C01: falla sin timelineStart', () => {
    const r = validateWriterPreconditions({
      employee: emp(),
      timelineStart: null,
    });
    assert.ok(r);
    assert.equal(r!.ok, false);
    if (r && !r.ok) assert.equal(r.code, 'INV-C01');
  });

  it('INV-C01: falla si openingCarryAtTimelineStart ≠ 0', () => {
    const r = validateWriterPreconditions({
      employee: emp(),
      timelineStart: '2024-12-30',
      openingCarryAtTimelineStart: 3,
    });
    assert.ok(r);
    assert.equal(r!.ok, false);
    if (r && !r.ok) assert.equal(r.code, 'INV-C01');
  });

  it('INV-C01: falla si la semana timelineStart tiene carryIn ≠ 0', () => {
    const employee = emp();
    const timelineStart = employeeTimelineStartWeek(employee)!;
    const liq = liquidateWeek({
      employee,
      weekStart: timelineStart,
      logs: [],
      isPaid: false,
      carryIn: -5,
    });
    const r = validateProjectionBatch([candidateFromLiquidation(liq, 0)], {
      timelineStart,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, 'INV-C01');
  });

  it('INV-C01: acepta carryIn=0 en timelineStart', () => {
    const employee = emp();
    const timelineStart = employeeTimelineStartWeek(employee)!;
    const pre = validateWriterPreconditions({
      employee,
      timelineStart,
      openingCarryAtTimelineStart: 0,
    });
    assert.equal(pre, null);
    const liq = liquidateWeek({
      employee,
      weekStart: timelineStart,
      logs: [],
      isPaid: false,
      carryIn: 0,
    });
    const r = validateProjectionBatch([candidateFromLiquidation(liq, 0)], {
      timelineStart,
    });
    assert.equal(r.ok, true);
  });

  it('INV-C02: falla si carryOut(W) ≠ carryIn(W+1)', () => {
    const employee = emp();
    const w1 = liquidateWeek({
      employee,
      weekStart: '2026-03-02',
      logs: [{ clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 45 }],
      isPaid: false,
      carryIn: 0,
    });
    const w2 = liquidateWeek({
      employee,
      weekStart: '2026-03-09',
      logs: [],
      isPaid: false,
      carryIn: 999, // roto a propósito
    });
    const r = validateProjectionBatch([
      candidateFromLiquidation(w1, 0),
      candidateFromLiquidation(w2, 0),
    ]);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, 'INV-C02');
  });

  it('INV-C03: falla si balanceFinal ≠ R(carryIn+weeklyBalance)', () => {
    const employee = emp();
    const liq = liquidateWeek({
      employee,
      weekStart: '2026-03-02',
      logs: [{ clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 45 }],
      isPaid: false,
      carryIn: 0,
    });
    const broken = { ...liq, balanceFinal: liq.balanceFinal + 10 };
    const r = validateCarryInvariantsOnResult(broken, null);
    assert.ok(r);
    assert.equal(r!.code, 'INV-C03');
  });

  it('INV-C04: falla en mixto si carryOut ≠ oráculo (C05–C09 no aplican)', () => {
    const crafted: LiquidationResult = {
      employeeId: 'writer-emp',
      weekStart: '2026-03-02',
      weekEnd: '2026-03-08',
      hoursWorked: 10,
      contractedHoursEffective: 5,
      weeklyBalance: 5,
      carryIn: 0,
      balanceFinal: 5,
      carryOut: 5, // incorrecto: mixto debería dejar solo crédito bolsa
      isPaid: false,
      ordinaryHours: 5,
      overtimeHours: 5,
      segments: [
        {
          days: ['2026-03-02'],
          hoursWorked: 5,
          contractedHours: 2.5,
          bagMode: true,
          regimeApplied: 'staff',
          weeklyBalancePart: 3,
          ordinaryHours: 2.5,
          overtimeHours: 2.5,
          kind: 'term',
        },
        {
          days: ['2026-03-03'],
          hoursWorked: 5,
          contractedHours: 2.5,
          bagMode: false,
          regimeApplied: 'staff',
          weeklyBalancePart: 2,
          ordinaryHours: 2.5,
          overtimeHours: 2.5,
          kind: 'term',
        },
      ],
      dailyBreakdown: {
        days: [],
        ordinaryHoursTotal: 5,
        overtimeHoursTotal: 5,
      },
    };
    const r = validateCarryInvariantsOnResult(crafted, null);
    assert.ok(r);
    assert.equal(r!.code, 'INV-C04');
  });

  it('INV-C05: falla si deuda no pagada y carryOut ≠ balanceFinal', () => {
    const employee = emp({
      terms: [
        {
          effectiveFrom: '2025-01-01',
          effectiveTo: null,
          weeklyHours: 40,
          bagMode: true,
          regime: 'staff',
          overtimeRatePerHour: 10,
        },
      ],
    });
    const liq = liquidateWeek({
      employee,
      weekStart: '2026-03-02',
      logs: [],
      isPaid: false,
      carryIn: 0,
    });
    assert.ok(liq.balanceFinal < 0);
    const broken = { ...liq, carryOut: 0 };
    const r = validateCarryInvariantsOnResult(broken, null);
    assert.ok(r);
    assert.equal(r!.code, 'INV-C05');
  });

  it('INV-C06: falla si isPaid y carryOut ≠ min(0,balanceFinal)', () => {
    const employee = emp();
    const liq = liquidateWeek({
      employee,
      weekStart: '2026-03-02',
      logs: [{ clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 45 }],
      isPaid: true,
      carryIn: 0,
    });
    assert.equal(liq.carryOut, 0);
    const broken = { ...liq, carryOut: 5 };
    const r = validateCarryInvariantsOnResult(broken, null);
    assert.ok(r);
    assert.equal(r!.code, 'INV-C06');
  });

  it('INV-C07: pago puro con crédito ⇒ carryOut=0 (resultado válido)', () => {
    const employee = emp(); // bagMode false
    const liq = liquidateWeek({
      employee,
      weekStart: '2026-03-02',
      logs: [{ clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 45 }],
      isPaid: false,
      carryIn: 0,
    });
    assert.ok(liq.balanceFinal > 0);
    assert.equal(liq.carryOut, 0);
    assert.equal(validateCarryInvariantsOnResult(liq, null), null);
  });

  it('INV-C07: falla si pago puro deja crédito en carryOut', () => {
    const employee = emp();
    const liq = liquidateWeek({
      employee,
      weekStart: '2026-03-02',
      logs: [{ clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 45 }],
      isPaid: false,
      carryIn: 0,
    });
    const broken = { ...liq, carryOut: liq.balanceFinal };
    const r = validateCarryInvariantsOnResult(broken, null);
    assert.ok(r);
    assert.equal(r!.code, 'INV-C07');
  });

  it('INV-C08: bolsa pura con crédito ⇒ carryOut=balanceFinal', () => {
    const employee = emp({
      terms: [
        {
          effectiveFrom: '2025-01-01',
          effectiveTo: null,
          weeklyHours: 40,
          bagMode: true,
          regime: 'staff',
          overtimeRatePerHour: 10,
        },
      ],
    });
    const liq = liquidateWeek({
      employee,
      weekStart: '2026-03-02',
      logs: [{ clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 45 }],
      isPaid: false,
      carryIn: 0,
    });
    assert.ok(liq.balanceFinal > 0);
    assert.equal(liq.carryOut, liq.balanceFinal);
    assert.equal(validateCarryInvariantsOnResult(liq, null), null);
  });

  it('INV-C08: falla si bolsa pura no arrastra el crédito', () => {
    const employee = emp({
      terms: [
        {
          effectiveFrom: '2025-01-01',
          effectiveTo: null,
          weeklyHours: 40,
          bagMode: true,
          regime: 'staff',
        },
      ],
    });
    const liq = liquidateWeek({
      employee,
      weekStart: '2026-03-02',
      logs: [{ clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 45 }],
      isPaid: false,
      carryIn: 0,
    });
    const broken = { ...liq, carryOut: 0 };
    const r = validateCarryInvariantsOnResult(broken, null);
    assert.ok(r);
    assert.equal(r!.code, 'INV-C08');
  });

  it('INV-C09: falla si balanceFinal≤0 y carryOut>0', () => {
    const broken: LiquidationResult = {
      employeeId: 'writer-emp',
      weekStart: '2026-03-02',
      weekEnd: '2026-03-08',
      hoursWorked: 0,
      contractedHoursEffective: 40,
      weeklyBalance: 0,
      carryIn: 0,
      balanceFinal: 0,
      carryOut: 1,
      isPaid: false,
      ordinaryHours: 0,
      overtimeHours: 0,
      segments: [],
      dailyBreakdown: { days: [], ordinaryHoursTotal: 0, overtimeHoursTotal: 0 },
    };
    // C05: carryOut(1)≠balanceFinal(0) dispara primero; C09 es la semántica de deuda.
    const r = validateCarryInvariantsOnResult(broken, null);
    assert.ok(r);
    assert.ok(r!.code === 'INV-C05' || r!.code === 'INV-C09');
  });

  it('INV-C05 (saldo de fin): semana que contiene la baja sella carryOut=0 aunque la bolsa sea positiva', () => {
    const employee = emp({
      endDate: '2026-06-28',
      terms: [
        {
          effectiveFrom: '2025-01-01',
          effectiveTo: '2026-06-28',
          weeklyHours: 40,
          bagMode: true,
          regime: 'staff',
          overtimeRatePerHour: 10,
        },
      ],
    });
    const liq = liquidateWeek({
      employee,
      weekStart: '2026-06-22', // semana 22–28 jun (baja el domingo)
      logs: [{ clockInIso: '2026-06-22T08:00:00.000Z', totalHours: 45 }],
      isPaid: false,
      carryIn: 0,
    });
    assert.ok(liq.balanceFinal > 0);
    assert.equal(liq.settledAtContractEnd, true);
    assert.equal(liq.carryOut, 0);
    // C08 (bolsa ⇒ arrastre) queda sustituido por el saldo de fin.
    assert.equal(validateCarryInvariantsOnResult(liq, null), null);
  });

  it('INV-C05 (saldo de fin): falla si la semana sellada arrastra saldo', () => {
    const employee = emp({
      endDate: '2026-06-28',
      terms: [
        {
          effectiveFrom: '2025-01-01',
          effectiveTo: '2026-06-28',
          weeklyHours: 40,
          bagMode: true,
          regime: 'staff',
          overtimeRatePerHour: 10,
        },
      ],
    });
    const liq = liquidateWeek({
      employee,
      weekStart: '2026-06-22',
      logs: [{ clockInIso: '2026-06-22T08:00:00.000Z', totalHours: 45 }],
      isPaid: false,
      carryIn: 0,
    });
    const broken = { ...liq, carryOut: liq.balanceFinal }; // sin sellar
    const r = validateCarryInvariantsOnResult(broken, null);
    assert.ok(r);
    assert.equal(r!.code, 'INV-C05');
  });

  it('INV-L01: falla si hoursWorked ≠ Σ daily.hours', () => {
    const liq = liquidateWeek({
      employee: emp(),
      weekStart: '2026-03-02',
      logs: [{ clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 45 }],
      isPaid: false,
      carryIn: 0,
    });
    const broken = { ...liq, hoursWorked: 99 };
    const r = validateLaborInvariantsOnResult(broken);
    assert.ok(r);
    assert.equal(r!.code, 'INV-L01');
  });

  it('INV-L02: falla si weeklyBalance ≠ Σ weeklyBalancePart', () => {
    const liq = liquidateWeek({
      employee: emp(),
      weekStart: '2026-03-02',
      logs: [{ clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 45 }],
      isPaid: false,
      carryIn: 0,
    });
    const broken = { ...liq, weeklyBalance: 999 };
    const r = validateLaborInvariantsOnResult(broken);
    assert.ok(r);
    assert.equal(r!.code, 'INV-L02');
  });

  it('INV-L03: falla si ordinary semanal ≠ Σ segmentos', () => {
    const liq = liquidateWeek({
      employee: emp(),
      weekStart: '2026-03-02',
      logs: [{ clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 45 }],
      isPaid: false,
      carryIn: 0,
    });
    const broken = { ...liq, ordinaryHours: liq.ordinaryHours + 3 };
    const r = validateLaborInvariantsOnResult(broken);
    assert.ok(r);
    assert.equal(r!.code, 'INV-L03');
  });

  it('INV-L04: falla si pre_alta o gap aportan ordinaria', () => {
    for (const kind of ['pre_alta', 'gap'] as const) {
      const crafted: LiquidationResult = {
        employeeId: 'writer-emp',
        weekStart: '2026-03-02',
        weekEnd: '2026-03-08',
        hoursWorked: 8,
        contractedHoursEffective: 0,
        weeklyBalance: 8,
        carryIn: 0,
        balanceFinal: 8,
        carryOut: 0,
        isPaid: false,
        ordinaryHours: 5,
        overtimeHours: 3,
        segments: [
          {
            days: ['2026-03-02'],
            hoursWorked: 8,
            contractedHours: 5,
            bagMode: false,
            regimeApplied: kind,
            weeklyBalancePart: 8,
            ordinaryHours: 5,
            overtimeHours: 3,
            kind: kind,
          },
        ],
        dailyBreakdown: {
          days: [
            {
              day: '2026-03-02',
              hours: 8,
              ordinaryHours: 5,
              overtimeHours: 3,
            },
          ],
          ordinaryHoursTotal: 5,
          overtimeHoursTotal: 3,
        },
      };
      const r = validateLaborInvariantsOnResult(crafted);
      assert.ok(r);
      assert.equal(r!.code, 'INV-L04');
    }
  });

  it('INV-P04 / INV-$01: falla si carryOut < 0 y estimatedValue > 0', () => {
    const employee = emp({
      terms: [
        {
          effectiveFrom: '2025-01-01',
          effectiveTo: null,
          weeklyHours: 40,
          bagMode: true,
          regime: 'staff',
          overtimeRatePerHour: 10,
        },
      ],
    });
    const liq = liquidateWeek({
      employee,
      weekStart: '2026-03-02',
      logs: [],
      isPaid: false,
      carryIn: 0,
    });
    assert.ok(liq.carryOut < 0);
    const r = validateProjectionBatch([candidateFromLiquidation(liq, 50)]);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, 'INV-P04');
  });

  it('cadena válida produce filas mapeadas (C+L verdes)', () => {
    const employee = emp();
    const w1 = liquidateWeek({
      employee,
      weekStart: '2026-03-02',
      logs: [{ clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 45 }],
      isPaid: false,
      carryIn: 0,
    });
    const p1 = priceLiquidationOvertime(w1, employee);
    const w2 = liquidateWeek({
      employee,
      weekStart: '2026-03-09',
      logs: [],
      isPaid: false,
      carryIn: w1.carryOut,
    });
    const p2 = priceLiquidationOvertime(w2, employee);
    const r = validateProjectionBatch(
      [
        candidateFromLiquidation(w1, p1.estimatedValue),
        candidateFromLiquidation(w2, p2.estimatedValue),
      ],
      { timelineStart: '2024-12-30' as CivilDate },
    );
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.rows.length, 2);
      assert.equal(r.rows[0]!.pending_balance, w1.carryIn);
      assert.equal(r.rows[1]!.pending_balance, w1.carryOut);
      assert.equal(r.rows[1]!.pending_balance, w2.carryIn);
    }
  });
});

describe('Projection Writer — semana mixta julio/agosto (numeric(10,2))', () => {
  /** Simula numeric(10,2): redondeo de PostgreSQL al persistir. */
  function roundDb(v: number): number {
    return Math.round(v * 100) / 100;
  }

  it('read-back tolera el redondeo numeric(10,2) de ordinary/extra (regresión 2026-07-27)', () => {
    // Alta a mitad de semana (29-julio): 5 días activos = 5/7×40 = 28.571428…
    const employee = {
      ...emp(),
      joiningDate: '2026-07-29',
      terms: [
        {
          effectiveFrom: '2026-07-29',
          effectiveTo: null,
          weeklyHours: 40,
          bagMode: false,
          regime: 'staff' as const,
          overtimeRatePerHour: 12,
        },
      ],
    };
    const logs = [
      { clockInIso: '2026-07-29T08:00:00.000Z', totalHours: 8.5 },
      { clockInIso: '2026-07-30T08:00:00.000Z', totalHours: 8 },
      { clockInIso: '2026-07-31T08:00:00.000Z', totalHours: 8 },
      { clockInIso: '2026-08-01T08:00:00.000Z', totalHours: 8 },
    ];
    const liquidation = liquidateWeek({
      employee,
      weekStart: '2026-07-27',
      logs,
      isPaid: false,
      carryIn: 0,
    });

    // Alta mid-week (5 días / 7 × 40 = 28.571428… -> 28.5h redondeo Marbella).
    assert.equal(liquidation.ordinaryHours, 28.5);
    assert.equal(liquidation.overtimeHours, 4);

    const row = mapEnginesToProjectionRow(
      liquidation,
      priceLiquidationOvertime(liquidation, employee).estimatedValue,
    );

    // Payload persistido (dominio sin tocar) vs fila leída de BD tras numeric(10,2).
    const persisted = {
      ...row,
      ordinary_hours: roundDb(row.ordinary_hours),
      extra_hours: roundDb(row.extra_hours),
    };

    assert.equal(persisted.ordinary_hours, 28.5);
    assert.equal(persisted.extra_hours, 4);

    // Con hoursEps=1e-9 (antiguo) esto divergía; con la tolerancia numeric(10,2)
    // de 0.005 el read-back es coherente con el tipo SQL.
    assert.ok(projectionDomainEquals(row, persisted));

    // Todos los campos respetan el contrato del payload (delta ≤ 0.005).
    const pairs: [number, number][] = [
      [row.total_hours, persisted.total_hours],
      [row.ordinary_hours, persisted.ordinary_hours],
      [row.extra_hours, persisted.extra_hours],
      [row.pending_balance, persisted.pending_balance],
      [row.balance_hours, persisted.balance_hours],
      [row.final_balance, persisted.final_balance],
      [row.contracted_hours_snapshot, persisted.contracted_hours_snapshot],
      [row.total_cost, persisted.total_cost],
    ];
    for (const [x, y] of pairs) {
      assert.ok(Math.abs(x - y) <= 0.005, `${x} vs ${y}`);
    }
  });

  it('proyección de dominio intacta para semana mixta (no se altera el motor)', () => {
    const employee = emp();
    const liquidation = liquidateWeek({
      employee,
      weekStart: '2026-07-27',
      logs: [{ clockInIso: '2026-07-27T08:00:00.000Z', totalHours: 8.5 }],
      isPaid: false,
      carryIn: 0,
    });
    const row = mapEnginesToProjectionRow(
      liquidation,
      priceLiquidationOvertime(liquidation, employee).estimatedValue,
    );
    assert.equal(row.ordinary_hours, liquidation.ordinaryHours);
    assert.equal(row.extra_hours, liquidation.overtimeHours);
    assert.equal(row.total_hours, liquidation.hoursWorked);
    assert.equal(row.contracted_hours_snapshot, liquidation.contractedHoursEffective);
  });
});

describe('Projection Writer — idempotencia de dominio', () => {
  it('mismo HE+Cost ⇒ mismo payload tras N mapeos', () => {
    const employee = emp();
    const liquidation = liquidateWeek({
      employee,
      weekStart: '2026-03-02',
      logs: [{ clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 48 }],
      isPaid: false,
      carryIn: 1.5,
    });
    const pricing = priceLiquidationOvertime(liquidation, employee);
    const a = mapEnginesToProjectionRow(liquidation, pricing.estimatedValue);
    const b = mapEnginesToProjectionRow(liquidation, pricing.estimatedValue);
    const c = mapEnginesToProjectionRow(
      liquidateWeek({
        employee,
        weekStart: '2026-03-02',
        logs: [{ clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 48 }],
        isPaid: false,
        carryIn: 1.5,
      }),
      priceLiquidationOvertime(
        liquidateWeek({
          employee,
          weekStart: '2026-03-02',
          logs: [{ clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 48 }],
          isPaid: false,
          carryIn: 1.5,
        }),
        employee,
      ).estimatedValue,
    );
    assert.ok(projectionDomainEquals(a, b));
    assert.ok(projectionDomainEquals(a, c));
  });
});
