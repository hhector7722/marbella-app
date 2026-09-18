import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    buildScheduleNotePushPayload,
    formatScheduleNoteDayLabel,
    isCivilYmd,
} from './schedule-note-push.ts';

describe('schedule-note-push', () => {
    it('reconoce solo fechas civiles yyyy-MM-dd', () => {
        assert.equal(isCivilYmd('2026-09-20'), true);
        assert.equal(isCivilYmd('20/09/2026'), false);
    });

    it('formatea el día del horario por componentes, no el instante de creación', () => {
        assert.equal(formatScheduleNoteDayLabel('2026-09-20'), 'Domingo 20 sep');
        assert.equal(formatScheduleNoteDayLabel('2026-09-18'), 'Viernes 18 sep');
    });

    it('arma title con el autor y body con día + texto', () => {
        const payload = buildScheduleNotePushPayload({
            authorFirstName: 'Hernan David',
            dateYmd: '2026-09-20',
            content: '  Tengo un compromiso a las 18:00  ',
        });
        assert.equal(payload.title, 'Nota de Hernan');
        assert.equal(payload.body, 'Domingo 20 sep · Tengo un compromiso a las 18:00');
        assert.equal(payload.url, '/staff/dashboard?scheduleDate=2026-09-20');
    });
});
