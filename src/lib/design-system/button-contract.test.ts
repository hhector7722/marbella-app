import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

import { DS_SCREEN_TOKENS } from './tokens.ts';
import {
    BUTTON_COMPONENT_ID,
    BUTTON_CONTRACT,
    BUTTON_FORBIDDEN_VARIANTS,
    BUTTON_LAYOUTS,
    BUTTON_VARIANTS,
    hasVisibleButtonLabel,
    isButtonLayout,
    isButtonVariant,
    pickButtonLayoutClassName,
    resolveButtonAccessibleName,
} from './button-contract.ts';

const REPO_ROOT = process.cwd();
const SRC_ROOT = join(REPO_ROOT, 'src');
const BUTTON_SOURCE = join(SRC_ROOT, 'components/ui/button.tsx');
const ACTION_BUTTON_SOURCE = join(SRC_ROOT, 'components/ui/ActionButton.tsx');
const GLOBALS_CSS = join(SRC_ROOT, 'app/globals.css');

const PILOT_FOOTER_HOSTS = [
    'src/app/dashboard/albaranes/AlbaranesHistoricoClient.tsx',
    'src/components/albaranes/LineEditModal.tsx',
    'src/components/albaranes/LineMappingModal.tsx',
    'src/components/CashChangeModal.tsx',
    'src/components/CashClosingModal.tsx',
    'src/components/MovementDetailModal.tsx',
    'src/components/ledger/ManagerLedgerView.tsx',
    'src/components/modals/CashBoxEditModal.tsx',
] as const;

function toPosix(path: string): string {
    return path.split('\\').join('/');
}

function listSourceFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue;
        const full = join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) {
            listSourceFiles(full, acc);
            continue;
        }
        if (entry.endsWith('.ts') || entry.endsWith('.tsx')) acc.push(full);
    }
    return acc;
}

describe('Button identidad y variantes', () => {
    it('id de componente estable', () => {
        assert.equal(BUTTON_COMPONENT_ID, 'Button');
    });

    it('lista cerrada de variantes aprobadas', () => {
        assert.deepEqual([...BUTTON_VARIANTS], [
            'primary',
            'secondary',
            'tertiary',
            'destructive',
        ]);
    });

    it('layout hug/fill no son variantes semánticas', () => {
        assert.deepEqual([...BUTTON_LAYOUTS], ['hug', 'fill']);
        assert.equal(isButtonLayout('hug'), true);
        assert.equal(isButtonLayout('fill'), true);
        assert.equal(isButtonVariant('hug'), false);
        assert.equal(isButtonVariant('fill'), false);
        assert.equal(isButtonVariant('icon-only'), false);
    });

    it('no existen variantes emerald/purple/ghost/danger/success', () => {
        for (const forbidden of BUTTON_FORBIDDEN_VARIANTS) {
            assert.equal(isButtonVariant(forbidden), false, forbidden);
        }
        const source = readFileSync(BUTTON_SOURCE, 'utf8');
        assert.equal(source.includes("'emerald'"), false);
        assert.equal(source.includes("'purple'"), false);
        assert.equal(source.includes("'ghost'"), false);
        assert.equal(source.includes("'danger'"), false);
        assert.equal(source.includes('iconPosition'), false);
        assert.equal(source.includes('fontSize'), false);
        assert.equal(source.includes('loadingColor'), false);
    });

    it('tokens dimensionales y de color del contrato', () => {
        assert.equal(BUTTON_CONTRACT.height, DS_SCREEN_TOKENS.tactilMinimo);
        assert.equal(BUTTON_CONTRACT.height, '48px');
        assert.equal(BUTTON_CONTRACT.radius, DS_SCREEN_TOKENS.radioSuperficie);
        assert.equal(BUTTON_CONTRACT.radius, '16px');
        assert.equal(DS_SCREEN_TOKENS.radioSuperficie, '16px');
        assert.equal(BUTTON_CONTRACT.paddingInline, DS_SCREEN_TOKENS.espacio2);
        assert.equal(BUTTON_CONTRACT.visualPaddingBlock, DS_SCREEN_TOKENS.espacio3);
        assert.equal(BUTTON_CONTRACT.visualHeight, '36px');
        assert.equal(BUTTON_CONTRACT.defaultLayout, 'hug');
        assert.equal(BUTTON_CONTRACT.fontSize, '12px');
        assert.equal(BUTTON_CONTRACT.fontWeight, '800');
        assert.equal(BUTTON_CONTRACT.iconSlot, 'start');
        assert.equal(DS_SCREEN_TOKENS.colorMarca, '#36606F');
        assert.equal(DS_SCREEN_TOKENS.colorMarcaIntenso, '#2F5D6A');
        assert.equal(DS_SCREEN_TOKENS.colorNegativo, '#E11D48');
        assert.equal(DS_SCREEN_TOKENS.colorNegativoFondo, '#FFF1F2');
        assert.equal(DS_SCREEN_TOKENS.espacio2, '8px');
        assert.equal(DS_SCREEN_TOKENS.espacio3, '12px');
        assert.equal(DS_SCREEN_TOKENS.espacio4, '16px');
        const visualPx = Number.parseInt(BUTTON_CONTRACT.visualHeight, 10);
        const radiusPx = Number.parseInt(BUTTON_CONTRACT.radius, 10);
        assert.ok(visualPx > radiusPx * 2, 'el fondo compacto debe superar 2× radio.superficie');
        assert.ok(visualPx > 32);
        assert.notEqual(BUTTON_CONTRACT.visualHeight, '28px');
    });
});

