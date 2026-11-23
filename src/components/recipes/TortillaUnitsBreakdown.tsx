'use client';

import { useState } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import {
    calculateTortillaUnits,
    type TortillaConsumptionUnit,
} from '@/lib/tortilla-units';

/** Desglose informativo: nunca modifica recetas, consumos ni stock. */
export function TortillaUnitsBreakdown({
    formats,
}: {
    formats: readonly TortillaConsumptionUnit[];
}) {
    const [quantities, setQuantities] = useState<Record<string, number>>({});
    const orderedFormats = ['entero', 'medio', 'pincho']
        .flatMap((code) => formats.filter((format) => format.code === code));
    const allocation = calculateTortillaUnits(orderedFormats, quantities);
    const hasSelection = orderedFormats.some((format) => (quantities[format.code] ?? 0) > 0);

    const changeQuantity = (code: string, requested: number) => {
        if (!Number.isSafeInteger(requested)) return;
        setQuantities((previous) => {
            const current = calculateTortillaUnits(orderedFormats, previous);
            const selected = previous[code] ?? 0;
            const maximum = selected + (current.available[code] ?? 0);
            return { ...previous, [code]: Math.max(0, Math.min(requested, maximum)) };
        });
    };

    if (orderedFormats.length === 0) return null;

    return (
        <div data-element="tortilla-units-breakdown" className="border-t border-zinc-100 p-3 text-left">
            <p className="mb-2 text-xs font-semibold text-zinc-600">
                De una tortilla completa puedes obtener, por separado:
            </p>
            <div className="grid grid-cols-3 gap-2">
                {orderedFormats.map((format) => (
                    <div key={format.code} className="min-w-0 rounded-lg bg-zinc-100 px-2 py-2 text-center">
                        <div className="text-xl font-black tabular-nums text-zinc-800">
                            {format.portions_per_batch}
                        </div>
                        <div className="text-[11px] font-semibold leading-tight text-zinc-600">
                            {format.label}
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
                <h3 className="text-xs font-black text-zinc-800">Combinar formatos</h3>
                {hasSelection ? (
                    <button
                        type="button"
                        onClick={() => setQuantities({})}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-600 hover:text-zinc-900"
                        aria-label="Reiniciar combinación de tortilla"
                    >
                        <RotateCcw size={12} aria-hidden="true" />
                        Reiniciar
                    </button>
                ) : null}
            </div>

            <div className="mt-2 space-y-2">
                {orderedFormats.map((format) => {
                    const selected = quantities[format.code] ?? 0;
                    const additional = allocation.available[format.code] ?? 0;
                    return (
                        <div key={format.code} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 px-2 py-2">
                            <div className="min-w-0 flex-1">
                                <div className="text-xs font-semibold text-zinc-800">{format.label}</div>
                                <div className="text-[11px] text-zinc-500">
                                    {additional} más disponibles
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                                <button
                                    type="button"
                                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-700 disabled:opacity-30"
                                    onClick={() => changeQuantity(format.code, selected - 1)}
                                    disabled={selected === 0}
                                    aria-label={`Restar ${format.label}`}
                                >
                                    <Minus size={15} aria-hidden="true" />
                                </button>
                                <input
                                    type="number"
                                    min="0"
                                    max={selected + additional}
                                    step="1"
                                    inputMode="numeric"
                                    aria-label={`Cantidad de ${format.label}`}
                                    value={selected}
                                    onChange={(event) => changeQuantity(format.code, Number(event.target.value))}
                                    className="w-12 bg-transparent text-center text-sm font-black tabular-nums text-zinc-800 outline-none"
                                />
                                <button
                                    type="button"
                                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-700 disabled:opacity-30"
                                    onClick={() => changeQuantity(format.code, selected + 1)}
                                    disabled={additional === 0}
                                    aria-label={`Añadir ${format.label}`}
                                >
                                    <Plus size={15} aria-hidden="true" />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="mt-3 rounded-lg bg-zinc-100 p-3">
                <div className="mb-2 flex items-center justify-between gap-2 text-xs font-bold text-zinc-800" role="status" aria-live="polite">
                    <span>Disponible de la tortilla</span>
                    <span className="tabular-nums">
                        {allocation.remainingPercent.toLocaleString('es-ES', { maximumFractionDigits: 1 })}%
                    </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-zinc-300" aria-hidden="true">
                    <div className="h-full rounded-full bg-emerald-600 transition-[width]" style={{ width: `${100 - allocation.remainingPercent}%` }} />
                </div>
                {hasSelection && allocation.remaining === BigInt(0) ? (
                    <p className="mt-2 text-[11px] font-semibold text-zinc-700">Tortilla completamente repartida.</p>
                ) : null}
            </div>
            <p className="mt-2 text-[11px] text-zinc-500">
                Cálculo orientativo de reparto. No registra consumo ni descuenta stock.
            </p>
        </div>
    );
}
