import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';
import {
    PETROLEUM_SEGMENTED_COMPONENT_ID,
    PETROLEUM_SEGMENTED_DENSITIES,
    PETROLEUM_SEGMENTED_LEGACY_FINGERPRINT,
    isPetroleumSegmentedDensity,
} from './petroleum-segmented.ts';

const REPO_ROOT = process.cwd();
const SRC_ROOT = join(REPO_ROOT, 'src');

function toPosix(p: string): string {
    return p.replace(/\\/g, '/');
}

function listSourceFiles(dir: string, acc: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        if (['node_modules', '.next', '.git'].includes(name)) continue;
        const full = join(dir, name);
        const st = statSync(full);
        if (st.isDirectory()) listSourceFiles(full, acc);
        else if (/\.tsx?$/.test(name) && !name.endsWith('.test.ts') && !name.endsWith('.test.tsx')) {
            acc.push(full);
        }
    }
    return acc;
}

describe('PetroleumSegmented contract', () => {
    it('exporta identidad y densidades cerradas', () => {
        assert.equal(PETROLEUM_SEGMENTED_COMPONENT_ID, 'PetroleumSegmented');
        assert.deepEqual([...PETROLEUM_SEGMENTED_DENSITIES], ['comfortable', 'compact']);
        assert.equal(isPetroleumSegmentedDensity('comfortable'), true);
        assert.equal(isPetroleumSegmentedDensity('compact'), true);
        assert.equal(isPetroleumSegmentedDensity('zinc'), false);
    });

    it('el host declara radiogroup, densidades y opciones radio', () => {
        const source = readFileSync(
            join(SRC_ROOT, 'components/ui/PetroleumSegmented.tsx'),
            'utf8'
        );
        assert.match(source, /data-component=\{PETROLEUM_SEGMENTED_COMPONENT_ID\}/);
        assert.match(source, /data-density=\{density\}/);
        assert.match(source, /role="radiogroup"/);
        assert.match(source, /role="radio"/);
        assert.match(source, /aria-checked=\{selected\}/);
        assert.match(source, /ArrowRight/);
        assert.match(source, /ArrowLeft/);
        assert.doesNotMatch(source, /className=\{/);
        assert.doesNotMatch(source, /data-component=\{BUTTON_COMPONENT_ID\}/);
    });

    it('CSS fija shell, selected, hover, focus-visible y densidades', () => {
        const css = readFileSync(join(SRC_ROOT, 'app/globals.css'), 'utf8');
        assert.match(css, /\[data-component='PetroleumSegmented'\]/);
        assert.match(
            css,
            /\[data-component='PetroleumSegmented'\] \{[\s\S]*?border:\s*1px solid var\(--color-borde\)/,
            'el segmented no usa borde de marca'
        );
        assert.match(css, /border-radius:\s*var\(--espacio-2\)/);
        assert.match(
            css,
            /\[data-component='PetroleumSegmented'\] \[data-element='option'\]\[aria-checked='true'\]/
        );
        assert.match(
            css,
            /\[data-component='PetroleumSegmented'\] \[data-element='option'\]:focus-visible/
        );
        assert.match(
            css,
            /\[data-component='PetroleumSegmented'\]\[data-density='comfortable'\] \[data-element='option'\]/
        );
        assert.match(
            css,
            /\[data-component='PetroleumSegmented'\]\[data-density='compact'\] \[data-element='option'\]/
        );
        assert.match(css, /min-height:\s*var\(--tactil-minimo\)/);
        assert.match(
            css,
            /\[data-component='PetroleumSegmented'\] \[data-element='option'\]\[aria-checked='true'\] \{[\s\S]*?--color-superficie-inactiva/,
            'la opción activa es neutra, no petróleo'
        );
        assert.match(
            css,
            /\[data-component='PageScreen'\] \[data-element='toolbar'\] \[data-component='PetroleumSegmented'\] \[data-element='option'\]\[aria-checked='true'\]/,
            'en PageScreen la pestaña activa lleva relleno blanco'
        );
    });

    it('piloto: Waste, recipes y SubNavVentas usan PetroleumSegmented', () => {
        const pilots = [
            'app/dashboard/inventory/waste/WasteClient.tsx',
            'app/recipes/[id]/page.tsx',
            'components/dashboards/SubNavVentas.tsx',
        ];
        for (const rel of pilots) {
            const source = readFileSync(join(SRC_ROOT, rel), 'utf8');
            assert.match(source, /PetroleumSegmented/, `${rel} debe usar PetroleumSegmented`);
            assert.doesNotMatch(
                source,
                new RegExp(
                    PETROLEUM_SEGMENTED_LEGACY_FINGERPRINT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                ),
                `${rel} no debe conservar la huella legacy`
            );
        }
        const recipes = readFileSync(join(SRC_ROOT, 'app/recipes/[id]/page.tsx'), 'utf8');
        assert.equal(
            (recipes.match(/<PetroleumSegmented/g) || []).length,
            2,
            'recipes/[id] debe tener dos PetroleumSegmented'
        );
    });

    it('ningún fichero nuevo reproduce la huella legacy de segmented petróleo', () => {
        const offenders: string[] = [];
        for (const full of listSourceFiles(SRC_ROOT)) {
            const rel = toPosix(relative(REPO_ROOT, full));
            if (rel.includes('/playground/')) continue;
            if (rel.includes('/design-system/')) continue;
            if (rel === 'src/lib/design-system/petroleum-segmented.ts') continue;
            if (rel === 'src/components/ui/PetroleumSegmented.tsx') continue;
            const source = readFileSync(full, 'utf8');
            if (!source.includes(PETROLEUM_SEGMENTED_LEGACY_FINGERPRINT)) continue;
            offenders.push(rel);
        }
        assert.deepEqual(
            offenders,
            [],
            `Huella PetroleumSegmented legacy:\n${offenders.join('\n')}`
        );
    });
});
