/**
 * Gate de aprobación Fase 1 — validación funcional del núcleo determinista.
 * Solo tests. No modifica el motor.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolveEffectiveContract } from './contract-resolver.ts';
import { liquidateWeek } from './liquidation-engine.ts';
import { roundMarbellaHours } from './marbella-round.ts';
import type {
  EmployeeBoundaryFacts,
  LiquidationInput,
  LiquidationResult,
} from './types.ts';

function expectedContract(parts: readonly [days: number, weekly: number][]): number {
  return parts.reduce((acc, [d, w]) => acc + roundMarbellaHours((d / 7) * w), 0);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENGINE_DIR = __dirname;

function emp(overrides: Partial<EmployeeBoundaryFacts> = {}): EmployeeBoundaryFacts {
  return {
    employeeId: 'gate-emp',
    joiningDate: '2025-01-01',
    endDate: null,
    terms: [
      {
        effectiveFrom: '2025-01-01',
        effectiveTo: null,
        weeklyHours: 40,
        bagMode: true,
        regime: 'staff',
      },
    ],
    ...overrides,
  };
}

function liq(
  partial: Partial<LiquidationInput> & Pick<LiquidationInput, 'weekStart'>,
): LiquidationInput {
  return {
    employee: emp(),
    logs: [],
    isPaid: false,
    carryIn: 0,
    ...partial,
  };
}

function assertClose(actual: number, expected: number, label: string) {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `${label}: expected ${expected}, got ${actual}`,
  );
}

function stableJson(value: unknown): string {
  return JSON.stringify(value);
}

function makeLogs(weekStart: string, hours: number) {
  return [{ clockInIso: `${weekStart}T08:00:00.000Z`, totalHours: hours }];
}

// ─── Validación 1 — Golden Tests ───────────────────────────────────────────

describe('Gate V1 — Golden Tests (especificación v1.0)', () => {
  it('GT-01 Semana normal staff — balance = horas − contrato efectivo', () => {
    const r = liquidateWeek(
      liq({
        weekStart: '2026-03-02',
        logs: [{ clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 45 }],
      }),
    );
    assert.equal(r.hoursWorked, 45);
    assert.equal(r.contractedHoursEffective, 40);
    assert.equal(r.weeklyBalance, 5);
    assert.equal(r.balanceFinal, 5);
    assert.equal(r.ordinaryHours, 40);
    assert.equal(r.overtimeHours, 5);
  });

  it('GT-02 Semana sin fichajes — consume contrato (resta pendientes)', () => {
    const r = liquidateWeek(
      liq({
        weekStart: '2026-03-02',
        carryIn: -2,
        logs: [],
      }),
    );
    assert.equal(r.hoursWorked, 0);
    assert.equal(r.contractedHoursEffective, 40);
    assert.equal(r.weeklyBalance, -40);
    assert.equal(r.balanceFinal, -42);
    assert.equal(r.carryOut, -42);
  });

  it('GT-03 Alta mid-week — pre-alta = extra; contrato = días desde alta /7 × jornada', () => {
    const employee = emp({
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
      liq({
        employee,
        weekStart: '2026-03-02',
        logs: [
          { clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 8 },
          { clockInIso: '2026-03-05T08:00:00.000Z', totalHours: 20 },
        ],
      }),
    );
    const contract = expectedContract([[5, 40]]);
    assertClose(r.contractedHoursEffective, contract, 'contrato');
    assertClose(r.weeklyBalance, 8 + (20 - contract), 'weekly');
  });

  it('GT-04 Baja mid-week — post-baja no computa; contrato solo días ≤ baja', () => {
    const employee = emp({
      endDate: '2026-03-04',
      terms: [
        {
          effectiveFrom: '2025-01-01',
          effectiveTo: '2026-03-04',
          weeklyHours: 40,
          bagMode: true,
          regime: 'staff',
        },
      ],
    });
    const r = liquidateWeek(
      liq({
        employee,
        weekStart: '2026-03-02',
        logs: [
          { clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 10 },
          { clockInIso: '2026-03-06T08:00:00.000Z', totalHours: 99 },
        ],
      }),
    );
    assert.equal(r.hoursWorked, 109);
    const contract = expectedContract([[3, 40]]);
    assertClose(r.contractedHoursEffective, contract, 'contrato baja');
    // 109 horas trabajadas: 10 en tramo + 99 en gap. 
    // Ordinarias: min(10, 17) = 10. Extras de tramo = 0. Extras de gap = 99. Total extras = 99.
    assertClose(r.ordinaryHours, 10, 'ordinarias baja');
    assertClose(r.overtimeHours, 99, 'extras baja');
  });

  it('GT-05 Contrato 16→40 (caso real Alba) — semana bajo 40 no usa 16', () => {
    const employee = emp({
      employeeId: 'alba-scenario',
      terms: [
        {
          effectiveFrom: '2025-01-01',
          effectiveTo: '2026-02-28',
          weeklyHours: 16,
          bagMode: true,
          regime: 'staff',
        },
        {
          effectiveFrom: '2026-03-01',
          effectiveTo: null,
          weeklyHours: 40,
          bagMode: true,
          regime: 'staff',
        },
      ],
    });
    // Semana 16–22 feb: enteramente bajo 16h
    const under16 = liquidateWeek(
      liq({
        employee,
        weekStart: '2026-02-16',
        logs: [{ clockInIso: '2026-02-16T08:00:00.000Z', totalHours: 20 }],
      }),
    );
    // Semana 2–8 mar: enteramente bajo 40h
    const under40 = liquidateWeek(
      liq({
        employee,
        weekStart: '2026-03-02',
        logs: [{ clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 20 }],
      }),
    );
    assert.equal(under16.contractedHoursEffective, 16);
    assert.equal(under16.weeklyBalance, 4);
    assert.equal(under40.contractedHoursEffective, 40);
    assert.equal(under40.weeklyBalance, -20);

    // Semana 23 feb–1 mar: cruza el cambio → composición /7 redondeada por tramo
    const crossing = resolveEffectiveContract(employee, '2026-02-23');
    assertClose(
      crossing.contractedHoursEffective,
      expectedContract([
        [6, 16],
        [1, 40],
      ]),
      'cruzada',
    );
  });

  it('GT-06 Contrato 40→16 — tramo nuevo; semana usa 16', () => {
    const employee = emp({
      terms: [
        {
          effectiveFrom: '2025-01-01',
          effectiveTo: '2026-03-01',
          weeklyHours: 40,
          bagMode: false,
          regime: 'staff',
        },
        {
          effectiveFrom: '2026-03-02',
          effectiveTo: null,
          weeklyHours: 16,
          bagMode: false,
          regime: 'staff',
        },
      ],
    });
    const r = liquidateWeek(
      liq({
        employee,
        weekStart: '2026-03-02',
        logs: [{ clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 20 }],
      }),
    );
    assert.equal(r.contractedHoursEffective, 16);
    assert.equal(r.weeklyBalance, 4);
  });

  it('GT-07 Cambio mid-week 16→40 — días_tramo/7 × jornada por tramo', () => {
    const employee = emp({
      terms: [
        {
          effectiveFrom: '2026-03-01',
          effectiveTo: '2026-03-03',
          weeklyHours: 16,
          bagMode: true,
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
    const expectedContractHours = expectedContract([
      [2, 16],
      [5, 40],
    ]);
    const resolved = resolveEffectiveContract(employee, '2026-03-02');
    assertClose(resolved.contractedHoursEffective, expectedContractHours, 'resolver');

    const r = liquidateWeek(
      liq({
        employee,
        weekStart: '2026-03-02',
        logs: [
          { clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 8 },
          { clockInIso: '2026-03-05T08:00:00.000Z', totalHours: 30 },
        ],
      }),
    );
    assertClose(r.contractedHoursEffective, expectedContractHours, 'liq contract');
    const c0 = roundMarbellaHours((2 / 7) * 16);
    const c1 = roundMarbellaHours((5 / 7) * 40);
    const bal0 = 8 - c0;
    const bal1 = 30 - c1;
    assertClose(r.weeklyBalance, bal0 + bal1, 'liq weekly');
  });

  it('GT-08 Bolsa — crédito positivo arrastra si bolsa ∧ no pagada', () => {
    const r = liquidateWeek(
      liq({
        weekStart: '2026-03-02',
        logs: [{ clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 48 }],
      }),
    );
    assert.equal(r.weeklyBalance, 8);
    assert.equal(r.carryOut, 8);
  });

  it('GT-09 Pago — crédito positivo en modo pago no arrastra', () => {
    const employee = emp({
      terms: [
        {
          effectiveFrom: '2025-01-01',
          effectiveTo: null,
          weeklyHours: 40,
          bagMode: false,
          regime: 'staff',
        },
      ],
    });
    const r = liquidateWeek(
      liq({
        employee,
        weekStart: '2026-03-02',
        logs: [{ clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 48 }],
      }),
    );
    assert.equal(r.weeklyBalance, 8);
    assert.equal(r.balanceFinal, 8);
    assert.equal(r.carryOut, 0);
  });

  it('GT-10 Crédito — balance_final > 0 bolsa → carryOut positivo', () => {
    const r = liquidateWeek(
      liq({
        weekStart: '2026-03-02',
        carryIn: 3,
        logs: [{ clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 42 }],
      }),
    );
    assert.equal(r.weeklyBalance, 2);
    assert.equal(r.balanceFinal, 5);
    assert.equal(r.carryOut, 5);
  });

  it('GT-11 Deuda — negativo arrastra siempre', () => {
    const employee = emp({
      terms: [
        {
          effectiveFrom: '2025-01-01',
          effectiveTo: null,
          weeklyHours: 40,
          bagMode: false,
          regime: 'staff',
        },
      ],
    });
    const r = liquidateWeek(
      liq({
        employee,
        weekStart: '2026-03-02',
        carryIn: -5,
        logs: [{ clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 30 }],
      }),
    );
    assert.equal(r.weeklyBalance, -10);
    assert.equal(r.balanceFinal, -15);
    assert.equal(r.carryOut, -15);
  });

  it('GT-12 Sin tarifa — N/A Fase 1: liquidación de horas no depende de tarifa', () => {
    const r = liquidateWeek(
      liq({
        weekStart: '2026-03-02',
        logs: [{ clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 45 }],
      }),
    );
    assert.equal('costOrdinary' in r, false);
    assert.equal('costOvertime' in r, false);
    assert.equal(r.weeklyBalance, 5);
  });

  it('GT-13 Semana pagada — Pagada sella crédito (carryOut no positivo)', () => {
    const r = liquidateWeek(
      liq({
        weekStart: '2026-03-02',
        isPaid: true,
        logs: [{ clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 48 }],
      }),
    );
    assert.equal(r.balanceFinal, 8);
    assert.equal(r.carryOut, 0);
  });

  it('GT-14 Semana reabierta — quitar Pagada restaura arrastre de crédito bolsa', () => {
    const base = liq({
      weekStart: '2026-03-02',
      logs: [{ clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 48 }],
    });
    const paid = liquidateWeek({ ...base, isPaid: true });
    const reopened = liquidateWeek({ ...base, isPaid: false });
    assert.equal(paid.carryOut, 0);
    assert.equal(reopened.carryOut, 8);
  });

  it('GT-15 Agosto — exceso de contrato genera extras; infraasistencia no genera deuda', () => {
    const over = liquidateWeek(
      liq({
        weekStart: '2026-08-03',
        logs: [{ clockInIso: '2026-08-03T08:00:00.000Z', totalHours: 50 }],
      }),
    );
    assert.equal(over.weeklyBalance, 10);
    assert.equal(over.ordinaryHours, 40);
    assert.equal(over.overtimeHours, 10);

    const under = liquidateWeek(
      liq({
        weekStart: '2026-08-03',
        logs: [{ clockInIso: '2026-08-03T08:00:00.000Z', totalHours: 10 }],
      }),
    );
    assert.equal(under.weeklyBalance, 0);
    assert.equal(under.ordinaryHours, 10);
    assert.equal(under.overtimeHours, 0);
    assert.equal(under.carryOut, 0);
  });

  it('GT-16 Fixed — régimen fijo sin tope staff', () => {
    const employee = emp({
      terms: [
        {
          effectiveFrom: '2025-01-01',
          effectiveTo: null,
          weeklyHours: 40,
          bagMode: true,
          regime: 'fixed',
        },
      ],
    });
    const r = liquidateWeek(
      liq({
        employee,
        weekStart: '2026-03-02',
        logs: [{ clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 12 }],
      }),
    );
    assert.equal(r.weeklyBalance, 12);
  });
});

// ─── Validación 2 — Determinismo ───────────────────────────────────────────

describe('Gate V2 — Determinismo (100 ejecuciones)', () => {
  it('mismos hechos → 100 LiquidationResult idénticos', () => {
    const payload = liq({
      weekStart: '2026-03-02',
      carryIn: 1.25,
      logs: [
        { clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 22 },
        { clockInIso: '2026-03-04T08:00:00.000Z', totalHours: 21.5 },
      ],
    });
    const first = liquidateWeek(payload);
    const firstJson = stableJson(first);
    for (let i = 0; i < 100; i++) {
      const next = liquidateWeek(payload);
      assert.equal(stableJson(next), firstJson, `divergencia en ejecución ${i + 1}`);
      assert.equal(next.hoursWorked, first.hoursWorked);
      assert.equal(next.weeklyBalance, first.weeklyBalance);
      assert.equal(next.balanceFinal, first.balanceFinal);
      assert.equal(next.carryOut, first.carryOut);
      assert.equal(next.ordinaryHours, first.ordinaryHours);
      assert.equal(next.overtimeHours, first.overtimeHours);
    }
    assert.equal('totalCost' in first, false);
  });
});

// ─── Validación 3 — Idempotencia ───────────────────────────────────────────

describe('Gate V3 — Idempotencia', () => {
  it('liquidar → persistir → liquidar → persistir: idéntico', () => {
    const payload = liq({
      weekStart: '2026-03-02',
      carryIn: -4,
      logs: [{ clockInIso: '2026-03-02T08:00:00.000Z', totalHours: 44 }],
    });
    const store: { current: LiquidationResult | null } = { current: null };

    const a = liquidateWeek(payload);
    store.current = structuredClone(a);

    const b = liquidateWeek(payload);
    const secondPersist = structuredClone(b);

    assert.deepEqual(b, a);
    assert.deepEqual(secondPersist, store.current);
    assert.deepEqual(store.current, a);
  });
});

// ─── Validación 4 — Propagación ────────────────────────────────────────────

describe('Gate V4 — Propagación por arrastre_saliente', () => {
  it('Caso A — arrastre cambia → debe continuar a la semana siguiente', () => {
    const employee = emp();
    const w0 = liquidateWeek(
      liq({
        employee,
        weekStart: '2026-03-02',
        logs: makeLogs('2026-03-02', 48),
      }),
    );
    assert.equal(w0.carryOut, 8);

    const w1 = liquidateWeek(
      liq({
        employee,
        weekStart: '2026-03-09',
        carryIn: w0.carryOut,
        logs: makeLogs('2026-03-09', 40),
      }),
    );
    assert.equal(w1.carryIn, 8);
    assert.equal(w1.balanceFinal, 8);
    assert.equal(w1.carryOut, 8);
    assert.notEqual(w0.carryOut, 0);
  });

  it('Caso B — arrastre deja de cambiar → parada exacta en esa semana (no antes/después)', () => {
    const payEmp = emp({
      terms: [
        {
          effectiveFrom: '2025-01-01',
          effectiveTo: null,
          weeklyHours: 40,
          bagMode: false,
          regime: 'staff',
        },
      ],
    });

    const before0 = liquidateWeek(
      liq({
        employee: payEmp,
        weekStart: '2026-03-02',
        logs: makeLogs('2026-03-02', 45),
      }),
    );
    const before1 = liquidateWeek(
      liq({
        employee: payEmp,
        weekStart: '2026-03-09',
        carryIn: before0.carryOut,
        logs: makeLogs('2026-03-09', 45),
      }),
    );
    assert.equal(before0.carryOut, 0);
    assert.equal(before1.carryOut, 0);

    // Cambio de hecho en W0 (45→50): weeklyBalance cambia, pero carryOut de W0 sigue 0.
    const after0 = liquidateWeek(
      liq({
        employee: payEmp,
        weekStart: '2026-03-02',
        logs: makeLogs('2026-03-02', 50),
      }),
    );
    assert.equal(after0.weeklyBalance, 10);
    assert.equal(after0.carryOut, before0.carryOut);

    // Criterio de parada: carryOut(W0) no cambia → STOP en W0. No se debe recalcular W1.
    const stopAt = after0.carryOut === before0.carryOut ? 0 : 1;
    assert.equal(stopAt, 0);

    // Evidencia de que W1 no necesita recalcularse para el banco:
    const after1IfContinued = liquidateWeek(
      liq({
        employee: payEmp,
        weekStart: '2026-03-09',
        carryIn: after0.carryOut,
        logs: makeLogs('2026-03-09', 45),
      }),
    );
    assert.equal(after1IfContinued.carryOut, before1.carryOut);
  });

  it('Caso B2 — bolsa: cambio que altera carryOut obliga a seguir; estabilización para en índice exacto', () => {
    const employee = emp();
    const weeks = ['2026-03-02', '2026-03-09', '2026-03-16'] as const;

    // before: 40h exactas → carryOut 0 en todas
    const before: number[] = [];
    let carry = 0;
    for (const ws of weeks) {
      const r = liquidateWeek(
        liq({
          employee,
          weekStart: ws,
          carryIn: carry,
          logs: makeLogs(ws, 40),
        }),
      );
      before.push(r.carryOut);
      carry = r.carryOut;
    }
    assert.deepEqual(before, [0, 0, 0]);

    // after: W0 = 45h → carryOut 5; W1 = 35h → absorb (−5)+5cin → 0; W2 estable 0
    const after: number[] = [];
    let stopIndex = -1;
    carry = 0;
    const hoursAfter = [45, 35, 40];
    for (let i = 0; i < weeks.length; i++) {
      const r = liquidateWeek(
        liq({
          employee,
          weekStart: weeks[i]!,
          carryIn: carry,
          logs: makeLogs(weeks[i]!, hoursAfter[i]!),
        }),
      );
      after.push(r.carryOut);
      if (r.carryOut === before[i]) {
        stopIndex = i;
        break;
      }
      carry = r.carryOut;
    }

    assert.equal(after[0], 5);
    assert.notEqual(after[0], before[0]);
    assert.equal(after[1], 0);
    assert.equal(stopIndex, 1); // para exactamente en W1, no en W0 ni W2
    assert.equal(after.length, 2); // no se calculó W2
  });
});

// ─── Validación 5 — Contract Resolver ──────────────────────────────────────

describe('Gate V5 — Contract Resolver unicidad (motor nuevo)', () => {
  it('ADR-003: solo contract-resolver implementa prorrateo días/7 × jornada', () => {
    const files = readdirSync(ENGINE_DIR).filter(
      (f) =>
        f.endsWith('.ts') &&
        !f.includes('.test.') &&
        f !== 'types.ts' &&
        f !== 'index.ts',
    );
    for (const f of files) {
      const body = readFileSync(join(ENGINE_DIR, f), 'utf8');
      if (f === 'contract-resolver.ts') {
        assert.match(body, /days\.length \/ 7/);
        continue;
      }
      assert.doesNotMatch(
        body,
        /dayCount\s*\/\s*7|days\.length\s*\/\s*7|\(\s*[^)]*\/\s*7\s*\)\s*\*/,
        `${f} no debe recalcular prorrateo /7`,
      );
    }
  });

  it('Regime Policy consume contractedHours; no recibe ni usa weeklyHoursOfTerm', () => {
    const body = readFileSync(join(ENGINE_DIR, 'regime-policy.ts'), 'utf8');
    assert.match(body, /contractedHours: number/);
    assert.doesNotMatch(body, /weeklyHoursOfTerm/);
  });

  it('Liquidation Engine llama resolveEffectiveContract y pasa contractedHours al régimen', () => {
    const body = readFileSync(join(ENGINE_DIR, 'liquidation-engine.ts'), 'utf8');
    assert.match(body, /resolveEffectiveContract\(/);
    assert.match(body, /contractedHours: seg\.contractedHours/);
    assert.doesNotMatch(body, /contracted_hours_snapshot/);
    assert.doesNotMatch(body, /contracted_hours_weekly/);
  });
});

