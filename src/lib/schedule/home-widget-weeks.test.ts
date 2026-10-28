import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    eachDayOfInterval,
    endOfMonth,
    endOfWeek,
    format,
    startOfMonth,
    startOfWeek,
} from 'date-fns';
import { getHomeScheduleWeeks, HOME_SCHEDULE_MAX_WEEKS } from './home-widget-weeks.ts';

function weeksOfMonth(ym: string) {
    const first = new Date(`${ym}-01T12:00:00`);
    const days = eachDayOfInterval({
        start: startOfWeek(startOfMonth(first), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(first), { weekStartsOn: 1 }),
    });
    return getHomeScheduleWeeks(days);
}

describe('Horarios en inicio: máximo cinco filas semanales', () => {
    it('oculta la sexta semana en los meses indicados', () => {
        for (const [month, hiddenDates] of [
            ['2026-11', ['2026-11-30']],
            ['2026-08', ['2026-08-31']],
            ['2026-03', ['2026-03-30', '2026-03-31']],
            ['2027-05', ['2027-05-31']],
        ] as const) {
            const weeks = weeksOfMonth(month);
            assert.equal(weeks.length, HOME_SCHEDULE_MAX_WEEKS, month);
            assert.ok(weeks.every(week => week.length === 7), month);
            const shown = new Set(weeks.flat().map(day => format(day, 'yyyy-MM-dd')));
            for (const ymd of hiddenDates) {
                assert.ok(!shown.has(ymd), `${ymd} no debe ocupar una sexta fila`);
            }
        }
    });

    it('conserva todos los días de un mes de cuatro o cinco semanas', () => {
        for (const [month, count] of [['2027-02', 4], ['2026-10', 5]] as const) {
            const weeks = weeksOfMonth(month);
            assert.equal(weeks.length, count, month);
            assert.ok(weeks.flat().some(day => format(day, 'yyyy-MM-dd') === `${month}-01`));
            assert.ok(weeks.flat().some(day => format(day, 'yyyy-MM-dd') ===
                (month === '2027-02' ? '2027-02-28' : '2026-10-31')));
        }
    });
});
