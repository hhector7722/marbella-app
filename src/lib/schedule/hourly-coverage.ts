/**
 * Número de empleados presentes en cada tramo [hora:00, hora+1:00).
 * Usa minutos reales para no perder turnos que empiezan/terminan a y media.
 */
export function countWorkersByHour(
    shifts: readonly { start: string; end: string; active?: boolean }[],
    hours: readonly number[],
): number[] {
    const toMinutes = (value: string): number | null => {
        const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
        if (!match) return null;
        const hour = Number(match[1]);
        const minute = Number(match[2]);
        if (hour > 23 || minute > 59) return null;
        return hour * 60 + minute;
    };

    const intervals = shifts.flatMap((shift) => {
        if (shift.active === false) return [];
        const start = toMinutes(shift.start);
        const rawEnd = toMinutes(shift.end);
        if (start === null || rawEnd === null || start === rawEnd) return [];
        return [[start, rawEnd < start ? rawEnd + 24 * 60 : rawEnd]] as const;
    });

    return hours.map((hour) => {
        const start = hour * 60;
        const end = start + 60;
        return intervals.filter(([shiftStart, shiftEnd]) => shiftStart < end && shiftEnd > start).length;
    });
}
