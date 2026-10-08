import assert from 'node:assert/strict';
import test from 'node:test';
import { eligiblePurchaseChangeSources, resolvePurchaseChangeDestination } from './purchase-change.ts';

test('el único destino que aportó dinero queda elegido automáticamente', () => {
    const eligible = eligiblePurchaseChangeSources([
        { id: 'inicial', amount: 12 },
        { id: 'cambio1', amount: 0 },
    ]);
    assert.deepEqual(eligible.map(source => source.id), ['inicial']);
    assert.equal(resolvePurchaseChangeDestination(eligible, null), 'inicial');
});

test('con varias cajas solo se acepta una que haya aportado dinero', () => {
    const eligible = eligiblePurchaseChangeSources([
        { id: 'inicial', amount: 10 },
        { id: 'cambio1', amount: 5 },
        { id: 'cambio2', amount: 0 },
    ]);
    assert.equal(resolvePurchaseChangeDestination(eligible, null), null);
    assert.equal(resolvePurchaseChangeDestination(eligible, 'cambio2'), null);
    assert.equal(resolvePurchaseChangeDestination(eligible, 'cambio1'), 'cambio1');
});

test('una caja TPV real puede recibir cambio si aportó dinero', () => {
    const eligible = eligiblePurchaseChangeSources([{ id: 'tpv-real', amount: 10 }]);
    assert.equal(resolvePurchaseChangeDestination(eligible, null), 'tpv-real');
});

test('los identificadores TPV temporales sin caja real no reciben movimientos', () => {
    const eligible = eligiblePurchaseChangeSources([{ id: 'tpv1', amount: 10 }]);
    assert.deepEqual(eligible, []);
    assert.equal(resolvePurchaseChangeDestination(eligible, null), null);
});
