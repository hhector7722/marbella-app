'use client';

import React, { useState } from 'react';
import { useStudioStore } from '../../store';

const REFINEMENT_PRESETS = [
    { label: '⚡ Reduce la carga cognitiva', prompt: 'Reduce la carga cognitiva, elimina elementos pesados y dale más espacio de respiración.' },
    { label: '⚡ Dale más protagonismo al KPI', prompt: 'Dale mucho más protagonismo a las cifras y tarjetas KPI principales.' },
    { label: '⚡ Que se parezca más a Apple', prompt: 'Aplica un diseño espacial estilo Apple con esquinas amplias y jerarquía monumental.' },
    { label: '⚡ Más compacto', prompt: 'Aumenta la densidad de datos estilo Linear pro-tool para ver más información.' },
    { label: '⚡ Más respiración', prompt: 'Aumenta el espaciado y márgenes para crear mayor holgura visual.' },
    { label: '⚡ Muchísimo más premium', prompt: 'Refina el contraste y usa elevaciones de superficie extremadamente pulidas.' }
];

export default function CopilotChatPanel() {
    const { isCopilotOpen, toggleCopilotPanel, copilotMessages, refineAIVariant, isGeneratingAI, activeVariantId, variants, setActiveVariant } = useStudioStore();
    const [inputText, setInputText] = useState('');

    if (!isCopilotOpen) return null;

    const handleSend = (textToSend?: string) => {
        const query = textToSend || inputText;
        if (!query.trim()) return;

        refineAIVariant(query);
        setInputText('');
    };

    return (
        <aside className="w-96 border-l border-white/10 bg-[#09090c] flex flex-col shrink-0 text-white select-none z-30 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-white/10 bg-black/40 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-[#36606F] to-indigo-600 flex items-center justify-center font-bold text-xs">
                        ✨
                    </div>
                    <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-100">Copiloto Creativo IA</h3>
                        <p className="text-[10px] text-zinc-400">Conversa y genera nuevas variantes</p>
                    </div>
                </div>

                <button
                    onClick={() => toggleCopilotPanel(false)}
                    className="text-zinc-500 hover:text-white p-1 rounded transition-colors text-xs"
                    title="Cerrar copiloto"
                >
                    ✕
                </button>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {copilotMessages.map((msg) => (
                    <div
                        key={msg.id}
                        className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                    >
                        <div
                            className={`max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed ${
                                msg.role === 'user'
                                    ? 'bg-[#36606F] text-white font-medium rounded-br-none shadow-md'
                                    : 'bg-white/5 border border-white/10 text-zinc-200 rounded-bl-none'
                            }`}
                        >
                            {msg.text}

                            {/* Generated Variant Pills */}
                            {msg.generatedVariantIds && msg.generatedVariantIds.length > 0 && (
                                <div className="mt-3 pt-2 border-t border-white/10 space-y-1.5">
                                    <div className="text-[10px] font-bold uppercase text-[#5B8FB9]">Variantes Creadas:</div>
                                    <div className="flex flex-wrap gap-1">
                                        {msg.generatedVariantIds.map((vId: string) => {
                                            const targetVar = variants.find(v => v.id === vId);
                                            const isActive = activeVariantId === vId;
                                            return (
                                                <button
                                                    key={vId}
                                                    onClick={() => setActiveVariant(vId)}
                                                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                                                        isActive
                                                            ? 'bg-[#36606F] text-white border border-[#5B8FB9] shadow-sm'
                                                            : 'bg-white/10 hover:bg-white/20 text-zinc-300'
                                                    }`}
                                                >
                                                    👁 {targetVar ? targetVar.name : vId}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                        <span className="text-[9px] text-zinc-500 mt-1 px-1">{msg.timestamp}</span>
                    </div>
                ))}

                {isGeneratingAI && (
                    <div className="flex items-center gap-2 text-xs text-indigo-400 bg-indigo-500/10 p-3 rounded-xl border border-indigo-500/20 animate-pulse">
                        <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                        <span>El Copiloto está razonando la nueva variante bajo Marbella OS...</span>
                    </div>
                )}
            </div>

            {/* Quick Refinement Chips */}
            <div className="p-3 border-t border-white/10 bg-black/20 space-y-2">
                <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">
                    Instrucciones de Refinamiento Rápido:
                </div>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                    {REFINEMENT_PRESETS.map((preset, idx) => (
                        <button
                            key={idx}
                            onClick={() => handleSend(preset.prompt)}
                            disabled={isGeneratingAI}
                            className="text-[10px] bg-white/5 hover:bg-[#36606F]/40 border border-white/10 hover:border-[#5B8FB9] text-zinc-300 hover:text-white px-2 py-1 rounded-lg transition-all font-medium disabled:opacity-40"
                        >
                            {preset.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Input Prompt Box */}
            <div className="p-3 border-t border-white/10 bg-black/40 flex items-center gap-2">
                <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    disabled={isGeneratingAI}
                    placeholder="Instrucción (ej: Dale más protagonismo al KPI)..."
                    className="flex-1 bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#5B8FB9]"
                />
                <button
                    onClick={() => handleSend()}
                    disabled={isGeneratingAI || !inputText.trim()}
                    className="px-3 py-2 bg-[#36606F] hover:bg-[#407080] disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow transition-all"
                >
                    Enviar
                </button>
            </div>
        </aside>
    );
}
