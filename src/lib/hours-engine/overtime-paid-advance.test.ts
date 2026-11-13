import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { settleOvertimePaidAdvance } from './overtime-paid-advance.ts';

describe('Anticipo económico de horas extras', () => {
  it('Silvia: paga 12 € en semana 41 y compensa semana 45 sin nuevos pagos', () => {
    let credit = 0;
    const weeks = [
      { week: '40', grossCost: 0, paidAdvance: 0, expectedCost: 0, expectedCredit: 0 },
      { week: '41', grossCost: 0, paidAdvance: 12, expectedCost: 12, expectedCredit: 12 },
      { week: '42', grossCost: 0, paidAdvance: 0, expectedCost: 0, expectedCredit: 12 },
      { week: '43', grossCost: 0, paidAdvance: 0, expectedCost: 0, expectedCredit: 12 },
      { week: '44', grossCost: 0, paidAdvance: 0, expectedCost: 0, expectedCredit: 12 },
      { week: '45', grossCost: 12, paidAdvance: 0, expectedCost: 0, expectedCredit: 0 },
    ];
    for (const w of weeks) {
      const settlement = settleOvertimePaidAdvance({
        grossCost: w.grossCost,
        paidAdvance: w.paidAdvance,
        creditIn: credit,
      });
      assert.equal(settlement.estimatedValue, w.expectedCost, w.week);
      assert.equal(settlement.creditOut, w.expectedCredit, w.week);
      credit = settlement.creditOut;
    }
    assert.equal(credit, 0);
  });

  it('compensa parcialmente y mantiene exactamente el crédito restante', () => {
    const first = settleOvertimePaidAdvance({ grossCost: 7.75, creditIn: 12, paidAdvance: 0 });
    assert.deepEqual(first, { estimatedValue: 0, creditOut: 4.25, creditUsed: 7.75 });
    const second = settleOvertimePaidAdvance({ grossCost: 10, creditIn: first.creditOut, paidAdvance: 0 });
    assert.deepEqual(second, { estimatedValue: 5.75, creditOut: 0, creditUsed: 4.25 });
  });

  it('sin adelantos no altera el cálculo ordinario y es determinista', () => {
    const input = { grossCost: 18.35, creditIn: 0, paidAdvance: 0 };
    assert.deepEqual(settleOvertimePaidAdvance(input), settleOvertimePaidAdvance(input));
    assert.equal(settleOvertimePaidAdvance(input).estimatedValue, 18.35);
  });

  it('rechaza importes negativos, NaN y créditos sin precio conocido', () => {
    assert.throws(() => settleOvertimePaidAdvance({ grossCost: 12, creditIn: -1, paidAdvance: 0 }));
    assert.throws(() => settleOvertimePaidAdvance({ grossCost: NaN, creditIn: 0, paidAdvance: 0 }));
    assert.throws(() => settleOvertimePaidAdvance({ grossCost: null, creditIn: 12, paidAdvance: 0 }));
  });
});