describe('Button accesibilidad e icon-only', () => {
    it('icono a la izquierda: el contrato no admite slot end', () => {
        assert.equal(BUTTON_CONTRACT.iconSlot, 'start');
    });

    it('icon-only exige aria-label', () => {
        const missing = resolveButtonAccessibleName({
            hasLabel: false,
            hasIcon: true,
        });
        assert.equal(missing.ok, false);
        if (!missing.ok) assert.equal(missing.reason, 'icon-only-requires-aria-label');

        const ok = resolveButtonAccessibleName({
            hasLabel: false,
            hasIcon: true,
            ariaLabel: 'Cerrar',
        });
        assert.equal(ok.ok, true);
        if (ok.ok) assert.equal(ok.iconOnly, true);
    });

    it('con etiqueta no es icon-only', () => {
        const named = resolveButtonAccessibleName({
            hasLabel: true,
            hasIcon: true,
        });
        assert.equal(named.ok, true);
        if (named.ok) assert.equal(named.iconOnly, false);
        assert.equal(hasVisibleButtonLabel('Guardar'), true);
        assert.equal(hasVisibleButtonLabel('   '), false);
        assert.equal(hasVisibleButtonLabel(null), false);
    });

    it('vacío sin nombre es error', () => {
        const empty = resolveButtonAccessibleName({
            hasLabel: false,
            hasIcon: false,
        });
        assert.equal(empty.ok, false);
        if (!empty.ok) assert.equal(empty.reason, 'empty-requires-name');
    });
});

