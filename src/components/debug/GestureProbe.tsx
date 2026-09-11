'use client';

import { useEffect, useState } from 'react';

const HEADER_SELECTOR = '[aria-label="Guardar horario"]';
const SAVE_SELECTOR = '[data-instance="schedule-day-share-save"]';

function desc(el: Element | null): string {
    if (!el) return 'null';
    const inst = el.getAttribute('data-instance') || el.getAttribute('data-component') || el.getAttribute('aria-label') || '';
    const cls = typeof (el as HTMLElement).className === 'string' ? (el as HTMLElement).className.slice(0, 30) : '';
    return `${el.tagName}${inst ? '[' + inst + ']' : ''}${cls ? '.' + cls.split(/\s+/).slice(0, 2).join('.') : ''}`;
}

function stateOf(sel: string): string {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return `${sel}: (no existe)`;
    const cs = getComputedStyle(el);
    return `${sel}: active=${el.matches(':active')} focus=${el.matches(':focus')} focusVisible=${el.matches(':focus-visible')} hover=${el.matches(':hover')} outline=${cs.outlineStyle}/${cs.outlineWidth}/${cs.outlineColor} bg=${cs.backgroundColor} op=${cs.opacity} tapHighlight=${cs.getPropertyValue('-webkit-tap-highlight-color')}`;
}

type ProbeWindow = Window & { __trace?: string[] };

export function GestureProbe() {
    const [lines, setLines] = useState<string[]>([]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const w = window as ProbeWindow;
        w.__trace = [];
        (w as unknown as { __snapshot: () => string[] }).__snapshot = () => [
            stateOf(HEADER_SELECTOR),
            stateOf(SAVE_SELECTOR),
            `activeElement=${desc(document.activeElement)}`,
        ];
        const push = (s: string) => {
            w.__trace = [...(w.__trace ?? []), s];
            setLines((w.__trace ?? []).slice(-60));
        };
        const handler = (e: Event) => {
            const anyE = e as unknown as {
                clientX?: number; clientY?: number; defaultPrevented?: boolean; detail?: number; pointerId?: number;
                touches?: Array<{ clientX: number; clientY: number }>;
                changedTouches?: Array<{ clientX: number; clientY: number }>;
            };
            const t0 = anyE.touches && anyE.touches[0];
            const c0 = anyE.changedTouches && anyE.changedTouches[0];
            const x = t0 ? t0.clientX : c0 ? c0.clientX : (anyE.clientX ?? -1);
            const y = t0 ? t0.clientY : c0 ? c0.clientY : (anyE.clientY ?? -1);
            const phase = e.eventPhase === 1 ? 'CAP' : e.eventPhase === 2 ? 'AT' : 'BUB';
            const target = e.target as Element;
            let cap = '';
            if (anyE.pointerId != null && target && (target as Element & { hasPointerCapture?: (id: number) => boolean }).hasPointerCapture) {
                cap = ` cap=${(target as Element & { hasPointerCapture: (id: number) => boolean }).hasPointerCapture(anyE.pointerId)}`;
            }
            push(
                `${phase} ${e.type} target=${desc(target)} cur=${desc(e.currentTarget as Element)} xy=${x.toFixed(0)},${y.toFixed(0)} detail=${anyE.detail ?? '-'} prevented=${anyE.defaultPrevented ?? '-'} pid=${anyE.pointerId ?? '-'}${cap} activeEl=${desc(document.activeElement)}`
            );
            push(`   HEADER ${stateOf(HEADER_SELECTOR)}`);
            push(`   SAVE   ${stateOf(SAVE_SELECTOR)}`);
        };
        const types = ['pointerdown', 'pointerup', 'click', 'touchstart', 'touchend', 'focusin', 'focusout'];
        for (const t of types) {
            document.addEventListener(t, handler, true);
            document.addEventListener(t, handler, false);
        }
        const selHandler = (e: Event) => {
            const sel = document.getSelection ? String(document.getSelection()) : '';
            push(`SELECTION ${e.type} "${sel.slice(0, 60)}"`);
        };
        document.addEventListener('selectionchange', selHandler);
        document.addEventListener('selectstart', selHandler);
        const snap = () => push('SNAPSHOT ' + stateOf(HEADER_SELECTOR));
        (w as unknown as { __snap: () => void }).__snap = snap;
        snap();
        return () => {
            for (const t of types) {
                document.removeEventListener(t, handler, true);
                document.removeEventListener(t, handler, false);
            }
            document.removeEventListener('selectionchange', selHandler);
            document.removeEventListener('selectstart', selHandler);
        };
    }, []);

    return (
        <div
            style={{
                position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 2147483647, maxHeight: '50vh',
                overflow: 'auto', background: 'rgba(0,0,0,0.9)', color: '#7CFC00', fontSize: 9,
                lineHeight: 1.25, fontFamily: 'monospace', padding: 4, pointerEvents: 'none',
            }}
        >
            {lines.map((l, i) => (<div key={i}>{l}</div>))}
        </div>
    );
}
