import type {
  CivilDate,
  ContractTermFact,
  EmployeeBoundaryFacts,
  LiquidationResult,
  TimeLogFact,
} from '../types.ts';
import type { FactChange } from './fact-change.ts';

/**
 * Puerto de hechos. El orquestador aplica cambios y reaperturas aquí;
 * no calcula liquidaciones.
 */
export type FactStore = {
  getEmployee(employeeId: string): EmployeeBoundaryFacts | null;
  listLogs(employeeId: string): readonly TimeLogFact[];
  isPaid(employeeId: string, weekStart: CivilDate): boolean;
  listPaidWeekStarts(
    employeeId: string,
    fromWeekStart: CivilDate,
    toWeekStartInclusive: CivilDate,
  ): CivilDate[];

  applyFactChange(change: FactChange): void;
  setPaid(employeeId: string, weekStart: CivilDate, isPaid: boolean): void;

  /** Clona estado de hechos (sandbox de impacto / tests de cancelación). */
  clone(): FactStore;
};

/** Puerto de resultados de liquidación (solo LiquidationResult). */
export type ResultStore = {
  get(employeeId: string, weekStart: CivilDate): LiquidationResult | null;
  save(result: LiquidationResult): void;
  clone(): ResultStore;
};

export type EmployeeSeed = {
  employee: EmployeeBoundaryFacts;
  logs?: readonly TimeLogFact[];
  /** weekStart → pagada */
  paidWeeks?: Readonly<Record<CivilDate, boolean>>;
  results?: readonly LiquidationResult[];
};