describe('Button className no escapa del contrato visual', () => {
    it('conserva composición/layout y descarta visual', () => {
        const kept = pickButtonLayoutClassName(
            'flex-1 shrink-0 self-end w-full relative h-10 min-h-[40px] rounded-2xl bg-emerald-500 text-white font-black hover:bg-purple-600 disabled:opacity-20 px-8'
        );
        assert.equal(kept, 'flex-1 shrink-0 self-end w-full relative');
        assert.equal(kept.includes('h-10'), false);
        assert.equal(kept.includes('rounded'), false);
        assert.equal(kept.includes('bg-'), false);
        assert.equal(kept.includes('text-white'), false);
        assert.equal(kept.includes('font-black'), false);
        assert.equal(kept.includes('hover:'), false);
        assert.equal(kept.includes('disabled:'), false);
        assert.equal(kept.includes('px-8'), false);
    });

    it('el CSS del contrato fija 48px, padding compacto, radio.superficie 16px, focus-visible y estados', () => {
        const css = readFileSync(GLOBALS_CSS, 'utf8');
        assert.match(css, /\[data-component='Button'\]/);
        assert.match(css, /height:\s*var\(--tactil-minimo\)/);
        assert.match(css, /min-height:\s*var\(--tactil-minimo\)/);
        assert.match(css, /padding-inline:\s*var\(--espacio-2\)/);
        assert.match(css, /\[data-component='Button'\]::before/);
        const compactBefore = css.match(
            /\[data-component='Button'\]::before \{([^}]+)\}/
        );
        assert.ok(compactBefore, 'debe existir la receta ::before compacta');
        assert.match(compactBefore[1], /height:\s*calc\(12px \+ var\(--espacio-3\) \* 2\)/);
        assert.equal(compactBefore[1].includes('28px'), false);
        assert.equal(
            /height:\s*calc\(12px \+ var\(--espacio-2\) \* 2\)/.test(compactBefore[1]),
            false
        );
        assert.match(
            css,
            /\[data-component='Button'\]\[data-icon-only='true'\]::before \{[\s\S]*?inset:\s*0/
        );
        assert.match(css, /\[data-layout='hug'\]/);
        assert.match(css, /width:\s*fit-content/);
        assert.match(css, /\[data-layout='fill'\]/);
        assert.match(css, /width:\s*100%/);
        assert.match(
            css,
            /\[data-component='Button'\] \{[\s\S]*?border-radius:\s*var\(--radio-superficie\)/
        );
        assert.match(
            css,
            /\[data-component='Button'\]::before \{[\s\S]*?border-radius:\s*var\(--radio-superficie\)/
        );
        assert.equal(
            /\[data-component='Button'\][^{]*\{[^}]*border-radius:\s*var\(--radio-control\)/.test(css),
            false
        );
        assert.match(css, /font-size:\s*12px/);
        assert.match(css, /font-weight:\s*800/);
        assert.match(css, /text-transform:\s*uppercase/);
        assert.match(css, /\[data-variant='primary'\]:hover:not\(:disabled\)::before/);
        assert.match(css, /--color-marca-intenso/);
        assert.match(css, /\[data-component='Button'\]:focus-visible/);
        assert.match(css, /outline:\s*2px solid var\(--color-marca\)/);
        assert.match(css, /\[data-component='Button'\]:disabled/);
        assert.match(css, /opacity:\s*0\.5/);
        assert.match(css, /cursor:\s*not-allowed/);
        assert.match(css, /transform:\s*scale\(0\.95\)/);
        assert.match(css, /\[data-icon-only='true'\]/);
        assert.equal(css.includes('[data-variant=\'emerald\']'), false);
        assert.equal(css.includes('[data-variant=\'ghost\']'), false);
    });

    it('default de layout es hug en el componente', () => {
        const source = readFileSync(BUTTON_SOURCE, 'utf8');
        assert.match(source, /layout\s*=\s*['"]hug['"]/);
    });

    it('el componente emite identidad y no reenvía style', () => {
        const source = readFileSync(BUTTON_SOURCE, 'utf8');
        assert.match(source, /data-component=\{BUTTON_COMPONENT_ID\}/);
        assert.match(source, /data-variant=\{variant\}/);
        assert.match(source, /data-instance=\{instance\}/);
        assert.match(source, /aria-busy=\{busy/);
        assert.equal(/\bstyle=/.test(source), false);
        assert.match(source, /pickButtonLayoutClassName\(className\)/);
        assert.match(source, /data-element="icon"/);
        assert.match(source, /data-element="label"/);
        assert.match(source, /data-element="spinner"/);
        assert.match(source, /icon\?:/);
    });
});

describe('ActionButton retirado', () => {
    it('el fichero ya no existe', () => {
        assert.equal(existsSync(ACTION_BUTTON_SOURCE), false);
    });

    it('ningún import residual en src/', () => {
        const offenders: string[] = [];
        for (const full of listSourceFiles(SRC_ROOT)) {
            if (full.endsWith('.test.ts') || full.endsWith('.test.tsx')) continue;
            const source = readFileSync(full, 'utf8');
            if (/ActionButton/.test(source)) {
                offenders.push(toPosix(relative(REPO_ROOT, full)));
            }
        }
        assert.deepEqual(offenders, []);
    });
});

function extractFooterJsx(source: string, start: number): string {
    const eq = source.indexOf('=', start);
    let i = eq + 1;
    while (i < source.length && /\s/.test(source[i])) i += 1;
    if (source[i] !== '{') return source.slice(start, start + 200);
    let depth = 0;
    const from = i;
    for (; i < source.length; i++) {
        const c = source[i];
        if (c === '{') depth += 1;
        else if (c === '}') {
            depth -= 1;
            if (depth === 0) return source.slice(from, i + 1);
        }
    }
    return source.slice(from);
}

function extractJsxOpenTag(source: string, start: number): string {
    let quote: string | null = null;
    let brace = 0;
    for (let i = start; i < source.length; i++) {
        const c = source[i];
        if (quote) {
            if (c === quote && source[i - 1] !== '\\') quote = null;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') {
            quote = c;
            continue;
        }
        if (c === '{') brace += 1;
        else if (c === '}') brace -= 1;
        else if (c === '>' && brace === 0) return source.slice(start, i + 1);
    }
    return source.slice(start);
}

function assertFooterButtonsHaveNoIcon(rel: string, chunk: string): void {
    let searchFrom = 0;
    let found = 0;
    while (true) {
        const idx = chunk.indexOf('<Button', searchFrom);
        if (idx < 0) break;
        found += 1;
        const tag = extractJsxOpenTag(chunk, idx);
        assert.equal(
            /\bicon\s*=/.test(tag),
            false,
            `${rel} footer Button lleva icon\n${tag.slice(0, 400)}`
        );
        searchFrom = idx + 7;
    }
    assert.ok(found > 0, `${rel} footer debe usar <Button>`);
}

describe('Piloto Button en footers oficiales', () => {
    it('los hosts del piloto importan Button y no dejan <button> ni icon en footer=', () => {
        for (const rel of PILOT_FOOTER_HOSTS) {
            const source = readFileSync(join(REPO_ROOT, rel), 'utf8');
            assert.match(
                source,
                /from ['"]@\/components\/ui\/button['"]/,
                `${rel} debe importar Button`
            );
            let searchFrom = 0;
            let found = 0;
            while (true) {
                const idx = source.indexOf('footer=', searchFrom);
                if (idx < 0) break;
                found += 1;
                const chunk = extractFooterJsx(source, idx);
                assert.equal(
                    /<button\b/.test(chunk),
                    false,
                    `${rel} footer aún contiene <button>\n${chunk.slice(0, 400)}`
                );
                assertFooterButtonsHaveNoIcon(rel, chunk);
                searchFrom = idx + 7;
            }
            assert.ok(found > 0, `${rel} no tiene footer=`);
        }
    });

    it('ningún Button de footer= en consumidores de Modal lleva icon', () => {
        const offenders: string[] = [];
        for (const full of listSourceFiles(SRC_ROOT)) {
            if (full.endsWith('.test.ts') || full.endsWith('.test.tsx')) continue;
            const rel = toPosix(relative(REPO_ROOT, full));
            if (rel === 'src/components/ui/modal.tsx') continue;
            const source = readFileSync(full, 'utf8');
            if (!/from ['"]@\/components\/ui\/modal['"]/.test(source)) continue;
            if (!source.includes('footer=')) continue;
            let searchFrom = 0;
            while (true) {
                const idx = source.indexOf('footer=', searchFrom);
                if (idx < 0) break;
                const chunk = extractFooterJsx(source, idx);
                let buttonFrom = 0;
                while (true) {
                    const buttonIdx = chunk.indexOf('<Button', buttonFrom);
                    if (buttonIdx < 0) break;
                    const tag = extractJsxOpenTag(chunk, buttonIdx);
                    if (/\bicon\s*=/.test(tag)) {
                        offenders.push(`${rel}: ${tag.replace(/\s+/g, ' ').slice(0, 160)}`);
                    }
                    buttonFrom = buttonIdx + 7;
                }
                searchFrom = idx + 7;
            }
        }
        assert.deepEqual(offenders, []);
    });

    it('fill retenido solo en CTAs de jerarquía explícita (Caja)', () => {
        const cashChange = readFileSync(
            join(REPO_ROOT, 'src/components/CashChangeModal.tsx'),
            'utf8'
        );
        const cashClosing = readFileSync(
            join(REPO_ROOT, 'src/components/CashClosingModal.tsx'),
            'utf8'
        );
        assert.equal((cashChange.match(/layout="fill"/g) || []).length, 2);
        assert.equal((cashClosing.match(/layout="fill"/g) || []).length, 1);
        for (const rel of PILOT_FOOTER_HOSTS) {
            if (rel.includes('CashChange') || rel.includes('CashClosing')) continue;
            const source = readFileSync(join(REPO_ROOT, rel), 'utf8');
            assert.equal(
                source.includes('layout="fill"'),
                false,
                `${rel} no debe forzar fill por defecto`
            );
        }
    });
});
