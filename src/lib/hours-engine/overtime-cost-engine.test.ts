import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { priceWeekOvertime, MissingOvertimeRateError } from './overtime-cost-engine.ts';

describe('Overtime Cost Engine — priceWeekOvertime (single-rate model)', () => {
  it('simple calculation: netPayable × effectiveOvertimeRate', () => {
    const r = priceWeekOvertime({
      netPayableHours: 5,
      effectiveOvertimeRate: 10,
    });
    assert.equal(r.estimatedValue, 50);
    assert.equal(r.hourlyRate, 10);
  });

  it('effectiveOvertimeRate passed explicitly is used directly', () => {
    const r = priceWeekOvertime({
      netPayableHours: 8,
      effectiveOvertimeRate: 20,
    });
    assert.equal(r.estimatedValue, 160);
    assert.equal(r.hourlyRate, 20);
  });

  it('rate 0 is valid and yields zero value', () => {
    const r = priceWeekOvertime({
      netPayableHours: 5,
      effectiveOvertimeRate: 0,
    });
    assert.equal(r.estimatedValue, 0);
    assert.equal(r.hourlyRate, 0);
  });

  it('zero netPayable returns zero and fallback rate if present', () => {
    const r = priceWeekOvertime({
      netPayableHours: 0,
      effectiveOvertimeRate: 12,
    });
    assert.equal(r.estimatedValue, 0);
    assert.equal(r.hourlyRate, 12);
  });

  it('missing rate with payable hours throws MissingOvertimeRateError', () => {
    assert.throws(
      () =>
        priceWeekOvertime({
          netPayableHours: 5,
          // no effectiveOvertimeRate provided
        }),
      MissingOvertimeRateError,
    );
  });
});

