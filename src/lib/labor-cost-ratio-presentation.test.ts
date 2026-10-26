import assert from 'node:assert/strict';
import { test } from 'node:test';
import { laborRatioBand } from './labor-cost-ratio-presentation.ts';

test('clasifica los costes diarios sobre ventas con límites inclusivos', () => {
    assert.equal(laborRatioBand(0), 'good');
    assert.equal(laborRatioBand(25), 'good');
    assert.equal(laborRatioBand(25.01), 'attention');
    assert.equal(laborRatioBand(35), 'attention');
    assert.equal(laborRatioBand(35.01), 'high');
    assert.equal(laborRatioBand(50), 'high');
    assert.equal(laborRatioBand(50.01), 'critical');
    assert.equal(laborRatioBand(150), 'critical');
});

test('no da color de rendimiento a un porcentaje que no existe', () => {
    assert.equal(laborRatioBand(null), 'unavailable');
    assert.equal(laborRatioBand(Number.NaN), 'unavailable');
    assert.equal(laborRatioBand(Infinity), 'unavailable');
    assert.equal(laborRatioBand(-2), 'unavailable');
});
