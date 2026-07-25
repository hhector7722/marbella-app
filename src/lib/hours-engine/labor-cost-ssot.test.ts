import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { allocatePayrollToNaturalDays } from './payroll-ordinary-daily.ts';

describe('allocatePayrollToNaturalDays', () => {
  it('reparte por días naturales y la suma coincide con la nómina', () => {
    const total = 12111.84;
    const map = allocatePayrollToNaturalDays(total, '2026-06-01', '2026-06-30');
    assert.equal(Object.keys(map).length, 30);
    const sum = Object.values(map).reduce((a, b) => a + b, 0);
    assert.equal(Number(sum.toFixed(2)), total);
    assert.equal(map['2026-06-01'], 403.72);
    assert.equal(map['2026-06-30'], 403.96);
  });

  it('usa días naturales del mes, no días trabajados', () => {
    const map = allocatePayrollToNaturalDays(300, '2026-06-01', '2026-06-30');
    assert.equal(Object.keys(map).length, 30);
    assert.equal(map['2026-06-15'], 10);
  });
});
