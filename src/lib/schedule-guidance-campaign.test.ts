import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { isScheduleGuidanceDate, scheduleGuidanceStaffName } from './schedule-guidance-campaign.ts';

describe('Aviso de uso de notas del 21 y 22 de noviembre de 2026', () => {
    it('solo se muestra para las fechas del horario autorizadas', () => {
        assert.equal(isScheduleGuidanceDate('2026-11-21'), true);
        assert.equal(isScheduleGuidanceDate('2026-11-22'), true);
        assert.equal(isScheduleGuidanceDate('2026-11-20'), false);
        assert.equal(isScheduleGuidanceDate('2026-11-23'), false);
        assert.equal(isScheduleGuidanceDate('2027-11-21'), false);
        assert.equal(isScheduleGuidanceDate(null), false);
    });

    it('solo reconoce las cuentas reales de Bali, Martí y Pau', () => {
        assert.equal(scheduleGuidanceStaffName('c5aed5dd-aa3c-4c21-8eaf-4393ca118dc4'), 'Bali');
        assert.equal(scheduleGuidanceStaffName('40f95fbc-9466-441a-aaea-3fc28044e8d3'), 'Martí');
        assert.equal(scheduleGuidanceStaffName('22cfb522-15db-4933-972d-08d581e038f3'), 'Pau');
        assert.equal(scheduleGuidanceStaffName('baacc78a-b7da-438e-8ea4-c9f3ce6f90e6'), null);
        assert.equal(scheduleGuidanceStaffName(null), null);
    });

    it('Ver como Bali, Martí o Pau muestra el comunicado sin generar push de prueba', () => {
        const root = resolve(import.meta.dirname, '..');
        const notes = readFileSync(resolve(root, 'components/schedule/ScheduleNotesFooter.tsx'), 'utf8');
        assert.match(notes, /const effectiveUserId = identity\?\.isViewingAs \? identity\.effectiveUserId : authUserId/);
        assert.match(notes, /const showUsageGuidance = effectiveUserId === HECTOR_ID[\s\S]*?scheduleGuidanceStaffName\(effectiveUserId\)/);
        assert.doesNotMatch(notes, /!identity\?\.isViewingAs && isScheduleGuidanceDate\(date\)/);
        assert.match(notes, /if \(!date \|\| !authUserId \|\| identity\?\.isViewingAs/);
    });

    it('la push sale de la apertura del modal de día y se protege con la sesión real', () => {
        const root = resolve(import.meta.dirname, '..');
        const notes = readFileSync(resolve(root, 'components/schedule/ScheduleNotesFooter.tsx'), 'utf8');
        const action = readFileSync(resolve(root, 'app/actions/schedule-guidance-open.ts'), 'utf8');
        assert.match(notes, /notifiedOpeningRef\.current === openingKey/);
        assert.match(notes, /!identity\?\.isViewingAs/);
        assert.match(notes, /notifyScheduleGuidanceOpen\(date\)/);
        assert.match(action, /supabase\.auth\.getUser\(\)/);
        assert.match(action, /scheduleGuidanceStaffName\(user\.id\)/);
        assert.match(action, /\.eq\('user_id', recipient\.id\)/);
        assert.match(action, /staffDashboardScheduleUrl\(date\)/);
    });
});
