'use client';

import { useRef } from 'react';
import { Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

function parseInput(value: string): Date {
    if (!value) return new Date();
    const [datePart, timePart] = value.split('T');
    const [y, m, d] = datePart.split('-').map(Number);
    const [hh, mm] = (timePart || '00:00').split(':').map(Number);
    return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0);
}

export function formatCashCountDateInput(date = new Date()): string {
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function CashCountDateButton({
    value,
    onChange,
}: {
    value: string;
    onChange: (next: string) => void;
}) {
    const ref = useRef<HTMLInputElement>(null);
    const parsed = parseInput(value);

    return (
        <button
            type="button"
            className="relative flex h-full min-h-ds-tactil items-center gap-1.5 border-0 bg-transparent p-0 text-left text-inherit outline-none hover:opacity-90"
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
            <Calendar size={14} className="shrink-0 opacity-80" aria-hidden />
            <span className="max-w-[9.5rem] truncate text-[10px] font-black uppercase tracking-wide sm:max-w-none">
                {format(parsed, "d MMM HH:mm", { locale: es })}
            </span>
            <input
                ref={ref}
                type="datetime-local"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="absolute inset-0 min-h-ds-tactil min-w-ds-tactil cursor-pointer opacity-0"
                aria-label="Fecha del recuento"
            />
        </button>
    );
}
