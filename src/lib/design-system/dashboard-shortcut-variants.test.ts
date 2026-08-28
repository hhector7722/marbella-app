import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    DASHBOARD_SHORTCUT_COMPONENT_ID,
    DASHBOARD_SHORTCUT_VARIANTS,
    resolveDashboardShortcutVariant,
} from './dashboard-shortcut-variants.ts';

describe('DashboardShortcut variantes → composición independiente', () => {
    it('expone el id de componente estable', () => {
        assert.equal(DASHBOARD_SHORTCUT_COMPONENT_ID, 'DashboardShortcut');
    });

    it('lista cerrada de variantes estructurales', () => {
        assert.deepEqual([...DASHBOARD_SHORTCUT_VARIANTS], [
            'icon-text',
            'icon-card-text-outside',
            'separated',
            'icon-only',
            'text-only',
        ]);
    });

    it('icon-text: card en host, iconBox sin card, ambas piezas visibles', () => {
        const c = resolveDashboardShortcutVariant('icon-text');
        assert.equal(c.showText, true);
        assert.equal(c.showIcon, true);
        assert.equal(c.hostSurface, 'card');
        assert.equal(c.iconBoxSurface, 'none');
        assert.equal(c.iconBoxMode, 'none');
        assert.equal(c.layoutDirection, 'vertical');
        assert.equal(c.layoutOrder, 'icon-text');
    });

    it('icon-card-text-outside: host transparente, card en iconBox', () => {
        const c = resolveDashboardShortcutVariant('icon-card-text-outside');
        assert.equal(c.hostSurface, 'transparent');
        assert.equal(c.iconBoxSurface, 'card');
        assert.equal(c.iconBoxMode, 'box');
        assert.equal(c.showText, true);
        assert.equal(c.showIcon, true);
    });

    it('el default de mosaico es icono y nombre separados', () => {
        const source = readFileSync(join(process.cwd(), 'src/components/dashboards/DashboardShortcut.tsx'), 'utf8');
        assert.match(source, /variant = 'icon-card-text-outside'/);
        assert.match(source, /data-plate=\{ios \? \(plate \? 'fill' : 'bleed'\)/);
    });

    it('separated: sin card en host ni iconBox', () => {
        const c = resolveDashboardShortcutVariant('separated');
        assert.equal(c.hostSurface, 'transparent');
        assert.equal(c.iconBoxSurface, 'none');
        assert.equal(c.iconBoxMode, 'none');
    });

    it('icon-only / text-only no usan enum composition legacy', () => {
        const iconOnly = resolveDashboardShortcutVariant('icon-only');
        const textOnly = resolveDashboardShortcutVariant('text-only');
        assert.equal(iconOnly.showText, false);
        assert.equal(iconOnly.showIcon, true);
        assert.equal(textOnly.showText, true);
        assert.equal(textOnly.showIcon, false);
        assert.equal('composition' in iconOnly, false);
        assert.equal('composition' in textOnly, false);
    });
});
