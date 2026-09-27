import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseBreakdownCounts } from './quick-breakdown-draft.ts';

const DENOMS = [100, 0.5, 0.01] as const;

describe('borrador del desglose', () => {
    it('conserva solo cantidades enteras de monedas conocidas', () => {
        const counts = parseBreakdownCounts(
            { '100': 2, '0.5': 4, '0.01': 3, '7': 9 },
            DENOMS,
        );
        assert.deepEqual(counts, { 100: 2, 0.5: 4, 0.01: 3 });
    });

    it('descarta ceros, negativos y basura', () => {
        const counts = parseBreakdownCounts(
            { '100': 0, '0.5': -1, '0.01': 1.5, nope: 'x' },
            DENOMS,
        );
        assert.deepEqual(counts, {});
    });

    it('un valor ausente o ilegible queda vacío', () => {
        assert.deepEqual(parseBreakdownCounts(null, DENOMS), {});
        assert.deepEqual(parseBreakdownCounts('12', DENOMS), {});
    });
});