import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { countWorkersByHour } from './hourly-coverage.ts';

describe('Totales de trabajadores por hora del día', () => {
    it('cuenta coincidencias en cada columna de hora', () => {
        const shifts = [
            { start: '07:00', end: '10:00' },
            { start: '08:00', end: '09:00' },
            { start: '09:00', end: '10:00' },
        ];
        assert.deepEqual(countWorkersByHour(shifts, [7, 8, 9, 10]), [1, 2, 2, 0]);
    });

    it('cuenta turnos de media hora solamente en los intervalos que cubren', () => {
        assert.deepEqual(countWorkersByHour([
            { start: '07:30', end: '08:30' },
            { start: '08:00', end: '08:30' },
            { start: '08:30', end: '09:00' },
        ], [7, 8, 9]), [1, 3, 0]);
    });

    it('excluye turnos inactivos e inválidos y admite fin tras medianoche', () => {
        assert.deepEqual(countWorkersByHour([
            { start: '21:30', end: '00:30' },
            { start: '21:00', end: '23:00', active: false },
            { start: '', end: '23:00' },
            { start: '07:00', end: '07:00' },
        ], [20, 21, 22]), [0, 1, 1]);
    });
});
