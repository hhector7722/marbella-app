/**
 * Vista de la distribución prevista. La suma sale de summarizeClosureHours.
 * No calcula balances.
 */

import { summarizeClosureHours } from './expected-hours.ts';
import type { CivilDate } from './types.ts';
import {
  civilDateToParts,
  isAugustCivilDate,
  isPartialAugustClosureWeek,
  weekBounds,
} from './week-dates.ts';

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;

export type AugustClosureDraftValue = number | null;

export type AugustClosureEditorDay = {
  day: CivilDate;
  label: (typeof DAY_LABELS)[number];
  dateNumber: number;
  hours: AugustClosureDraftValue;
  closureLabel: 'Cierre empresa' | null;
};

export type AugustClosureEditorModel = {
  pendingLabel: 'Distribución pendiente' | null;
  invalidLabel: string | null;
  weeklyContractLabel: string;
  days: readonly AugustClosureEditorDay[];
  preview: {
    expectedLabel: 'Total previsto';
    referenceLabel: 'Jornada prevista de referencia';
    exemptLabel: 'Exento por cierre';
    requiredLabel: 'Horas exigibles';
    expectedTotal: number;
    referenceHours: number;
    closureExemptHours: number;
    requiredHours: number;
  } | null;
  error: string | null;
  canSave: boolean;
};

function formatHours(hours: number): string {
  return String(hours);
}

export function buildAugustClosureEditorModel(input: {
  weekStart: CivilDate;
  weeklyContractHours: number;
  persisted: 'unconfigured' | 'configured' | 'invalid';
  invalidDetail?: string | null;
  draft: readonly AugustClosureDraftValue[];
}): AugustClosureEditorModel | null {
  if (!isPartialAugustClosureWeek(input.weekStart)) return null;

  const { days } = weekBounds(input.weekStart);
  const draft = days.map((_, index) => input.draft[index] ?? null);
  const editorDays: AugustClosureEditorDay[] = days.map((day, index) => ({
    day,
    label: DAY_LABELS[index]!,
    dateNumber: civilDateToParts(day).d,
    hours: draft[index] ?? null,
    closureLabel: isAugustCivilDate(day) ? 'Cierre empresa' : null,
  }));

  const hasInput = draft.some((hours) => hours != null);
  const complete = draft.every(
    (hours) => hours == null || (Number.isFinite(hours) && hours >= 0 && hours <= 24),
  );
  const untouched = draft.every((hours) => hours == null);
  const preview = hasInput && complete
    ? summarizeClosureHours(days, Object.fromEntries(days.map((day, index) => [day, draft[index]!])))
    : null;
  const weekly = input.weeklyContractHours;
  const mismatch =
    preview != null && Math.abs(preview.expectedTotal - weekly) > 1e-9;

  return {
    pendingLabel:
      input.persisted === 'unconfigured' && untouched ? 'Distribución pendiente' : null,
    invalidLabel: input.persisted === 'invalid' ? (input.invalidDetail ?? 'Distribución incompleta') : null,
    weeklyContractLabel: `Jornada prevista de referencia: ${formatHours(weekly)} h`,
    days: editorDays,
    preview: preview
      ? {
          expectedLabel: 'Total previsto',
          referenceLabel: 'Jornada prevista de referencia',
          exemptLabel: 'Exento por cierre',
          requiredLabel: 'Horas exigibles',
          expectedTotal: preview.expectedTotal,
          referenceHours: weekly,
          closureExemptHours: preview.closureExemptHours,
          requiredHours: preview.requiredHours,
        }
      : null,
    error: mismatch
      ? `El total previsto debe sumar ${formatHours(weekly)} h para esta semana.`
      : null,
    canSave: hasInput && complete && !mismatch,
  };
}
