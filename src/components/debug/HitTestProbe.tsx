'use client';

import { useEffect, useState } from 'react';

function fmt(el: Element | null): string {
    if (!el) return 'null';
    const inst = el.getAttribute?.('data-instance') || el.getAttribute?.('data-component') || '';
    const cls = typeof (el as HTMLElement).className === 'string' ? (el as HTMLElement).className.slice(0, 40) : '';
    return `${el.tagName}${inst ? '[' + inst + ']' : ''}${cls ? '.' + cls.replace(/\s+/g, '.') : ''}`;
}

function describePoint(x: number, y: number): string {
    return document
        .elementsFromPoint(x, y)
        .slice(0, 8)
        .map(fmt)
        .join(' > ');
}

type ProbeWindow = Window & { __hittest?: string[]; __shareClick?: unknown };

export function HitTestProbe() {
    const [lines, setLines] = useState<string[]>([]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const w = window as ProbeWindow;
        w.__hittest = [];
        const push = (s: string) => {
            w.__hittest = [...(w.__hittest ?? []), s];
            try {
                console.log('[HITTEST]', s);
            } catch {}
        };
        const handler = (e: Event) => {
            const anyE = e as unknown as {
                touches?: Array<{ clientX: number; clientY: number }>;
                changedTouches?: Array<{ clientX: number; clientY: number }>;
                clientX?: number;
                clientY?: number;
            };
            let x = -1;
            let y = -1;
            const t0 = anyE.touches && anyE.touches[0];
            const c0 = anyE.changedTouches && anyE.changedTouches[0];
            if (t0) {
                x = t0.clientX;
                y = t0.clientY;
            } else if (c0) {
                x = c0.clientX;
                y = c0.clientY;
            } else if (typeof anyE.clientX === 'number' && typeof anyE.clientY === 'number') {
                x = anyE.clientX;
                y = anyE.clientY;
            }
            const phase = e.eventPhase === 1 ? 'CAP' : e.eventPhase === 2 ? 'AT' : 'BUB';
            push(
                `${phase} ${e.type} target=${fmt(e.target as Element)} point=${x.toFixed(0)},${y.toFixed(0)} fromPoint=[${describePoint(x, y)}]`
            );
            if (w.__shareClick) push(`shareClick=${JSON.stringify(w.__shareClick)}`);
            setLines((w.__hittest ?? []).slice(-30));
        };
        const types = ['pointerdown', 'pointerup', 'click', 'touchstart', 'touchend'];
        for (const t of types) {
            document.addEventListener(t, handler, true);
            document.addEventListener(t, handler, false);
        }
        return () => {
            for (const t of types) {
                document.removeEventListener(t, handler, true);
                document.removeEventListener(t, handler, false);
            }
        };
    }, []);

    return (
        <div
            style={{
                position: 'fixed',
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 2147483647,
                maxHeight: '45vh',
                overflow: 'auto',
                background: 'rgba(0,0,0,0.88)',
                color: '#7CFC00',
                fontSize: 9,
                lineHeight: 1.25,
                fontFamily: 'monospace',
                padding: 4,
                pointerEvents: 'none',
            }}
        >
            {lines.map((l, i) => (
                <div key={i}>{l}</div>
            ))}
        </div>
    );
}
