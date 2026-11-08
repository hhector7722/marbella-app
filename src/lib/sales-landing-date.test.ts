import assert from 'node:assert/strict';
import { test } from 'node:test';
import { salesLandingDate, salesLandingPolicy } from './sales-landing-date.ts';

test('Fogo Torrat y Sergio siempre entran por el último cierre', () => {
    for (const email of ['fogotorrat@gmail.com', 'sergioferrercervero@gmail.com', ' SERGIOFERRERCERVERO@GMAIL.COM ']) {
        const policy = salesLandingPolicy(email);
        assert.equal(policy, 'last-closing');
        assert.equal(salesLandingDate(policy, '2026-11-08', '2026-11-07', true), '2026-11-07');
        assert.equal(salesLandingDate(policy, '2026-11-08', '2026-11-07', false), '2026-11-07');
    }
});

test('Héctor entra por hoy solo cuando existen ventas hoy', () => {
    const policy = salesLandingPolicy('hhector7722@gmail.com');
    assert.equal(policy, 'today-if-sales');
    assert.equal(salesLandingDate(policy, '2026-11-08', '2026-11-07', true), '2026-11-08');
    assert.equal(salesLandingDate(policy, '2026-11-08', '2026-11-07', false), '2026-11-07');
});

test('Otras cuentas conservan la elección de fecha preexistente', () => {
    assert.equal(salesLandingPolicy('otra@example.com'), 'existing');
    assert.equal(salesLandingPolicy(null), 'existing');
});

test('Sin cierres previos no se construye una fecha inexistente', () => {
    assert.equal(salesLandingDate('last-closing', '2026-11-08', null, false), '2026-11-08');
    assert.equal(salesLandingDate('today-if-sales', '2026-11-08', null, false), '2026-11-08');
});
