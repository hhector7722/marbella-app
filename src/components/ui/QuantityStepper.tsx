'use client';

import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export function QuantityStepper({
    value,
    onChange,
    raw,
    onRawChange,
    onBlur,
    step = 1,
    min = 0,
    max,
    inputMode,
    suffix,
    bottomText,
    ariaLabel,
    disabled = false,
    className,
}: {
    value: number;
    onChange: (n: number) => void;
    raw?: string;
    onRawChange?: (s: string) => void;
    onBlur?: () => void;
    step?: number;
    min?: number;
    max?: number;
    inputMode?: 'numeric' | 'decimal';
    suffix?: string;
    bottomText?: string;
    ariaLabel: string;
    disabled?: boolean;
    className?: string;
}) {
    const display = raw !== undefined ? raw : value ? String(value) : '';
    const mode = inputMode ?? (step < 1 ? 'decimal' : 'numeric');

    const clamp = (n: number) => {
        let next = Number.isFinite(n) ? n : min;
        next = Math.max(min, next);
        if (max != null) next = Math.min(max, next);
        return next;
    };

    const commitRaw = (nextRaw: string) => {
        onRawChange?.(nextRaw);
        const t = nextRaw.replace(',', '.').trim();
        if (t === '') {
            onChange(min);
            return;
        }
        const n = mode === 'numeric' ? parseInt(t, 10) : parseFloat(t);
        if (!Number.isFinite(n)) return;
        onChange(clamp(n));
    };

    const adjust = (delta: number) => {
        const next = clamp(value + delta);
        onChange(next);
        onRawChange?.(next === 0 && min === 0 ? '' : String(next));
    };

    return (
        <div
            className={cn(
                'flex min-h-12 w-full items-stretch justify-between overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-all focus-within:border-[#5B8FB9]/40 focus-within:ring-2 focus-within:ring-[#5B8FB9]/20',
                className,
            )}
        >
            <button
                type="button"
                onClick={() => adjust(-step)}
                disabled={disabled || value <= min}
                aria-label={`Menos ${ariaLabel}`}
                className="flex w-10 shrink-0 items-center justify-center text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-500 active:bg-rose-100 disabled:opacity-30"
            >
                <Minus size={16} strokeWidth={3} />
            </button>
            <div className="flex min-w-0 flex-1 flex-col items-center justify-center">
                <input
                    type="text"
                    inputMode={mode}
                    value={display}
                    disabled={disabled}
                    onChange={(e) => commitRaw(e.target.value)}
                    onBlur={onBlur}
                    aria-label={ariaLabel}
                    className={cn(
                        'w-full min-w-0 bg-transparent p-0 text-center text-sm font-black tabular-nums tracking-tighter text-zinc-700 outline-none transition-colors focus:bg-blue-50/20',
                        bottomText ? 'mt-1' : 'h-full',
                    )}
                />
                {bottomText ? (
                    <span className="w-full truncate px-1 pb-1 text-center text-[8px] font-normal text-zinc-400">
                        {bottomText}
                    </span>
                ) : null}
            </div>
            <button
                type="button"
                onClick={() => adjust(step)}
                disabled={disabled || (max != null && value >= max)}
                aria-label={`Más ${ariaLabel}`}
                className="flex w-10 shrink-0 items-center justify-center text-zinc-400 transition-colors hover:bg-emerald-50 hover:text-emerald-500 active:bg-emerald-100 disabled:opacity-30"
            >
                <Plus size={16} strokeWidth={3} />
            </button>
            {suffix ? (
                <span className="flex w-10 shrink-0 items-center justify-center pr-2 text-center text-[10px] font-black uppercase tracking-wide text-zinc-500">
                    {suffix}
                </span>
            ) : null}
        </div>
    );
}
