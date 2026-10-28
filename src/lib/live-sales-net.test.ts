import assert from 'node:assert/strict';
import test from 'node:test';
import { displayedNetSales, liveNetSales } from './live-sales-net.ts';

test('el día en curso muestra la misma venta neta provisional que el widget', () => {
    assert.equal(liveNetSales(571.5), 571.5 / 1.1);
    assert.equal(displayedNetSales({
        isCurrentDay: true, liveGross: 571.5, closingNet: 400, previewGross: null,
    }), liveNetSales(571.5));
});

test('los días anteriores conservan el cierre y no inventan neto sin datos', () => {
    assert.equal(displayedNetSales({
        isCurrentDay: false, liveGross: null, closingNet: 420, previewGross: null,
    }), 420);
    assert.equal(displayedNetSales({
        isCurrentDay: false, liveGross: null, closingNet: null, previewGross: null,
    }), null);
});
