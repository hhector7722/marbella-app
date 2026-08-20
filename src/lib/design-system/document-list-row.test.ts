import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';
import {
    DOCUMENT_LIST_ROW_COMPONENT_ID,
    DOCUMENT_LIST_ROW_LEGACY_FINGERPRINT,
} from './document-list-row.ts';

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

describe('DocumentListRow contract', () => {
    it('exporta identidad estable', () => {
        assert.equal(DOCUMENT_LIST_ROW_COMPONENT_ID, 'DocumentListRow');
        assert.ok(DOCUMENT_LIST_ROW_LEGACY_FINGERPRINT.includes('text-left'));
    });

    it('el host declara data-component y elementos open/title/trailing', () => {
        const source = readFileSync(
            join(SRC_ROOT, 'components/ui/DocumentListRow.tsx'),
            'utf8'
        );
        assert.match(source, /data-component=\{DOCUMENT_LIST_ROW_COMPONENT_ID\}/);
        assert.match(source, /data-element="open"/);
        assert.match(source, /data-element="title"/);
        assert.match(source, /data-element="subtitle"/);
        assert.match(source, /data-element="trailing"/);
        assert.match(source, /disabled=\{disabled\}/);
        assert.doesNotMatch(source, /data-component=\{BUTTON_COMPONENT_ID\}/);
    });

    it('CSS fija anatomía, táctil, focus-visible y disabled', () => {
        const css = readFileSync(join(SRC_ROOT, 'app/globals.css'), 'utf8');
        assert.match(css, /\[data-component='DocumentListRow'\]/);
        assert.match(css, /\[data-component='DocumentListRow'\] \[data-element='open'\]/);
        assert.match(
            css,
            /\[data-component='DocumentListRow'\] \[data-element='open'\]:focus-visible/
        );
        assert.match(
            css,
            /\[data-component='DocumentListRow'\] \[data-element='open'\]:disabled/
        );
        assert.match(css, /min-height:\s*56px/);
        assert.match(css, /--radio-control/);
        assert.match(css, /--color-texto-tenue/);
        assert.match(css, /--color-texto-fuerte/);
        assert.match(css, /--tactil-minimo|--espacio-4/);
    });

    it('piloto: tres consumidores de documento usan DocumentListRow', () => {
        const pilots = [
            'components/NominasModal.tsx',
            'components/profile/ComunicadosModal.tsx',
            'components/profile/ContratoModal.tsx',
        ];
        for (const rel of pilots) {
            const source = readFileSync(join(SRC_ROOT, rel), 'utf8');
            assert.match(
                source,
                /DocumentListRow/,
                `${rel} debe importar DocumentListRow`
            );
            assert.doesNotMatch(
                source,
                new RegExp(DOCUMENT_LIST_ROW_LEGACY_FINGERPRINT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
                `${rel} no debe conservar la huella legacy inline`
            );
        }
    });

    it('ningún fichero nuevo reproduce la huella legacy de fila de documento', () => {
        const offenders: string[] = [];
        for (const full of listSourceFiles(SRC_ROOT)) {
            const rel = toPosix(relative(REPO_ROOT, full));
            if (rel.includes('/playground/')) continue;
            if (rel === 'src/lib/design-system/document-list-row.ts') continue;
            if (rel === 'src/components/ui/DocumentListRow.tsx') continue;
            const source = readFileSync(full, 'utf8');
            if (!source.includes(DOCUMENT_LIST_ROW_LEGACY_FINGERPRINT)) continue;
            offenders.push(rel);
        }
        assert.deepEqual(
            offenders,
            [],
            `Huella DocumentListRow legacy fuera del host:\n${offenders.join('\n')}`
        );
    });
});
