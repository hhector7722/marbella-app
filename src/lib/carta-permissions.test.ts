import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canEditCartaMenu } from './carta-permissions.ts';

describe('canEditCartaMenu', () => {
    it('manager, admin y supervisor editan la carta', () => {
        assert.equal(canEditCartaMenu('manager'), true);
        assert.equal(canEditCartaMenu('admin'), true);
        assert.equal(canEditCartaMenu('supervisor'), true);
    });

    it('staff no edita la carta', () => {
        assert.equal(canEditCartaMenu('staff'), false);
        assert.equal(canEditCartaMenu(null), false);
    });
});
