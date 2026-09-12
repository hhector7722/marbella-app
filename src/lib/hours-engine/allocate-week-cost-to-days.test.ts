import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { allocateWeekCostToDays } from './allocate-week-cost-to-days.ts';

describe('allocateWeekCostToDays', () => {
  it('reparte el importe por pesos de extras y la suma coincide', () => {
    const map = allocateWeekCostToDays(
      { '2026-07-20': 2, '2026-07-21': 2, '2026-07-22': 0 },
      40,
      '2026-07-20',
      '2026-07-26',
    );
    assert.equal(map['2026-07-20'], 20);
    assert.equal(map['2026-07-21'], 20);
    const sum = Object.values(map).reduce((a, b) => a + b, 0);
    assert.equal(sum, 40);
  });

  it('sin extras diarias deja el importe en el lunes', () => {
    const map = allocateWeekCostToDays({}, 12.5, '2026-07-20', '2026-07-26');
    assert.equal(map['2026-07-20'], 12.5);
  });
});
