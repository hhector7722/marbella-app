'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useStudioStore } from '../../store';

export default function CopilotChatPanel() {
    const {
        isCopilotOpen,
        toggleCopilotPanel,
        isGeneratingAI,
        copilotMessages,
        refineAIVariant,
        variants,
        activeVariantId,
    } = useStudioStore();

    const [draft, setDraft] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [copilotMessages.length, isGeneratingAI]);

    if (!isCopilotOpen) return null;

    const activeVariant = variants.find(v => v.id === activeVariantId);

    const handleSend = () => {
        const text = draft.trim();
        if (!text || isGeneratingAI) return;
        setDraft('');
        refineAIVariant(text);
    };

    return (
        <aside className="w-96 border-l border-white/10 bg-[#09090b] flex flex-col shrink-0 text-white select-none z-30 overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-white/10 bg-black/40 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#36606F] to-[#1F5FAF] flex items-center justify-center text-sm">
                        ✨
                    </div>
                    <div>
                        <div className="text-xs font-bold">Copiloto Gobernado</div>
                        <div className="text-[10px] text-zinc-500">
                            Refina la variante activa: {activeVariant?.name || '—'}
                        </div>
                    </div>
                </div>
                <button
                    onClick={() => toggleCopilotPanel(false)}
                    className="text-zinc-500 hover:text-white p-1.5 rounded-lg transition-colors text-sm"
                >
                    ✕
                </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                {copilotMessages.length === 0 && (
                    <div className="text-center text-zinc-500 py-8 px-4">
                        <div className="text-2xl mb-2">🤝</div>
                        <p className="text-xs leading-relaxed">
                            El Copiloto trabaja con los mismos contratos que tú. Genera propuestas desde
                            el botón Nueva Superficie o pide aquí un refinamiento de la variante activa.
                        </p>
                    </div>
                )}

                {copilotMessages.map(msg => (
                    <div
                        key={msg.id}
                        className={`p-3 rounded-2xl text-xs leading-relaxed border ${
                            msg.role === 'assistant'
                                ? 'bg-[#0e1620] border-[#5B8FB9]/40 text-zinc-100'
                                : 'bg-[#36606F]/30 border-[#36606F]/60 text-white ml-8'
                        }`}
                    >
                        <div className="text-[9px] uppercase font-bold tracking-wider text-[#5B8FB9] mb-1">
                            {msg.role === 'assistant' ? '✨ Copiloto' : 'Tú'}
                        </div>
                        {msg.text}
                        {msg.generatedVariantIds && msg.generatedVariantIds.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-white/10 text-[10px] text-zinc-400">
                                {msg.generatedVariantIds.length} propuesta(s) válida(s) añadidas al proyecto.
                            </div>
                        )}
                    </div>
                ))}

                {isGeneratingAI && (
                    <div className="flex items-center gap-2 text-[11px] text-[#5B8FB9] py-2">
                        <span className="w-3 h-3 border-2 border-[#5B8FB9] border-t-transparent rounded-full animate-spin" />
                        El Copiloto está diseñando dentro del contrato...
                    </div>
                )}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-white/10 bg-black/40">
                <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                    placeholder="Ej: conviértelo en lista compacta y añade un filtro por estado..."
                    className="w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#5B8FB9] h-16 resize-none mb-2"
                />
                <button
                    onClick={handleSend}
                    disabled={!draft.trim() || isGeneratingAI}
                    className="w-full py-2 bg-[#36606F] hover:bg-[#407080] border border-[#5B8FB9] rounded-xl text-xs font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    Refinar variante activa
                </button>
            </div>
        </aside>
    );
}
