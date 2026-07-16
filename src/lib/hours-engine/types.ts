/**
 * Motor de horas — Fase 1 (núcleo determinista).
 * Hechos de entrada y resultados derivados. Sin persistencia. Sin UI.
 *
 * Resolución contractual: por tramo. No hay un único bolsa/pago ni régimen semanal;
 * la liquidación semanal es la composición de los tramos (v1.0 + decisión D).
 */

/** YYYY-MM-DD (calendario civil; sin Date UTC parse). */
export type CivilDate = string;

export type ContractRegime = 'staff' | 'manager' | 'fixed';

/** Régimen efectivo de un segmento de liquidación (agosto es calendario, no campo de tramo). */
export type SegmentRegime = ContractRegime | 'agosto' | 'pre_alta';

/**
 * Tramo contractual versionado (hecho).
 * effectiveTo inclusive; null = abierto.
 * Tramos no se solapan: el nuevo cierra el anterior el día previo (invariante de hechos).
 */
export type ContractTermFact = {
  effectiveFrom: CivilDate;
  effectiveTo: CivilDate | null;
  weeklyHours: number;
  /** true = bolsa (AcumulaHoras); false = pago. */
  bagMode: boolean;
  regime: ContractRegime;
  /**
   * Tarifa OT del tramo (€/h). Hecho versionado; el núcleo de horas no la usa
   * (Cost Engine). Nunca leer overtime_cost_per_hour del perfil vivo.
   */
  overtimeRatePerHour?: number | null;
};

/** Fichaje (hecho). Horas ya redondeadas Marbella, o clocks para calcularlas. */
export type TimeLogFact = {
  /** Instante UTC ISO del clock_in (partición Madrid). */
  clockInIso: string;
  clockOutIso?: string | null;
  /**
   * Si está definido, es la fuente de horas del fichaje (ya redondeadas).
   * Si no, se deriva de clockIn/clockOut con redondeo Marbella.
   */
  totalHours?: number | null;
};

export type EmployeeBoundaryFacts = {
  employeeId: string;
  /** Alta; null = sin alta conocida (no hay días pre-alta especiales). */
  joiningDate: CivilDate | null;
  /** Baja inclusive; null = sin baja. */
  endDate: CivilDate | null;
  terms: readonly ContractTermFact[];
};

/** Entrada pura de liquidación de una semana. */
export type LiquidationInput = {
  employee: EmployeeBoundaryFacts;
  /** Lunes YYYY-MM-DD. */
  weekStart: CivilDate;
  logs: readonly TimeLogFact[];
  /** Hecho Pagada de esta semana. */
  isPaid: boolean;
  /** Arrastre saliente de W-1 (o 0). */
  carryIn: number;
};

export type ContractSegment = {
  /** Días civiles del segmento dentro de la semana (ordenados). */
  days: readonly CivilDate[];
  /** Jornada semanal del tramo (metadato del hecho; no usar para recalcular prorrateo fuera del resolver). */
  weeklyHoursOfTerm: number;
  /** Única resolución: days.length / 7 × jornada del tramo (Contract Resolver). */
  contractedHours: number;
  bagMode: boolean;
  /** Régimen del tramo (sin agosto; agosto se aplica en Regime Policy por día). */
  termRegime: ContractRegime;
  /** Tarifa OT del tramo vigente en esos días (passthrough del hecho). */
  overtimeRatePerHour: number | null;
  /** Origen: tramo real o pre-alta sintética. */
  kind: 'term' | 'pre_alta';
  effectiveFrom: CivilDate | null;
  effectiveTo: CivilDate | null;
};

export type EffectiveContractWeek = {
  weekStart: CivilDate;
  weekEnd: CivilDate;
  segments: readonly ContractSegment[];
  /** Suma de contractedHours de segmentos de tramo (pre-alta aporta 0). */
  contractedHoursEffective: number;
};

export type AttendanceDay = {
  day: CivilDate;
  hours: number;
};

export type AttendanceWeek = {
  weekStart: CivilDate;
  weekEnd: CivilDate;
  hoursByDay: Readonly<Record<CivilDate, number>>;
  days: readonly AttendanceDay[];
  totalHours: number;
};

export type SegmentLiquidation = {
  days: readonly CivilDate[];
  hoursWorked: number;
  contractedHours: number;
  bagMode: boolean;
  regimeApplied: SegmentRegime;
  weeklyBalancePart: number;
  ordinaryHours: number;
  overtimeHours: number;
  kind: 'term' | 'pre_alta';
};

/** Un día del desglose: consecuencia de la liquidación (regla running). */
export type DailyBreakdownDay = {
  day: CivilDate;
  hours: number;
  ordinaryHours: number;
  overtimeHours: number;
};

/**
 * Desglose diario derivado de la misma liquidación semanal.
 * Invariante: Σ overtimeHours === LiquidationResult.overtimeHours.
 */
export type DailyBreakdown = {
  days: readonly DailyBreakdownDay[];
  ordinaryHoursTotal: number;
  overtimeHoursTotal: number;
};

export type LiquidationResult = {
  employeeId: string;
  weekStart: CivilDate;
  weekEnd: CivilDate;
  hoursWorked: number;
  contractedHoursEffective: number;
  weeklyBalance: number;
  carryIn: number;
  balanceFinal: number;
  carryOut: number;
  isPaid: boolean;
  ordinaryHours: number;
  overtimeHours: number;
  segments: readonly SegmentLiquidation[];
  /** Ex. diarias / ordinarias por día — única fuente para la UI. */
  dailyBreakdown: DailyBreakdown;
};