// ─── Validación 6 — Carry Engine ───────────────────────────────────────────

describe('Gate V6 — Carry Engine unicidad (motor nuevo)', () => {
  it('liquidation-engine delega en computeCarry; no implementa banco propio', () => {
    const body = readFileSync(join(ENGINE_DIR, 'liquidation-engine.ts'), 'utf8');
    assert.match(body, /computeCarry\(/);
    assert.doesNotMatch(body, /let bank\s*=/);
  });

  it('ningún otro módulo del motor define lógica de sello Pagada sobre carry', () => {
    const files = readdirSync(ENGINE_DIR).filter(
      (f) => f.endsWith('.ts') && !f.includes('.test.') && f !== 'carry-engine.ts',
    );
    for (const f of files) {
      const body = readFileSync(join(ENGINE_DIR, f), 'utf8');
      assert.doesNotMatch(body, /isPaid && bank > 0/);
    }
  });
});

// ─── Validación 9 — Caso real Alba ─────────────────────────────────────────

describe('Gate V9 — Caso real Alba (16→40)', () => {
  it('semana post-cambio con 20h → deuda −20 bajo contrato 40 (no extras vs 16)', () => {
    const alba = emp({
      employeeId: 'alba',
      joiningDate: '2025-06-01',
      terms: [
        {
          effectiveFrom: '2025-06-01',
          effectiveTo: '2026-02-28',
          weeklyHours: 16,
          bagMode: true,
          regime: 'staff',
        },
        {
          effectiveFrom: '2026-03-01',
          effectiveTo: null,
          weeklyHours: 40,
          bagMode: true,
          regime: 'staff',
        },
      ],
    });
    const week = liquidateWeek(
      liq({
        employee: alba,
        weekStart: '2026-03-02',
        logs: [{ clockInIso: '2026-03-03T07:00:00.000Z', totalHours: 20 }],
      }),
    );
    assert.equal(week.contractedHoursEffective, 40);
    assert.equal(week.weeklyBalance, -20);
    assert.equal(week.carryOut, -20);
  });
});
