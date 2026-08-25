import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { getStudioElement } from './catalog.ts';
import type { ImpactReport } from './types.ts';

const SKIP_DIR = new Set(['node_modules', '.next', '.git', 'dist', 'coverage']);

function toPosix(path: string): string {
    return path.replace(/\\/g, '/');
}

function listSourceFiles(dir: string, acc: string[] = []): string[] {
    let entries: string[] = [];
    try {
        entries = readdirSync(dir);
    } catch {
        return acc;
    }
    for (const name of entries) {
        if (SKIP_DIR.has(name) || name.startsWith('.')) continue;
        const full = join(dir, name);
        let st;
        try {
            st = statSync(full);
        } catch {
            continue;
        }
        if (st.isDirectory()) {
            listSourceFiles(full, acc);
            continue;
        }
        if (/\.tsx?$/.test(name) && !name.endsWith('.test.ts') && !name.endsWith('.test.tsx')) {
            acc.push(full);
        }
    }
    return acc;
}

function isStudioNoise(rel: string): boolean {
    return (
        rel.includes('/app/design-system/') ||
        rel.includes('/app/playground/') ||
        rel.includes('/lib/design-system/visual-studio/') ||
        rel.includes('/lib/design-system/canon/')
    );
}

export function listAppSourceFiles(repoRoot = process.cwd()): string[] {
    return listSourceFiles(join(repoRoot, 'src'));
}

export { isStudioNoise, toPosix };

export function measureImpact(elementId: string, repoRoot = process.cwd()): ImpactReport {
    const element = getStudioElement(elementId);
    if (!element) {
        return {
            elementId,
            consumers: 0,
            routes: 0,
            variants: 0,
            files: [],
            undetermined: true,
            note: 'Elemento no está en el catálogo del estudio.',
        };
    }
    if (element.impactPatterns.length === 0) {
        return {
            elementId,
            consumers: 0,
            routes: 0,
            variants: 0,
            files: [],
            undetermined: true,
            note: 'Impacto no determinado: no hay patrón de búsqueda fiable.',
        };
    }

    const srcRoot = join(repoRoot, 'src');
    const files = listSourceFiles(srcRoot);
    const hits: string[] = [];
    const variantIds = new Set<string>();

    for (const full of files) {
        const rel = toPosix(relative(repoRoot, full));
        if (isStudioNoise(rel)) continue;
        let source = '';
        try {
            source = readFileSync(full, 'utf8');
        } catch {
            continue;
        }
        const matched = element.impactPatterns.some((pattern) => source.includes(pattern));
        if (!matched) continue;
        hits.push(rel);
        const variantRe = /data-variant=["']([^"']+)["']/g;
        let m: RegExpExecArray | null;
        while ((m = variantRe.exec(source)) !== null) {
            variantIds.add(m[1]!);
        }
    }

    const routes = hits.filter((rel) => rel.startsWith('src/app/')).length;

    return {
        elementId,
        consumers: hits.length,
        routes,
        variants: variantIds.size,
        files: hits.slice(0, 40),
        undetermined: false,
    };
}
