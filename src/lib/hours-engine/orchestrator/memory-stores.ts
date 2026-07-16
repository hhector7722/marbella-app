import type {
  CivilDate,
  ContractTermFact,
  EmployeeBoundaryFacts,
  LiquidationResult,
  TimeLogFact,
} from '../types.ts';
import { compareCivilDate } from '../week-dates.ts';
import type { FactChange } from './fact-change.ts';
import type { EmployeeSeed, FactStore, ResultStore } from './ports.ts';

type EmpState = {
  employee: EmployeeBoundaryFacts;
  logs: Map<string, TimeLogFact>;
  paid: Map<CivilDate, boolean>;
};

function cloneEmployee(e: EmployeeBoundaryFacts): EmployeeBoundaryFacts {
  return {
    employeeId: e.employeeId,
    joiningDate: e.joiningDate,
    endDate: e.endDate,
    terms: e.terms.map((t) => ({ ...t })),
  };
}

export class MemoryFactStore implements FactStore {
  private readonly byEmployee = new Map<string, EmpState>();

  static fromSeeds(seeds: readonly EmployeeSeed[]): MemoryFactStore {
    const store = new MemoryFactStore();
    for (const seed of seeds) {
      store.seed(seed);
    }
    return store;
  }

  seed(seed: EmployeeSeed): void {
    const logs = new Map<string, TimeLogFact>();
    for (const log of seed.logs ?? []) {
      logs.set(log.clockInIso, { ...log });
    }
    const paid = new Map<CivilDate, boolean>();
    for (const [week, flag] of Object.entries(seed.paidWeeks ?? {})) {
      paid.set(week, flag);
    }
    this.byEmployee.set(seed.employee.employeeId, {
      employee: cloneEmployee(seed.employee),
      logs,
      paid,
    });
  }

  getEmployee(employeeId: string): EmployeeBoundaryFacts | null {
    const s = this.byEmployee.get(employeeId);
    return s ? cloneEmployee(s.employee) : null;
  }

  listLogs(employeeId: string): readonly TimeLogFact[] {
    const s = this.byEmployee.get(employeeId);
    if (!s) return [];
    return [...s.logs.values()].map((l) => ({ ...l }));
  }

  isPaid(employeeId: string, weekStart: CivilDate): boolean {
    return this.byEmployee.get(employeeId)?.paid.get(weekStart) === true;
  }

  listPaidWeekStarts(
    employeeId: string,
    fromWeekStart: CivilDate,
    toWeekStartInclusive: CivilDate,
  ): CivilDate[] {
    const s = this.byEmployee.get(employeeId);
    if (!s) return [];
    const out: CivilDate[] = [];
    for (const [week, paid] of s.paid) {
      if (!paid) continue;
      if (compareCivilDate(week, fromWeekStart) < 0) continue;
      if (compareCivilDate(week, toWeekStartInclusive) > 0) continue;
      out.push(week);
    }
    return out.sort((a, b) => compareCivilDate(a, b));
  }

  applyFactChange(change: FactChange): void {
    const s = this.require(change.employeeId);
    switch (change.kind) {
      case 'upsert_time_log': {
        if (change.previousClockInIso && change.previousClockInIso !== change.log.clockInIso) {
          s.logs.delete(change.previousClockInIso);
        }
        s.logs.set(change.log.clockInIso, { ...change.log });
        break;
      }
      case 'delete_time_log': {
        s.logs.delete(change.clockInIso);
        break;
      }
      case 'replace_contract_terms': {
        s.employee = {
          ...s.employee,
          terms: change.terms.map((t: ContractTermFact) => ({ ...t })),
        };
        break;
      }
      case 'set_joining_date': {
        s.employee = { ...s.employee, joiningDate: change.joiningDate };
        break;
      }
      case 'set_end_date': {
        s.employee = { ...s.employee, endDate: change.endDate };
        break;
      }
      default: {
        const _exhaustive: never = change;
        void _exhaustive;
      }
    }
  }

  setPaid(employeeId: string, weekStart: CivilDate, isPaid: boolean): void {
    const s = this.require(employeeId);
    if (isPaid) s.paid.set(weekStart, true);
    else s.paid.delete(weekStart);
  }

  clone(): FactStore {
    const copy = new MemoryFactStore();
    for (const [id, s] of this.byEmployee) {
      const logs = new Map<string, TimeLogFact>();
      for (const [k, v] of s.logs) logs.set(k, { ...v });
      const paid = new Map<CivilDate, boolean>(s.paid);
      copy.byEmployee.set(id, {
        employee: cloneEmployee(s.employee),
        logs,
        paid,
      });
    }
    return copy;
  }

  /** Serialización estable para asserts de cancelación. */
  fingerprint(): string {
    const empIds = [...this.byEmployee.keys()].sort();
    const payload = empIds.map((id) => {
      const s = this.byEmployee.get(id)!;
      return {
        employee: s.employee,
        logs: [...s.logs.entries()].sort(([a], [b]) => a.localeCompare(b)),
        paid: [...s.paid.entries()].sort(([a], [b]) => a.localeCompare(b)),
      };
    });
    return JSON.stringify(payload);
  }

  private require(employeeId: string): EmpState {
    const s = this.byEmployee.get(employeeId);
    if (!s) {
      throw new Error(`FactStore: empleado desconocido ${employeeId}`);
    }
    return s;
  }
}

export class MemoryResultStore implements ResultStore {
  private readonly byKey = new Map<string, LiquidationResult>();

  static fromResults(results: readonly LiquidationResult[]): MemoryResultStore {
    const store = new MemoryResultStore();
    for (const r of results) store.save(r);
    return store;
  }

  private key(employeeId: string, weekStart: CivilDate): string {
    return `${employeeId}::${weekStart}`;
  }

  get(employeeId: string, weekStart: CivilDate): LiquidationResult | null {
    return this.byKey.get(this.key(employeeId, weekStart)) ?? null;
  }

  save(result: LiquidationResult): void {
    this.byKey.set(this.key(result.employeeId, result.weekStart), structuredClone(result));
  }

  clone(): ResultStore {
    const copy = new MemoryResultStore();
    for (const [k, v] of this.byKey) {
      copy.byKey.set(k, structuredClone(v));
    }
    return copy;
  }

  fingerprint(): string {
    const keys = [...this.byKey.keys()].sort();
    return JSON.stringify(keys.map((k) => [k, this.byKey.get(k)]));
  }
}
