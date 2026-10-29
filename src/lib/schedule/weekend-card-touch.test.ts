import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isWeekendCardTap, type WeekendCardTouchPoint } from './weekend-card-touch.ts';

const start: WeekendCardTouchPoint = { pointerId: 7, x: 150, y: 300 };

describe('Pulsación táctil de las tarjetas de sábado y domingo', () => {
    it('acepta un toque normal o ligeramente impreciso', () => {
        assert.equal(isWeekendCardTap(start, { pointerId: 7, x: 150, y: 300 }), true);
        assert.equal(isWeekendCardTap(start, { pointerId: 7, x: 158, y: 310 }), true);
        assert.equal(isWeekendCardTap(start, { pointerId: 7, x: 164, y: 300 }), true);
    });

    it('rechaza un arrastre o desplazamiento del calendario', () => {
        assert.equal(isWeekendCardTap(start, { pointerId: 7, x: 150, y: 315 }), false);
        assert.equal(isWeekendCardTap(start, { pointerId: 7, x: 175, y: 300 }), false);
    });

    it('rechaza cancelaciones y punteros distintos', () => {
        assert.equal(isWeekendCardTap(null, { pointerId: 7, x: 150, y: 300 }), false);
        assert.equal(isWeekendCardTap(start, { pointerId: 8, x: 150, y: 300 }), false);
    });
});
