import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { APP_ICON_REV, withAppIconRev } from './app-icons.ts';

describe('withAppIconRev', () => {
    it('añade revisión a rutas bajo /icons/', () => {
        assert.equal(withAppIconRev('/icons/scan.png'), `/icons/scan.png?v=${APP_ICON_REV}`);
    });

    it('no altera rutas que ya llevan query ni rutas ajenas a /icons/', () => {
        assert.equal(withAppIconRev('/icons/scan.png?v=custom'), '/icons/scan.png?v=custom');
        assert.equal(withAppIconRev('/docs/manuals/foo.png'), '/docs/manuals/foo.png');
    });
});
