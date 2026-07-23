/**
 * Tests: build-employee-weeks-from-logs (misma fuente que plantilla).
 * Run: npx tsx --test src/lib/staff/build-employee-weeks-from-logs.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    aggregateLogsForDay,
    buildEmployeeWeeksFromTimeLogs,
} from './build-employee-weeks-from-logs.ts';

describe('aggregateLogsForDay', () => {
    it('día vacío → sin log', () => {
        const d = aggregateLogsForDay([]);
        assert.equal(d.hasLog, false);
        assert.equal(d.clockIn, null);
        assert.equal(d.totalHours, 0);
    });

    it('un fichaje → mismos relojes Madrid', () => {
        // 2026-07-07 10:27 UTC = 12:27 Madrid (CEST)
        const d = aggregateLogsForDay([
            {
                clock_in: '2026-07-07T10:27:00.000Z',
                clock_out: '2026-07-07T18:52:00.000Z',
                total_hours: 8.42,
                event_type: 'regular',
            },
        ]);
        assert.equal(d.hasLog, true);
        assert.equal(d.clockIn, '12:27');
        assert.equal(d.clockOut, '20:52');
        assert.equal(d.totalHours, 8.42);
    });

    it('varios fichajes → entrada más temprana, salida más tardía, suma horas', () => {
        const d = aggregateLogsForDay([
            {
                clock_in: '2026-07-07T08:00:00.000Z',
                clock_out: '2026-07-07T12:00:00.000Z',
                total_hours: 4,
                event_type: 'regular',
            },
            {
                clock_in: '2026-07-07T14:00:00.000Z',
                clock_out: '2026-07-07T18:00:00.000Z',
                total_hours: 4,
                event_type: 'regular',
            },
        ]);
        assert.equal(d.clockIn, '10:00');
        assert.equal(d.clockOut, '20:00');
        assert.equal(d.totalHours, 8);
    });

    it('trabajadas + justificadas → relojes regulares + justifiedHours (sin forzar event personal)', () => {
        const d = aggregateLogsForDay([
            {
                clock_in: '2026-07-07T08:00:00.000Z',
                clock_out: '2026-07-07T14:00:00.000Z',
                total_hours: 7,
                justified_hours: 1,
                event_type: 'regular',
            },
        ]);
        assert.equal(d.totalHours, 7);
        assert.equal(d.justifiedHours, 1);
        assert.equal(d.eventType, 'regular');
        assert.equal(d.clockIn, '10:00');
        assert.equal(d.clockOut, '16:00');
    });

    it('día solo especial (baja/festivo) → sin relojes (UI = letra centrada)', () => {
        const d = aggregateLogsForDay([
            {
                clock_in: '2026-07-07T07:00:00.000Z',
                clock_out: '2026-07-07T15:00:00.000Z',
                total_hours: 8,
                event_type: 'adjustment',
            },
        ]);
        assert.equal(d.hasLog, true);
        assert.equal(d.eventType, 'adjustment');
        assert.equal(d.clockIn, null);
        assert.equal(d.clockOut, null);
        assert.equal(d.totalHours, 8);
    });
});

describe('buildEmployeeWeeksFromTimeLogs', () => {
    it('julio 2026: semanas de 7 días; reloj del log en el día Madrid', () => {
        const weeks = buildEmployeeWeeksFromTimeLogs({
            filterYear: 2026,
            filterMonth: 6, // julio
            logs: [
                {
                    clock_in: '2026-07-07T10:27:00.000Z',
                    clock_out: '2026-07-07T18:52:00.000Z',
                    total_hours: 8.4,
                    event_type: 'regular',
                },
            ],
            isPaidByWeek: () => false,
            today: new Date(2026, 6, 21),
        });

        assert.ok(weeks.length >= 4);
        for (const w of weeks) {
            assert.equal(w.days.length, 7);
        }

        const day = weeks.flatMap((w) => w.days).find((d) => d.date === '2026-07-07');
        assert.ok(day);
        assert.equal(day!.hasLog, true);
        assert.equal(day!.clockIn, '12:27');
        assert.equal(day!.clockOut, '20:52');
    });
});
