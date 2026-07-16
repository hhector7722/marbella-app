/**
 * Fase 2 — tipos de cambio de hecho (propuestos).
 * El orquestador no inventa reglas: solo localiza impacto y coordina.
 */

import type { CivilDate, ContractTermFact, TimeLogFact } from '../types.ts';

export type FactChange =
  | {
      kind: 'upsert_time_log';
      employeeId: string;
      log: TimeLogFact;
      /** clock_in anterior si la edición mueve el fichaje de día/semana. */
      previousClockInIso?: string;
    }
  | {
      kind: 'delete_time_log';
      employeeId: string;
      clockInIso: string;
    }
  | {
      /**
       * Sustituye la lista de tramos (incluye cambios de jornada, bolsa/pago,
       * tarifa futura vía tramo, régimen). effectiveFrom = primera fecha civil
       * desde la que el cambio afecta (para localizar la semana).
       */
      kind: 'replace_contract_terms';
      employeeId: string;
      terms: readonly ContractTermFact[];
      effectiveFrom: CivilDate;
    }
  | {
      kind: 'set_joining_date';
      employeeId: string;
      joiningDate: CivilDate | null;
      previousJoiningDate?: CivilDate | null;
    }
  | {
      kind: 'set_end_date';
      employeeId: string;
      endDate: CivilDate | null;
      previousEndDate?: CivilDate | null;
    };

export type ConfirmationDecision =
  | { decision: 'accept' }
  | { decision: 'cancel' };

export type ImpactReport = {
  employeeId: string;
  firstWeekStart: CivilDate;
  /** Semanas pagadas que la cascada tocaría (lunes). */
  paidWeeksAffected: CivilDate[];
};

export type OrchestratorApplyResult =
  | {
      status: 'needs_confirmation';
      employeeId: string;
      firstWeekStart: CivilDate;
      paidWeeksAffected: CivilDate[];
    }
  | { status: 'aborted' }
  | {
      status: 'applied';
      employeeId: string;
      firstWeekStart: CivilDate;
      reopenedWeeks: CivilDate[];
      recalculatedWeeks: CivilDate[];
      stoppedAtWeekStart: CivilDate;
    };
