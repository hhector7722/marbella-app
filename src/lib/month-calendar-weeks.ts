/** Reparte los días visibles del mes en filas lun–dom. */
export function chunkCalendarWeeks<T>(days: T[]): T[][] {
    const weeks: T[][] = [];
    for (let i = 0; i < days.length; i += 7) {
        weeks.push(days.slice(i, i + 7));
    }
    return weeks;
}
