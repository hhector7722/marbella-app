import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateTortillaUnits } from './tortilla-units.ts';

const formats = [
    { code: 'entero', label: 'Bocadillo entero', portions_per_batch: 7 },
    { code: 'medio', label: 'Medio bocadillo', portions_per_batch: 14 },
    { code: 'pincho', label: 'Pincho', portions_per_batch: 6 },
];

test('una tortilla equivale a 7 enteros, 14 medios o 6 pinchos', () => {
    const total = calculateTortillaUnits(formats, {});
    assert.deepEqual(total.available, { entero: 7, medio: 14, pincho: 6 });
    assert.equal(total.remainingPercent, 100);
});

test('3 pinchos más 7 medios agotan exactamente una tortilla', () => {
    const result = calculateTortillaUnits(formats, { pincho: 3, medio: 7 });
    assert.equal(result.valid, true);
    assert.equal(result.remaining, 0n);
    assert.equal(result.available.entero, 0);
});

test('2 pinchos dejan 9 medios completos, no 10', () => {
    const result = calculateTortillaUnits(formats, { pincho: 2 });
    assert.equal(result.available.medio, 9);
    assert.equal(result.available.entero, 4);
    const invalid = calculateTortillaUnits(formats, { pincho: 2, medio: 10 });
    assert.equal(invalid.valid, false);
    assert.equal(invalid.remaining, 0n);
});

test('las equivalencias se recalculan cuando cambian los formatos configurados', () => {
    const changed = calculateTortillaUnits([
        { code: 'entero', label: 'Bocadillo entero', portions_per_batch: 8 },
        { code: 'medio', label: 'Medio bocadillo', portions_per_batch: 16 },
        { code: 'pincho', label: 'Pincho', portions_per_batch: 4 },
    ], { pincho: 1 });
    assert.equal(changed.available.entero, 6);
    assert.equal(changed.available.medio, 12);
});
