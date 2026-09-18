import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatEventClock } from './format-event-clock.ts';

describe('formatEventClock', () => {
    it('pone h cuando los minutos no son 30', () => {
        assert.equal(formatEventClock('08:00'), '8h');
        assert.equal(formatEventClock('21:00'), '21h');
        assert.equal(formatEventClock('8:00'), '8h');
        assert.equal(formatEventClock('08:15'), '8h');
    });

    it('muestra :30 y no pone h', () => {
        assert.equal(formatEventClock('08:30'), '8:30');
        assert.equal(formatEventClock('21:30'), '21:30');
        assert.equal(formatEventClock('8:30'), '8:30');
    });

    it('compone los tramos del evento', () => {
        assert.equal(`${formatEventClock('08:00')} - ${formatEventClock('21:00')}`, '8h - 21h');
        assert.equal(`${formatEventClock('08:30')} - ${formatEventClock('21:00')}`, '8:30 - 21h');
        assert.equal(`${formatEventClock('08:30')} - ${formatEventClock('21:30')}`, '8:30 - 21:30');
        assert.equal(`${formatEventClock('08:00')} - ${formatEventClock('21:30')}`, '8h - 21:30');
    });
});
