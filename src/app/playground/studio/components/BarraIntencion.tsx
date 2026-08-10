'use client';

import React, { useState } from 'react';
import { fraseAReceta } from '../intent';
import { MOVIDA_BY_ID } from '../movidas';
import { Recipe, Intensidad, MovidaId } from '../types';

// ============================================================
// BARRA DE INTENCIÓN — frase → receta. La IA nunca decide:
// traduce, propone y deja la decisión al ser humano.
// ============================================================

const ETIQUETA_INTENSIDAD: Record<Intensidad, string> = {
    nada: 'nada',
    sutil: 'sutil',
    moderado: 'moderado',
    fuerte: 'fuerte',
};

export function BarraIntencion({ onAplicar, placeholder }: { onAplicar: (recipe: Recipe, frase: string) => void; placeholder?: string }) {
    const [frase, setFrase] = useState('');
    const [recipe, setRecipe] = useState<Recipe | null>(null);
    const [explicacion, setExplicacion] = useState<string[]>([]);

    const traducir = () => {
        const { recipe: r, explicacion: e } = fraseAReceta(frase);
        setRecipe(r);
        setExplicacion(e);
    };

    const aplicar = () => {
        if (recipe && Object.keys(recipe).length > 0) onAplicar(recipe, frase);
        setFrase('');
        setRecipe(null);
        setExplicacion([]);
    };

    return (
        <div className="w-full rounded-2xl border border-zinc-800 bg-zinc-900/80 p-3" style={{ minHeight: 48 }}>
            <div className="flex items-center gap-2">
                <input
                    value={frase}
                    onChange={e => setFrase(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && traducir()}
                    placeholder={placeholder ?? 'Describe una movida… «Quiero que respire»'}
                    className="min-h-12 flex-1 bg-transparent text-sm font-bold text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
                />
                {!recipe && (
                    <button
                        onClick={traducir}
                        style={{ minHeight: 48 }}
                        className="rounded-xl bg-[#36606F] px-3 text-[9px] font-black uppercase tracking-widest text-white"
                    >
                        Traducir
                    </button>
                )}
                {recipe && (
                    <button
                        onClick={aplicar}
                        style={{ minHeight: 48 }}
                        className="rounded-xl bg-emerald-500 px-3 text-[9px] font-black uppercase tracking-widest text-white"
                    >
                        Aplicar
                    </button>
                )}
            </div>

            {explicacion.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 border-t border-zinc-800 pt-2">
                    {explicacion.map((e, i) => {
                        const movidaId = e.split(' → ')[0] as MovidaId;
                        const movida = MOVIDA_BY_ID[movidaId];
                        return (
                            <span key={i} className="rounded-lg bg-zinc-800/80 px-2 py-1 text-[10px] font-bold text-zinc-300">
                                {movida ? `${movida.nombre}: ` : ''}
                                {e}
                            </span>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export function SelectorIntensidad({ value, onChange }: { value: Intensidad; onChange: (v: Intensidad) => void }) {
    return (
        <div className="flex gap-1">
            {(Object.keys(ETIQUETA_INTENSIDAD) as Intensidad[]).map(i => (
                <button
                    key={i}
                    onClick={() => onChange(i)}
                    style={{ minHeight: 48 }}
                    className={`rounded-xl px-2.5 text-[9px] font-black uppercase tracking-widest transition-colors ${
                        value === i ? 'bg-[#36606F] text-white' : 'bg-zinc-800/60 text-zinc-400 hover:text-white'
                    }`}
                >
                    {ETIQUETA_INTENSIDAD[i]}
                </button>
            ))}
        </div>
    );
}
