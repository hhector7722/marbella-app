'use client';

import type { MouseEventHandler, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function workerInitial(name: string): string {
    const trimmed = name.trim();
    if (!trimmed || trimmed === '—') return '?';
    return trimmed.charAt(0).toUpperCase();
}

type WorkerPersonRowProps = {
    name: string;
    subtitle?: ReactNode;
    value?: ReactNode;
    valueCaption?: string;
    muted?: boolean;
    trailing?: ReactNode;
    onClick?: MouseEventHandler<HTMLElement>;
};

/**
 * Fila de persona: inicial, nombre, dato a la derecha.
 * Misma lectura en coste laboral, consumo, asistencia y horas extras.
 */
export function WorkerPersonRow({
    name,
    subtitle,
    value,
    valueCaption,
    muted = false,
    trailing,
    onClick,
}: WorkerPersonRowProps) {
    const className = cn(
        'flex w-full items-center justify-between gap-3 border-b border-zinc-50 py-3.5 text-left last:border-0',
        onClick && 'cursor-pointer transition-colors hover:bg-zinc-50/80',
        muted && 'opacity-80',
    );

    const identity = (
        <div className="flex min-w-0 items-center gap-4">
            <div
                className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                    muted ? 'bg-zinc-50 text-zinc-300' : 'bg-zinc-100 text-zinc-700',
                )}
                aria-hidden
            >
                {workerInitial(name)}
            </div>
            <div className="flex min-w-0 flex-col">
                <span
                    className={cn(
                        'mb-0.5 truncate text-[15px] font-medium',
                        muted ? 'text-zinc-400' : 'text-zinc-900',
                    )}
                >
                    {name}
                </span>
                {subtitle ? (
                    <div className="flex items-center gap-1.5 text-[12px] tabular-nums text-zinc-500">{subtitle}</div>
                ) : null}
            </div>
        </div>
    );

    const figures = value != null || valueCaption ? (
        <div className="flex flex-col items-end">
            {value != null ? (
                <span
                    className={cn(
                        'text-[15px] font-semibold tabular-nums',
                        muted ? 'text-zinc-400' : 'text-zinc-900',
                    )}
                >
                    {value}
                </span>
            ) : null}
            {valueCaption ? <span className="mt-0.5 text-[11px] text-zinc-400">{valueCaption}</span> : null}
        </div>
    ) : null;

    if (onClick) {
        return (
            <div className={className}>
                <button
                    type="button"
                    onClick={onClick}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                >
                    {identity}
                    {figures}
                </button>
                {trailing}
            </div>
        );
    }

    return (
        <div className={className}>
            {identity}
            <div className="flex shrink-0 items-center gap-3">
                {figures}
                {trailing}
            </div>
        </div>
    );
}

type WorkerListSummaryProps = {
    metrics: Array<{ label: string; value: string }>;
    total: string;
};

/** Totales del día o la semana, en el mismo tono que las filas. Sin título ni cifra gigante. */
export function WorkerListSummary({ metrics, total }: WorkerListSummaryProps) {
    return (
        <div className="mb-1 flex items-end justify-between gap-3 border-b border-zinc-100 pb-3">
            {metrics.length > 0 ? (
                <p className="min-w-0 text-[12px] leading-relaxed text-zinc-500">
                    {metrics.map((m, i) => (
                        <span key={m.label}>
                            {i > 0 ? <span className="text-zinc-300"> · </span> : null}
                            <span>{m.label} </span>
                            <span className="tabular-nums font-medium text-zinc-700">{m.value}</span>
                        </span>
                    ))}
                </p>
            ) : (
                <span />
            )}
            <span className="shrink-0 text-[15px] font-semibold tabular-nums text-zinc-900">{total}</span>
        </div>
    );
}
