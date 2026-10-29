import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createStaffClockPreview, parseStaffClockPreview } from './clock-preview.ts';

const userA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const userB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const day = '2026-10-29';
const started = '2026-10-29T06:10:00.000Z';
const finished = '2026-10-29T13:15:00.000Z';

describe('Vista previa segura del fichaje en /staff/dashboard', () => {
    it('usa la forma final de entrada para un día sin fichaje', () => {
        const result = createStaffClockPreview(userA, null, day);
        assert.deepEqual(result, { userId: userA, day, status: 'idle', clockIn: null, clockOut: null });
        assert.deepEqual(parseStaffClockPreview(JSON.stringify(result), userA, day), result);
    });

    it('anticipa el botón de salida y el cronómetro cuando ya hay entrada', () => {
        const result = createStaffClockPreview(userA, { clock_in: started, clock_out: null }, day);
        assert.equal(result.status, 'working');
        assert.equal(result.clockIn, started);
        assert.deepEqual(parseStaffClockPreview(JSON.stringify(result), userA, day), result);
    });

    it('anticipa el botón final cuando ya se ha fichado salida', () => {
        const result = createStaffClockPreview(userA, { clock_in: started, clock_out: finished }, day);
        assert.equal(result.status, 'finished');
        assert.equal(result.clockOut, finished);
        assert.deepEqual(parseStaffClockPreview(JSON.stringify(result), userA, day), result);
    });

    it('descarta la caché de otro empleado y la del día anterior', () => {
        const result = JSON.stringify(createStaffClockPreview(userA, { clock_in: started }, day));
        assert.equal(parseStaffClockPreview(result, userB, day), null);
        assert.equal(parseStaffClockPreview(result, userA, '2026-10-30'), null);
    });

    it('descarta datos inválidos, obsoletos o incompletos', () => {
        assert.equal(parseStaffClockPreview('json inválido', userA, day), null);
        assert.equal(parseStaffClockPreview('null', userA, day), null);
        assert.equal(parseStaffClockPreview(JSON.stringify({ userId: userA, day, status: 'working' }), userA, day), null);
        assert.equal(parseStaffClockPreview(JSON.stringify({ userId: userA, day, status: 'finished', clockIn: started }), userA, day), null);
        assert.equal(parseStaffClockPreview(JSON.stringify({ userId: userA, day, status: 'deleted' }), userA, day), null);
    });
});
