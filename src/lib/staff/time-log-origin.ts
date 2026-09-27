export type TimeLogOrigin = 'manager_manual' | 'staff_clock';

/** Origen del fichaje. El manager escribe true; el fichaje de la persona, false. */
export function isManualTimeLogEntry(origin: TimeLogOrigin): boolean {
  return origin === 'manager_manual';
}
