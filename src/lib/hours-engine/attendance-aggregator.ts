import { formatYmdInMadrid } from '../madrid-date-bounds.ts';
import { roundMarbellaHours } from './marbella-round.ts';
import type {
  AttendanceWeek,
  CivilDate,
  EmployeeBoundaryFacts,
  TimeLogFact,
} from './types.ts';
import { compareCivilDate, weekBounds } from './week-dates.ts';

function hoursFromLog(log: TimeLogFact): number {
  if (log.totalHours != null && Number.isFinite(log.totalHours)) {
    return log.totalHours;
  }
  if (!log.clockOutIso) return 0;
  const start = new Date(log.clockInIso);
  const end = new Date(log.clockOutIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const raw = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  if (raw <= 0) return 0;
  return roundMarbellaHours(raw);
}

function isComputableDay(
  day: CivilDate,
  joiningDate: CivilDate | null,
  endDate: CivilDate | null,
): boolean {
  // Pre-alta: sí computa (como extra). Post-baja: no.
  if (endDate !== null && compareCivilDate(day, endDate) > 0) return false;
  void joiningDate;
  return true;
}

/**
 * Agrega horas trabajadas de una semana en Europe/Madrid.
 * No calcula balances ni contratos.
 */
export function aggregateWeekAttendance(
  employee: Pick<EmployeeBoundaryFacts, 'joiningDate' | 'endDate'>,
  weekStart: CivilDate,
  logs: readonly TimeLogFact[],
): AttendanceWeek {
  const { weekEnd, days } = weekBounds(weekStart);
  const daySet = new Set(days);
  const hoursByDay: Record<CivilDate, number> = {};
  for (const d of days) hoursByDay[d] = 0;

  for (const log of logs) {
    const day = formatYmdInMadrid(log.clockInIso);
    if (!day || !daySet.has(day)) continue;
    if (!isComputableDay(day, employee.joiningDate, employee.endDate)) continue;
    hoursByDay[day] = (hoursByDay[day] ?? 0) + hoursFromLog(log);
  }

  const attendanceDays = days.map((day) => ({
    day,
    hours: hoursByDay[day] ?? 0,
  }));
  const totalHours = attendanceDays.reduce((acc, d) => acc + d.hours, 0);

  return {
    weekStart,
    weekEnd,
    hoursByDay,
    days: attendanceDays,
    totalHours,
  };
}
