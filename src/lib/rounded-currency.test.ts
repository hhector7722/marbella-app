import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatRoundedCurrencySpanish } from './rounded-currency.ts';

test('redondea euros sin céntimos en español', () => {
    assert.equal(formatRoundedCurrencySpanish(5010.80), '5.011€');
    assert.equal(formatRoundedCurrencySpanish(4555.27), '4.555€');
    assert.equal(formatRoundedCurrencySpanish(15761.30), '15.761€');
    assert.equal(formatRoundedCurrencySpanish(14146.45), '14.146€');
    assert.equal(formatRoundedCurrencySpanish(0), '0€');
    assert.equal(formatRoundedCurrencySpanish(2.50), '3€');
});
