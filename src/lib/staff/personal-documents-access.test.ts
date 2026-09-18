import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    canOpenOthersPersonalDocuments,
    canOpenPersonalDocument,
} from './personal-documents-access.ts';

describe('canOpenOthersPersonalDocuments', () => {
    it('manager y admin pueden abrir documentos de otros', () => {
        assert.equal(canOpenOthersPersonalDocuments('manager'), true);
        assert.equal(canOpenOthersPersonalDocuments('admin'), true);
    });

    it('supervisor y staff no pueden abrir documentos de otros', () => {
        assert.equal(canOpenOthersPersonalDocuments('supervisor'), false);
        assert.equal(canOpenOthersPersonalDocuments('staff'), false);
        assert.equal(canOpenOthersPersonalDocuments(null), false);
    });
});

describe('canOpenPersonalDocument', () => {
    it('cualquiera abre los suyos', () => {
        assert.equal(canOpenPersonalDocument('staff', 'u1', 'u1'), true);
        assert.equal(canOpenPersonalDocument('supervisor', 'u1', 'u1'), true);
    });

    it('supervisor no abre los de otro', () => {
        assert.equal(canOpenPersonalDocument('supervisor', 'sup', 'otro'), false);
    });

    it('manager abre los de otro', () => {
        assert.equal(canOpenPersonalDocument('manager', 'mgr', 'otro'), true);
    });
});
