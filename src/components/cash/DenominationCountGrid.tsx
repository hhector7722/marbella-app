'use client';

import Image from 'next/image';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CURRENCY_IMAGES, DENOMINATIONS } from '@/lib/constants';

export function DenominationStepper({
    value,
    onAdjust,
    onChange,
    stockIssue = false,
    ariaMinus,
    ariaPlus,
    className,
    inputClassName,
    minusClassName,
    plusClassName,
}: {
    value: number;
    onAdjust: (delta: number) => void;
    onChange: (raw: string) => void;
    stockIssue?: boolean;
    ariaMinus?: string;
    ariaPlus?: string;
    className?: string;
    inputClassName?: string;
    minusClassName?: string;
    plusClassName?: string;
}) {
    return (
        <div
            className={cn(
                'mx-auto flex h-8 w-[86%] items-center justify-between overflow-hidden rounded-lg border bg-white shadow-sm transition-all focus-within:ring-2 focus-within:ring-offset-1',
                stockIssue
                    ? 'border-rose-300 focus-within:border-rose-400 focus-within:ring-rose-200'
                    : 'border-zinc-200 focus-within:border-[#5B8FB9]/40 focus-within:ring-[#5B8FB9]/20',
                className
            )}
        >
            <button
                type="button"
                onClick={() => onAdjust(-1)}
                aria-label={ariaMinus}
                className={cn(
                    'flex h-full w-5 shrink-0 items-center justify-center text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-500 active:bg-rose-100',
                    minusClassName
                )}
            >
                <Minus size={12} strokeWidth={3} />
            </button>
            <input
                type="number"
                inputMode="numeric"
                value={value || ''}
                onChange={(e) => onChange(e.target.value)}
                placeholder=""
                className={cn(
                    'h-full w-0 min-w-0 flex-1 bg-transparent p-0 text-center text-[9px] font-black tabular-nums tracking-tighter text-zinc-700 outline-none transition-colors focus:bg-blue-50/20',
                    inputClassName
                )}
            />
            <button
                type="button"
                onClick={() => onAdjust(1)}
                aria-label={ariaPlus}
                className={cn(
                    'flex h-full w-5 shrink-0 items-center justify-center text-zinc-400 transition-colors hover:bg-emerald-50 hover:text-emerald-500 active:bg-emerald-100',
                    plusClassName
                )}
            >
                <Plus size={12} strokeWidth={3} />
            </button>
        </div>
    );
}

export function DenominationCountGrid({
    counts,
    onAdjust,
    onChange,
    denominations = DENOMINATIONS,
    availableStock,
    onZoom,
    showAvailable = false,
}: {
    counts: Record<number, number>;
    onAdjust: (denom: number, delta: number) => void;
    onChange: (denom: number, raw: string) => void;
    denominations?: readonly number[];
    availableStock?: Record<number, number>;
    onZoom?: (denom: number) => void;
    showAvailable?: boolean;
}) {
    return (
        <div className="grid grid-cols-3 gap-x-2.5 gap-y-1.5 p-0.5 sm:grid-cols-5">
            {denominations.map((denom) => {
                const qty = counts[denom] || 0;
                const avail = availableStock?.[denom] || 0;
                const stockIssue = Boolean(availableStock) && qty > avail;
                const label = denom >= 1 ? `${denom} euros` : `${(denom * 100).toFixed(0)} céntimos`;
                return (
                    <div key={denom} className="group flex flex-col items-center gap-0.5 transition-all">
                        <div
                            role={onZoom ? 'button' : undefined}
                            tabIndex={onZoom ? 0 : undefined}
                            onClick={onZoom ? () => onZoom(denom) : undefined}
                            onKeyDown={
                                onZoom
                                    ? (e) => {
                                          if (e.key === 'Enter' || e.key === ' ') onZoom(denom);
                                      }
                                    : undefined
                            }
                            className={cn(
                                'flex h-8 min-h-[36px] w-full items-center justify-center rounded-lg sm:h-9',
                                onZoom &&
                                    'cursor-pointer transition-transform hover:bg-white/60 group-hover:scale-110 focus:outline-none focus:ring-2 focus:ring-[#5B8FB9]/40 focus:ring-offset-1'
                            )}
                            aria-label={onZoom ? `Editar cantidad de ${label}` : undefined}
                        >
                            <Image
                                src={CURRENCY_IMAGES[denom]}
                                alt={`${denom}€`}
                                width={140}
                                height={140}
                                className="pointer-events-none h-full w-auto object-contain drop-shadow-lg"
                            />
                        </div>
                        <div className="w-full text-center">
                            <span className="mb-0 block text-[7px] font-black uppercase tracking-widest text-gray-500">
                                {denom >= 1 ? `${denom}€` : `${(denom * 100).toFixed(0)}c`}
                            </span>
                            <DenominationStepper
                                value={qty}
                                onAdjust={(delta) => onAdjust(denom, delta)}
                                onChange={(raw) => onChange(denom, raw)}
                                stockIssue={stockIssue}
                                ariaMinus={`Quitar una unidad de ${label}`}
                                ariaPlus={`Añadir una unidad de ${label}`}
                            />
                            {showAvailable && avail > 0 ? (
                                <span className="mt-1 block text-[7px] font-bold uppercase text-gray-400">
                                    Disp: {avail}
                                </span>
                            ) : null}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
