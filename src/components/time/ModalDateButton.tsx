'use client';

import { useRef } from 'react';
import { Calendar } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

function parseDate(value: string): Date {
    if (!value) return new Date();
    const d = parseISO(value);
    return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** Fecha (solo día) en cabecera de Modal, mismo gesto que el recuento. */
export function ModalDateButton({
    value,
    onChange,
    ariaLabel = 'Fecha',
}: {
    value: string;
    onChange: (next: string) => void;
    ariaLabel?: string;
}) {
    const ref = useRef<HTMLInputElement>(null);
    const parsed = parseDate(value);

    return (
        <button
            type="button"
            className="relative flex h-full min-h-ds-tactil items-center gap-1.5 border-0 bg-transparent p-0 text-left text-white outline-none hover:opacity-90"
            onClick={() => {
                const el = ref.current;
                if (!el) return;
                const picker = el as HTMLInputElement & { showPicker?: () => void };
                if (typeof picker.showPicker === 'function') picker.showPicker();
                else {
                    el.focus();
                    el.click();
                }
            }}
        >
            <Calendar size={14} className="shrink-0 text-white/80" aria-hidden />
            <span className="max-w-[9.5rem] truncate text-[10px] font-black uppercase tracking-wide sm:max-w-none">
                {format(parsed, 'd MMM yyyy', { locale: es })}
            </span>
            <input
                ref={ref}
                type="date"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="absolute inset-0 min-h-ds-tactil min-w-ds-tactil cursor-pointer opacity-0"
                aria-label={ariaLabel}
            />
        </button>
    );
}
