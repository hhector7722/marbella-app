/**
 * Inclusión de una persona en el detalle de coste laboral de un día.
 * Un extra gestionado con tramo abierto de 0 h no cuenta como plantilla fija.
 */
export type LaborWorkerDayInput = {
  staffingMode?: string | null;
  hasActivity: boolean;
  hasActiveContract: boolean;
  includeAllContracted: boolean;
  fixed: number;
  overtime: number;
};

export type LaborWorkerDayDecision = {
  include: boolean;
  fixed: number;
  overtime: number;
  total: number;
};

export function resolveLaborWorkerDay(input: LaborWorkerDayInput): LaborWorkerDayDecision {
  if (input.staffingMode === 'managed_extra') {
    if (!input.hasActivity) {
      return { include: false, fixed: 0, overtime: 0, total: 0 };
    }
    return {
      include: true,
      fixed: 0,
      overtime: input.overtime,
      total: input.overtime,
    };
  }

  const include = input.includeAllContracted
    ? input.hasActiveContract || input.hasActivity
    : input.hasActivity;

  return {
    include,
    fixed: input.fixed,
    overtime: input.overtime,
    total: input.fixed + input.overtime,
  };
}
