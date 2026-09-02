import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    isLightSurfaceColor,
    parseCssRgba,
    relativeLuminance,
    TABBAR_LIGHT_LUMINANCE,
} from './tabbar-over-surface.ts';

describe('tabbar-over-surface', () => {
    it('parsea rgb y rgba', () => {
        assert.deepEqual(parseCssRgba('rgb(255, 255, 255)'), {
            r: 255,
            g: 255,
            b: 255,
            a: 1,
        });
        assert.deepEqual(parseCssRgba('rgba(11, 28, 54, 0.55)'), {
            r: 11,
            g: 28,
            b: 54,
            a: 0.55,
        });
        assert.deepEqual(parseCssRgba('rgb(255 255 255 / 0.97)'), {
            r: 255,
            g: 255,
            b: 255,
            a: 0.97,
        });
        assert.equal(parseCssRgba('transparent'), null);
    });

    it('el papel blanco es claro; el envolvente no', () => {
        const paper = parseCssRgba('rgb(255 255 255 / 0.97)')!;
        const shell = parseCssRgba('rgb(21, 52, 92)')!;
        assert.ok(relativeLuminance(paper) >= TABBAR_LIGHT_LUMINANCE);
        assert.ok(isLightSurfaceColor(paper));
        assert.ok(relativeLuminance(shell) < TABBAR_LIGHT_LUMINANCE);
        assert.equal(isLightSurfaceColor(shell), false);
    });

    it('el frosted blanco de widgets (a=0.16) no cuenta como papel', () => {
        const frosted = parseCssRgba('rgb(255 255 255 / 0.16)')!;
        assert.equal(isLightSurfaceColor(frosted), false);
    });
});
