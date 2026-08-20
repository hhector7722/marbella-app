/**
 * Heurísticas de escaneo TSX para gates de consumidores Modal (tests).
 */

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function listTsxFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue;
        const full = join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) {
            listTsxFiles(full, acc);
            continue;
        }
        if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx')) continue;
        if (entry.endsWith('.ts') || entry.endsWith('.tsx')) acc.push(full);
    }
    return acc;
}

export function parseTopLevelJsxAttrs(
    source: string,
    tagStart: number
): { attrs: Record<string, string | true>; end: number; selfClosing: boolean } {
    let i = tagStart;
    const n = source.length;
    const attrs: Record<string, string | true> = {};
    while (i < n) {
        while (i < n && /\s/.test(source[i]!)) i += 1;
        if (i >= n) break;
        if (source[i] === '>' || (source[i] === '/' && source[i + 1] === '>')) {
            return {
                attrs,
                end: i,
                selfClosing: source[i] === '/',
            };
        }
        const nameMatch = source.slice(i).match(/^([A-Za-z_][\w]*)/);
        if (!nameMatch) {
            i += 1;
            continue;
        }
        const name = nameMatch[1]!;
        i += name.length;
        while (i < n && /\s/.test(source[i]!)) i += 1;
        if (source[i] === '=') {
            i += 1;
            while (i < n && /\s/.test(source[i]!)) i += 1;
            if (source[i] === '"' || source[i] === "'") {
                const q = source[i]!;
                i += 1;
                const from = i;
                while (i < n && source[i] !== q) i += 1;
                attrs[name] = source.slice(from, i);
                i += 1;
            } else if (source[i] === '{') {
                let depth = 0;
                const from = i;
                while (i < n) {
                    const c = source[i]!;
                    if (c === '"' || c === "'" || c === '`') {
                        const qq = c;
                        i += 1;
                        while (i < n && source[i] !== qq) {
                            if (source[i] === '\\') i += 1;
                            i += 1;
                        }
                        i += 1;
                        continue;
                    }
                    if (c === '{') depth += 1;
                    else if (c === '}') {
                        depth -= 1;
                        if (depth === 0) {
                            attrs[name] = source.slice(from, i + 1);
                            i += 1;
                            break;
                        }
                    }
                    i += 1;
                }
            } else {
                const bare = source.slice(i).match(/^[^\s>/]+/);
                if (bare) {
                    attrs[name] = bare[0]!;
                    i += bare[0]!.length;
                }
            }
        } else {
            attrs[name] = true;
        }
    }
    return { attrs, end: i, selfClosing: false };
}

export function classNameLiteralsFromAttr(value: string | true | undefined): string[] {
    if (value == null || value === true) return [];
    if (!value.startsWith('{')) return [value];
    return [...value.matchAll(/["']([^"']+)["']/g)].map((m) => m[1]!);
}

export function eachModalOpenTag(
    source: string,
    fn: (info: {
        attrs: Record<string, string | true>;
        end: number;
        selfClosing: boolean;
    }) => void
): void {
    const re = /<Modal\b/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(source)) !== null) {
        const nameEnd = match.index + '<Modal'.length;
        fn(parseTopLevelJsxAttrs(source, nameEnd));
    }
}
