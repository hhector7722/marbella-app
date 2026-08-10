'use client';

import React from 'react';
import { useStudioStore } from './store';
import { ModoDecidir } from './components/ModoDecidir';
import { ModoSondear } from './components/ModoSondear';
import { ModoAbsorber } from './components/ModoAbsorber';
import { DesignLanguage } from './components/DesignLanguage';
import { Modo } from './types';

// ============================================================
// MARBELLA DESIGN STUDIO — un instrumento, no un editor.
// Tres modos de atención: Decidir, Sondear, Absorber.
// La pantalla real es la protagonista; la herramienta desaparece.
// ============================================================

const MODOS: { id: Modo; nombre: string; descripcion: string }[] = [
    { id: 'decidir', nombre: 'Decidir', descripcion: 'Original + variante sobre una pantalla real' },
    { id: 'sondear', nombre: 'Sondear', descripcion: 'Recetas desechables en sandbox de escritura bloqueada' },
    { id: 'absorber', nombre: 'Absorber', descripcion: 'Estudiar referencias como sondas → semillas' },
];

export default function StudioPage() {
    const modo = useStudioStore(s => s.modo);
    const setModo = useStudioStore(s => s.setModo);
    const hipotesis = useStudioStore(s => s.hipotesis);
    const setActiveHipotesis = useStudioStore(s => s.setActiveHipotesis);
    const activeHipotesisId = useStudioStore(s => s.activeHipotesisId);
    const [verLanguage, setVerLanguage] = React.useState(false);

    const hipoActiva = hipotesis.find(h => h.id === activeHipotesisId);

    return (
        <div className="flex h-screen w-screen flex-col overflow-hidden bg-zinc-950 font-sans text-white select-none">
            {/* Barra superior: solo lo mínimo */}
            <div className="flex items-center justify-between border-b border-zinc-800/70 px-4 py-1.5">
                <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-lg bg-[#36606F]" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
                        Marbella Design Studio
                    </span>
                    {hipoActiva && (
                        <span className="hidden rounded-lg bg-[#36606F]/20 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-[#7FB0C0] md:inline">
                            Hipótesis activa
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setVerLanguage(!verLanguage)}
                        style={{ minHeight: 40 }}
                        className={`rounded-xl px-3 text-[9px] font-black uppercase tracking-widest ${
                            verLanguage ? 'bg-[#36606F] text-white' : 'text-zinc-400 hover:text-white'
                        }`}
                    >
                        Design Language
                    </button>
                </div>
            </div>

            {verLanguage ? (
                <div className="flex-1 min-h-0">
                    <DesignLanguage />
                </div>
            ) : (
                <div className="flex flex-1 min-h-0">
                    {/* Navegación de modos: columna lateral mínima */}
                    <div className="flex w-14 shrink-0 flex-col border-r border-zinc-800/70 md:w-52">
                        {MODOS.map(m => (
                            <button
                                key={m.id}
                                onClick={() => setModo(m.id)}
                                style={{ minHeight: 56 }}
                                className={`flex items-center gap-2 border-b border-zinc-800/50 px-3 text-left transition-colors ${
                                    modo === m.id ? 'bg-[#36606F]/10' : 'hover:bg-zinc-900'
                                }`}
                            >
                                <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${modo === m.id ? 'bg-[#7FB0C0]' : 'bg-zinc-700'}`} />
                                <div className="hidden md:block">
                                    <div className={`text-[10px] font-black uppercase tracking-widest ${modo === m.id ? 'text-white' : 'text-zinc-400'}`}>
                                        {m.nombre}
                                    </div>
                                    <div className="text-[9px] text-zinc-600">{m.descripcion}</div>
                                </div>
                            </button>
                        ))}
                        <div className="flex-1" />
                        <button
                            onClick={() => setActiveHipotesis(null)}
                            style={{ minHeight: 56 }}
                            className="border-t border-zinc-800/50 px-3 text-left text-[9px] font-black uppercase tracking-widest text-zinc-600 hover:text-zinc-300"
                        >
                            {hipotesis.length > 0 ? `${hipotesis.length} hipótesis` : 'Sin hipótesis'}
                        </button>
                    </div>

                    {/* El modo activo */}
                    <main className="min-h-0 flex-1">
                        {modo === 'decidir' && <ModoDecidir />}
                        {modo === 'sondear' && <ModoSondear />}
                        {modo === 'absorber' && <ModoAbsorber />}
                    </main>
                </div>
            )}
        </div>
    );
}
