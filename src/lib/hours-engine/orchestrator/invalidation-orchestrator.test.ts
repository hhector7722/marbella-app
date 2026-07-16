/**
 * Fase 2 — tests del Invalidation Orchestrator.
 * Validan coordinación; no re-prueban el Liquidation Engine.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { liquidateWeek } from '../liquidation-engine.ts';
import type { ContractTermFact, EmployeeBoundaryFacts, TimeLogFact } from '../types.ts';
import { addCivilDays } from '../week-dates.ts';
import {
  analyzeChange,
  applyFactChange,
  locateFirstAffectedWeek,
  MemoryFactStore,
  MemoryResultStore,
  type FactChange,
  type OrchestratorDeps,
} from './index.ts';

const ORCH_DIR = dirname(fileURLToPath(import.meta.url));

const EMP = 'orch-emp';
const W0 = '2026-03-02';
const W1 = '2026-03-09';
const W2 = '2026-03-16';
const HORIZON = W2;

function staffTerms(
  weeklyHours: number,
  bagMode: boolean,
  from = '2025-01-01',
): ContractTermFact[] {
  return [
    {
      effectiveFrom: from,
      effectiveTo: null,
      weeklyHours,
      bagMode,
      regime: 'staff',
    },
  ];
}

function employee(
  overrides: Partial<EmployeeBoundaryFacts> = {},
): EmployeeBoundaryFacts {
  return {
    employeeId: EMP,
    joiningDate: '2025-01-01',
    endDate: null,
    terms: staffTerms(40, true),
    ...overrides,
  };
}

function log(weekStart: string, hours: number, dayOffset = 0): TimeLogFact {
  const day = addCivilDays(weekStart, dayOffset);
  return { clockInIso: `${day}T08:00:00.000Z`, totalHours: hours };
}

function seedDeps(opts: {
  terms?: ContractTermFact[];
  logs?: TimeLogFact[];
  paidWeeks?: string[];
  bagMode?: boolean;
}): OrchestratorDeps & { facts: MemoryFactStore; results: MemoryResultStore } {
  const terms = opts.terms ?? staffTerms(40, opts.bagMode ?? true);
  const emp = employee({ terms });
  const logs = opts.logs ?? [log(W0, 45), log(W1, 45), log(W2, 45)];
  const paidWeeks: Record<string, boolean> = {};
  for (const w of opts.paidWeeks ?? []) paidWeeks[w] = true;

  const facts = MemoryFactStore.fromSeeds([{ employee: emp, logs, paidWeeks }]);
  const results = new MemoryResultStore();

  // Estado inicial de resultados (pre-cambio) para que la parada por carryOut tenga baseline.
  let carryIn = 0;
  for (const week of [W0, W1, W2]) {
    const r = liquidateWeek({
      employee: facts.getEmployee(EMP)!,
      weekStart: week,
      logs: facts.listLogs(EMP),
      isPaid: facts.isPaid(EMP, week),
      carryIn,
    });
    results.save(r);
    carryIn = r.carryOut;
  }

  return { facts, results, horizonWeekStart: HORIZON };
}

describe('Orchestrator — localización', () => {
  it('editar fichaje: primera semana = lunes del fichaje', () => {
    const change: FactChange = {
      kind: 'upsert_time_log',
      employeeId: EMP,
      log: log(W1, 50),
    };
    assert.equal(locateFirstAffectedWeek(change), W1);
  });

  it('editar fichaje moviendo de semana: primera = min(antes, después)', () => {
    const change: FactChange = {
      kind: 'upsert_time_log',
      employeeId: EMP,
      previousClockInIso: log(W1, 40).clockInIso,
      log: log(W0, 40),
    };
    assert.equal(locateFirstAffectedWeek(change), W0);
  });

  it('contrato / bolsa / régimen: effectiveFrom', () => {
    assert.equal(
      locateFirstAffectedWeek({
        kind: 'replace_contract_terms',
        employeeId: EMP,
        terms: staffTerms(16, false, '2026-03-04'),
        effectiveFrom: '2026-03-04',
      }),
      W0,
    );
  });

  it('alta y baja: lunes de la fecha', () => {
    assert.equal(
      locateFirstAffectedWeek({
        kind: 'set_joining_date',
        employeeId: EMP,
        joiningDate: '2026-03-11',
        previousJoiningDate: '2026-03-11',
      }),
      W1,
    );
    assert.equal(
      locateFirstAffectedWeek({
        kind: 'set_joining_date',
        employeeId: EMP,
        joiningDate: '2026-03-11',
        previousJoiningDate: '2026-03-04',
      }),
      W0,
    );
    assert.equal(
      locateFirstAffectedWeek({
        kind: 'set_end_date',
        employeeId: EMP,
        endDate: '2026-03-04',
        previousEndDate: null,
      }),
      W0,
    );
  });
});

describe('Orchestrator — fichaje semana abierta', () => {
  it('aplica sin confirmación; no pide reopen; propaga', () => {
    const deps = seedDeps({ paidWeeks: [] });
    const beforeFacts = deps.facts.fingerprint();
    const change: FactChange = {
      kind: 'upsert_time_log',
      employeeId: EMP,
      log: log(W0, 48),
    };
    const result = applyFactChange(change, deps);
    assert.equal(result.status, 'applied');
    if (result.status !== 'applied') return;
    assert.deepEqual(result.reopenedWeeks, []);
    assert.ok(result.recalculatedWeeks.includes(W0));
    assert.notEqual(deps.facts.fingerprint(), beforeFacts);
    assert.equal(deps.facts.listLogs(EMP).find((l) => l.totalHours === 48)?.totalHours, 48);
  });
});

describe('Orchestrator — fichaje semana pagada', () => {
  it('sin confirmación → needs_confirmation y no muta', () => {
    const deps = seedDeps({ paidWeeks: [W0] });
    const factsFp = deps.facts.fingerprint();
    const resultsFp = deps.results.fingerprint();
    const change: FactChange = {
      kind: 'upsert_time_log',
      employeeId: EMP,
      log: log(W0, 50),
    };
    const result = applyFactChange(change, deps);
    assert.equal(result.status, 'needs_confirmation');
    if (result.status !== 'needs_confirmation') return;
    assert.deepEqual(result.paidWeeksAffected, [W0]);
    assert.equal(deps.facts.fingerprint(), factsFp);
    assert.equal(deps.results.fingerprint(), resultsFp);
  });

  it('cancelar → aborted; sistema idéntico', () => {
    const deps = seedDeps({ paidWeeks: [W0, W1] });
    const factsFp = deps.facts.fingerprint();
    const resultsFp = deps.results.fingerprint();
    const change: FactChange = {
      kind: 'upsert_time_log',
      employeeId: EMP,
      log: log(W0, 50),
    };
    const result = applyFactChange(change, deps, { decision: 'cancel' });
    assert.equal(result.status, 'aborted');
    assert.equal(deps.facts.fingerprint(), factsFp);
    assert.equal(deps.results.fingerprint(), resultsFp);
    assert.equal(deps.facts.isPaid(EMP, W0), true);
  });

  it('aceptar → reabre pagadas tocadas y recalcula', () => {
    const deps = seedDeps({ paidWeeks: [W0] });
    const change: FactChange = {
      kind: 'upsert_time_log',
      employeeId: EMP,
      log: log(W0, 50),
    };
    const result = applyFactChange(change, deps, { decision: 'accept' });
    assert.equal(result.status, 'applied');
    if (result.status !== 'applied') return;
    assert.ok(result.reopenedWeeks.includes(W0));
    assert.equal(deps.facts.isPaid(EMP, W0), false);
    assert.ok(result.recalculatedWeeks.includes(W0));
  });

  it('varias semanas pagadas: lista completa en needs_confirmation', () => {
    const deps = seedDeps({ paidWeeks: [W0, W1, W2] });
    const change: FactChange = {
      kind: 'upsert_time_log',
      employeeId: EMP,
      log: log(W0, 55),
    };
    const impact = analyzeChange(change, deps);
    assert.ok(impact.paidWeeksAffected.length >= 1);
    const pending = applyFactChange(change, deps);
    assert.equal(pending.status, 'needs_confirmation');
    if (pending.status !== 'needs_confirmation') return;
    assert.deepEqual(pending.paidWeeksAffected, impact.paidWeeksAffected);
  });
});

describe('Orchestrator — contratos / alta / baja / bolsa', () => {
  it('cambio contrato retroactivo pide confirmación si hay pagadas', () => {
    const deps = seedDeps({ paidWeeks: [W0] });
    const change: FactChange = {
      kind: 'replace_contract_terms',
      employeeId: EMP,
      terms: staffTerms(16, true, '2026-03-01'),
      effectiveFrom: '2026-03-01',
    };
    const result = applyFactChange(change, deps);
    assert.equal(result.status, 'needs_confirmation');
  });

  it('cambio contrato futuro (effective en W2) no toca W0 pagada si cascada empieza en W2', () => {
    const deps = seedDeps({ paidWeeks: [W0] });
    const change: FactChange = {
      kind: 'replace_contract_terms',
      employeeId: EMP,
      terms: [
        ...staffTerms(40, true, '2025-01-01').map((t) => ({
          ...t,
          effectiveTo: '2026-03-15',
        })),
        {
          effectiveFrom: '2026-03-16',
          effectiveTo: null,
          weeklyHours: 20,
          bagMode: true,
          regime: 'staff' as const,
        },
      ],
      effectiveFrom: '2026-03-16',
    };
    assert.equal(locateFirstAffectedWeek(change), W2);
    const result = applyFactChange(change, deps);
    // W0 pagada no está en cascada desde W2
    assert.equal(result.status, 'applied');
    if (result.status !== 'applied') return;
    assert.equal(deps.facts.isPaid(EMP, W0), true);
    assert.ok(result.recalculatedWeeks.includes(W2));
    assert.ok(!result.recalculatedWeeks.includes(W0));
  });

  it('cambio bolsa/pago vía replace_contract_terms', () => {
    const deps = seedDeps({ bagMode: true, paidWeeks: [] });
    const change: FactChange = {
      kind: 'replace_contract_terms',
      employeeId: EMP,
      terms: staffTerms(40, false, '2026-03-02'),
      effectiveFrom: '2026-03-02',
    };
    const result = applyFactChange(change, deps);
    assert.equal(result.status, 'applied');
    if (result.status !== 'applied') return;
    assert.equal(deps.facts.getEmployee(EMP)!.terms[0]!.bagMode, false);
    assert.ok(result.recalculatedWeeks.length >= 1);
  });

  it('alta mid-week', () => {
    const deps = seedDeps({
      logs: [log(W0, 10), log(W0, 20, 3)],
      paidWeeks: [],
    });
    // Re-seed joining
    const facts = MemoryFactStore.fromSeeds([
      {
        employee: employee({ joiningDate: '2026-03-04', terms: staffTerms(40, true) }),
        logs: [log(W0, 10), log(W0, 20, 3)],
      },
    ]);
    const results = new MemoryResultStore();
    const localDeps: OrchestratorDeps = { facts, results, horizonWeekStart: HORIZON };
    // baseline
    const base = liquidateWeek({
      employee: facts.getEmployee(EMP)!,
      weekStart: W0,
      logs: facts.listLogs(EMP),
      isPaid: false,
      carryIn: 0,
    });
    results.save(base);

    const change: FactChange = {
      kind: 'set_joining_date',
      employeeId: EMP,
      joiningDate: '2026-03-02',
      previousJoiningDate: '2026-03-04',
    };
    const result = applyFactChange(change, localDeps);
    assert.equal(result.status, 'applied');
    assert.equal(facts.getEmployee(EMP)!.joiningDate, '2026-03-02');
  });

  it('baja', () => {
    const deps = seedDeps({ paidWeeks: [] });
    const change: FactChange = {
      kind: 'set_end_date',
      employeeId: EMP,
      endDate: '2026-03-04',
      previousEndDate: null,
    };
    const result = applyFactChange(change, deps);
    assert.equal(result.status, 'applied');
    assert.equal(deps.facts.getEmployee(EMP)!.endDate, '2026-03-04');
  });
});

describe('Orchestrator — propagación STOP / sin STOP', () => {
  it('STOP cuando carryOut no cambia (modo pago)', () => {
    const deps = seedDeps({ bagMode: false, paidWeeks: [], logs: [log(W0, 45), log(W1, 45), log(W2, 45)] });
    // Cambio que altera weeklyBalance pero no carryOut (pago → carryOut 0 estable)
    const change: FactChange = {
      kind: 'upsert_time_log',
      employeeId: EMP,
      log: log(W0, 50),
    };
    const beforeW0 = deps.results.get(EMP, W0)!;
    assert.equal(beforeW0.carryOut, 0);

    const result = applyFactChange(change, deps);
    assert.equal(result.status, 'applied');
    if (result.status !== 'applied') return;
    assert.equal(result.stoppedAtWeekStart, W0);
    assert.deepEqual(result.recalculatedWeeks, [W0]);
    assert.equal(deps.results.get(EMP, W0)!.carryOut, 0);
    // W1 no recalculada de más
    assert.equal(result.recalculatedWeeks.includes(W1), false);
  });

  it('sin STOP cuando carryOut cambia (bolsa)', () => {
    const deps = seedDeps({ bagMode: true, paidWeeks: [] });
    const beforeW0 = deps.results.get(EMP, W0)!;
    assert.equal(beforeW0.carryOut, 5); // 45-40

    const change: FactChange = {
      kind: 'upsert_time_log',
      employeeId: EMP,
      log: log(W0, 48),
    };
    const result = applyFactChange(change, deps);
    assert.equal(result.status, 'applied');
    if (result.status !== 'applied') return;
    assert.equal(deps.results.get(EMP, W0)!.carryOut, 8);
    assert.notEqual(result.recalculatedWeeks.length, 1);
    assert.ok(result.recalculatedWeeks.includes(W1));
  });
});

describe('Orchestrator — invariantes', () => {
  it('nunca modifica hechos ajenos al cambio (solo el fichaje upsert)', () => {
    const deps = seedDeps({ paidWeeks: [] });
    const termsBefore = JSON.stringify(deps.facts.getEmployee(EMP)!.terms);
    applyFactChange(
      { kind: 'upsert_time_log', employeeId: EMP, log: log(W0, 47) },
      deps,
    );
    assert.equal(JSON.stringify(deps.facts.getEmployee(EMP)!.terms), termsBefore);
  });

  it('delete_time_log elimina solo ese fichaje', () => {
    const deps = seedDeps({
      paidWeeks: [],
      logs: [log(W0, 40), log(W1, 40)],
    });
    const target = log(W0, 40);
    applyFactChange(
      { kind: 'delete_time_log', employeeId: EMP, clockInIso: target.clockInIso },
      deps,
    );
    assert.equal(
      deps.facts.listLogs(EMP).some((l) => l.clockInIso === target.clockInIso),
      false,
    );
    assert.equal(deps.facts.listLogs(EMP).length, 1);
  });

  it('varias semanas abiertas: recalc desde primera afectada', () => {
    const deps = seedDeps({ paidWeeks: [] });
    const result = applyFactChange(
      { kind: 'upsert_time_log', employeeId: EMP, log: log(W1, 50) },
      deps,
    );
    assert.equal(result.status, 'applied');
    if (result.status !== 'applied') return;
    assert.equal(result.firstWeekStart, W1);
    assert.ok(!result.recalculatedWeeks.includes(W0));
    assert.ok(result.recalculatedWeeks.includes(W1));
  });

  it('ADR: orquestador solo importa liquidateWeek del núcleo (no resolver/carry/regime)', () => {
    for (const f of [
      'invalidation-orchestrator.ts',
      'propagate.ts',
      'impact-analyzer.ts',
    ]) {
      const body = readFileSync(join(ORCH_DIR, f), 'utf8');
      assert.doesNotMatch(body, /resolveEffectiveContract/);
      assert.doesNotMatch(body, /computeCarry/);
      assert.doesNotMatch(body, /applyRegimeToSegment/);
      assert.doesNotMatch(body, /aggregateWeekAttendance/);
    }
    const propagate = readFileSync(join(ORCH_DIR, 'propagate.ts'), 'utf8');
    assert.match(propagate, /liquidateWeek/);
  });
});
