import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveHorizonBounds } from './horizon.ts';

describe('horizon loader helpers', () => {
  it('--week ancla al lunes', () => {
    const h = resolveHorizonBounds({ week: '2026-07-22' });
    assert.equal(h.horizonStart, '2026-07-20');
    assert.deepEqual(h.weekStarts, ['2026-07-20']);
  });

  it('exige from/to o week', () => {
    assert.throws(() => resolveHorizonBounds({}), /Indica --week/);
  });
});
