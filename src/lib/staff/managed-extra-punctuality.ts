export type ManagedExtraPunctuality =
  | { kind: 'no_shift'; label: 'Sin turno previsto' }
  | { kind: 'no_log'; label: 'Sin registro' }
  | { kind: 'on_time'; label: 'A tiempo' }
  | { kind: 'late'; label: `Retraso: ${number} min`; minutes: number };

/**
 * Puntualidad derivada. No se persiste.
 * Compara instantes: un turno 18:00–01:00 no se lee como horas de reloj sueltas.
 */
export function deriveManagedExtraPunctuality(input: {
  publishedShiftStartIso: string | null;
  firstRegularClockInIso: string | null;
}): ManagedExtraPunctuality {
  if (!input.publishedShiftStartIso) {
    return { kind: 'no_shift', label: 'Sin turno previsto' };
  }
  const start = new Date(input.publishedShiftStartIso);
  if (Number.isNaN(start.getTime())) {
    return { kind: 'no_shift', label: 'Sin turno previsto' };
  }
  if (!input.firstRegularClockInIso) {
    return { kind: 'no_log', label: 'Sin registro' };
  }
  const clockIn = new Date(input.firstRegularClockInIso);
  if (Number.isNaN(clockIn.getTime())) {
    return { kind: 'no_log', label: 'Sin registro' };
  }

  const diffMs = clockIn.getTime() - start.getTime();
  if (diffMs <= 0) {
    return { kind: 'on_time', label: 'A tiempo' };
  }
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes <= 0) {
    return { kind: 'on_time', label: 'A tiempo' };
  }
  return { kind: 'late', label: `Retraso: ${minutes} min`, minutes };
}
