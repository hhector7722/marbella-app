'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/** Pasos Tailwind (grandes → pequeños). Literales estáticos para que JIT los incluya. */
const SIZE_STEPS = [
    'text-[13px]',
    'text-[12px]',
    'text-[11px]',
    'text-[10px]',
    'text-[9px]',
    'text-[8px]',
] as const;

/** Primer paint legible según longitud (antes del measure). */
function initialSizeForLabel(label: string): (typeof SIZE_STEPS)[number] {
    const n = label.length;
    if (n <= 4) return 'text-[13px]'; // Baja
    if (n <= 7) return 'text-[11px]'; // Festivo
    if (n <= 8) return 'text-[10px]'; // Personal
    return 'text-[8px]';
}

export function specialEventFullLabel(eventType: string): string | null {
    switch (eventType) {
        case 'holiday':
            return 'Festivo';
        case 'weekend':
            return 'Enfermo';
        case 'adjustment':
            return 'Baja';
        case 'personal':
            return 'Personal';
        default:
            return null;
    }
}

export function specialEventTextClass(eventType: string): string {
    switch (eventType) {
        case 'holiday':
            return 'text-red-500';
        case 'weekend':
            return 'text-yellow-500';
        case 'adjustment':
            return 'text-orange-500';
        case 'personal':
            return 'text-blue-500';
        default:
            return 'text-zinc-500';
    }
}

/**
 * Nombre completo F/E/B/P centrado en la celda.
 * Elige el mayor text-* que quepa midiendo un probe sin max-width (evita el bug de scrollWidth).
 */
export function SpecialDayLabel({ label, className }: { label: string; className?: string }) {
    const boxRef = useRef<HTMLDivElement>(null);
    const [sizeClass, setSizeClass] = useState<(typeof SIZE_STEPS)[number]>(() => initialSizeForLabel(label));

    useLayoutEffect(() => {
        setSizeClass(initialSizeForLabel(label));
        const box = boxRef.current;
        if (!box) return;

        const fit = () => {
            const maxW = box.clientWidth;
            if (maxW <= 0) return;

            const probe = document.createElement('span');
            probe.setAttribute('aria-hidden', 'true');
            probe.textContent = label;
            box.appendChild(probe);

            let chosen: (typeof SIZE_STEPS)[number] = SIZE_STEPS[SIZE_STEPS.length - 1];
            for (const step of SIZE_STEPS) {
                probe.className = cn(
                    'pointer-events-none absolute left-0 top-0 whitespace-nowrap font-black leading-none tracking-tight opacity-0',
                    step,
                    className,
                );
                if (probe.offsetWidth <= maxW) {
                    chosen = step;
                    break;
                }
            }
            probe.remove();
            setSizeClass(chosen);
        };

        fit();
        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
        ro?.observe(box);
        return () => ro?.disconnect();
    }, [label, className]);

    return (
        <div
            ref={boxRef}
            className="flex h-full min-h-[40px] w-full min-w-0 flex-1 items-center justify-center overflow-hidden px-0.5"
        >
            <span
                className={cn(
                    'whitespace-nowrap text-center font-black leading-none tracking-tight',
                    sizeClass,
                    className,
                )}
            >
                {label}
            </span>
        </div>
    );
}
