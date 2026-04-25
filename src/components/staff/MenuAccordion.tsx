'use client';

import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DigitalMenuRow = {
    articulo_id: number;
    articulo_nombre: string;
    departamento_id: number | null;
    departamento_nombre: string | null;
    recipe_id: string;
    recipe_name: string;
    descripcion: string | null;
    precio: number | string | null;
    photo_url: string | null;
};

function formatPriceDisplay(precio: number | string | null | undefined): string {
    if (precio === null || precio === undefined) return ' ';
    const n = typeof precio === 'string' ? parseFloat(precio) : precio;
    if (Number.isNaN(n) || Math.abs(n) < 0.005) return ' ';
    return `${n.toFixed(2)}€`;
}

function MenuCard({ row }: { row: DigitalMenuRow }) {
    const priceStr = formatPriceDisplay(row.precio);
    const showPrice = priceStr.trim() !== '';

    return (
        <div
            className={cn(
                // En grid: tarjeta "auto-height" (no estirar a toda la fila)
                'flex flex-col overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm self-start'
            )}
        >
            {row.photo_url ? (
                <div className="w-full shrink-0 bg-white">
                    <div className="h-28 w-full bg-white sm:h-32">
                        {/* eslint-disable-next-line @next/next/no-img-element -- URLs arbitrarias desde BD */}
                        <img
                            src={row.photo_url}
                            alt=""
                            className="h-full w-full object-contain p-2"
                        />
                    </div>
                </div>
            ) : null}
            <div className="flex min-h-[48px] min-w-0 flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                    <h3 className="min-w-0 flex-1 text-[15px] font-black leading-snug text-zinc-900 line-clamp-2">
                        {row.articulo_nombre}
                    </h3>
                    {showPrice ? (
                        <span className="shrink-0 rounded-xl bg-[#36606F]/10 px-2.5 py-1.5 font-mono text-[13px] font-black text-[#36606F]">
                            {priceStr}
                        </span>
                    ) : null}
                </div>
                {row.descripcion ? (
                    <p className="text-[12px] leading-relaxed text-zinc-600 line-clamp-3">{row.descripcion}</p>
                ) : null}
            </div>
        </div>
    );
}

export function MenuAccordion({ items }: { items: DigitalMenuRow[] }) {
    const grouped = useMemo(() => {
        const m = new Map<string, DigitalMenuRow[]>();
        for (const row of items) {
            const key = (row.departamento_nombre?.trim() || 'Sin departamento').trim();
            if (!m.has(key)) m.set(key, []);
            m.get(key)!.push(row);
        }
        const entries = Array.from(m.entries()).sort((a, b) =>
            a[0].localeCompare(b[0], 'es', { sensitivity: 'base' })
        );
        for (const [, rows] of entries) {
            rows.sort((a, b) =>
                a.articulo_nombre.localeCompare(b.articulo_nombre, 'es', { sensitivity: 'base' })
            );
        }
        return entries;
    }, [items]);

    const [openKey, setOpenKey] = useState<string | null>(() => grouped[0]?.[0] ?? null);

    if (items.length === 0) {
        return (
            <div className="rounded-xl border border-zinc-100 bg-white p-6 text-center shadow-sm">
                <p className="text-sm font-medium text-zinc-500">No hay platos en carta con mapeo TPV todavía.</p>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {grouped.map(([familia, rows]) => {
                const isOpen = openKey === familia;
                return (
                    <div
                        key={familia}
                        className="overflow-hidden rounded-xl border border-zinc-100 bg-white shadow-sm"
                    >
                        <button
                            type="button"
                            onClick={() => setOpenKey((o) => (o === familia ? null : familia))}
                            className="flex min-h-[48px] w-full items-center justify-between gap-3 p-4 text-left active:bg-zinc-50/80"
                            aria-expanded={isOpen}
                        >
                            <span className="text-sm font-black uppercase tracking-wide text-[#36606F]">
                                {familia}
                            </span>
                            <ChevronDown
                                className={cn(
                                    'h-5 w-5 shrink-0 text-zinc-400 transition-transform',
                                    isOpen && 'rotate-180'
                                )}
                                aria-hidden
                            />
                        </button>
                        {isOpen ? (
                            <div className="shrink-0 border-t border-zinc-100 px-3 pb-3 pt-1">
                                <div className="grid max-h-[min(72vh,720px)] auto-rows-min items-start grid-cols-1 gap-4 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
                                    {rows.map((row) => (
                                        <MenuCard key={row.articulo_id} row={row} />
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>
                );
            })}
        </div>
    );
}
