'use client';

import React, { useState } from 'react';
import { useStudioStore } from '../store';
import { BlockType, LayoutType } from '../types';

const BLOCK_LIBRARY: { type: BlockType; name: string; description: string; icon: string; category: string }[] = [
    { type: 'page-header', name: 'Cabecera de Página', description: 'Título, subtítulo, variante monumental y KPIs.', icon: 'H', category: 'Estructura' },
    { type: 'data-table', name: 'Tabla de Datos / Lista', description: 'Tabla matricial o lista de tarjetas con densidad configurable.', icon: 'T', category: 'Datos' },
    { type: 'filter-bar', name: 'Barra de Filtros & Búsqueda', description: 'Campo de búsqueda global, filtros y botón de acción.', icon: 'F', category: 'Acción' },
    { type: 'kpi-grid', name: 'Rejilla de Métricas KPI', description: 'Tarjetas resumidas con tendencias y cifras principales.', icon: 'K', category: 'Métricas' },
    { type: 'sidebar-nav', name: 'Navegación / Menú', description: 'Menú principal de app o menú lateral de sección.', icon: 'N', category: 'Navegación' },
    { type: 'container-block', name: 'Tarjeta Contenedora', description: 'Superficie enmarcada en blanco para agrupar contenido.', icon: 'C', category: 'Estructura' },
    { type: 'callout-banner', name: 'Aviso / Callout', description: 'Banner explicativo o de advertencia para el usuario.', icon: 'A', category: 'Feedback' },
];

export default function StudioLayersPanel() {
    const [activeTab, setActiveTab] = useState<'layers' | 'library' | 'settings'>('layers');
    const { 
        variants, 
        activeVariantId, 
        selectedBlockId, 
        selectBlock, 
        addBlockToRegion, 
        removeBlock, 
        moveBlock,
        updateVariantLayout,
        deleteVariant
    } = useStudioStore();

    const activeVariant = variants.find(v => v.id === activeVariantId);

    if (!activeVariant) return null;

    const regions = activeVariant.regions;

    return (
        <aside className="w-72 border-r border-white/10 bg-[#09090b] flex flex-col shrink-0 text-white overflow-hidden select-none z-20">
            {/* Header Tabs */}
            <div className="flex border-b border-white/10 bg-black/40">
                <button
                    onClick={() => setActiveTab('layers')}
                    className={`flex-1 py-3 text-xs font-semibold tracking-wider uppercase transition-colors border-b-2 ${
                        activeTab === 'layers'
                            ? 'border-[#5B8FB9] text-white bg-white/5'
                            : 'border-transparent text-zinc-400 hover:text-zinc-200'
                    }`}
                >
                    Capas (Tree)
                </button>
                <button
                    onClick={() => setActiveTab('library')}
                    className={`flex-1 py-3 text-xs font-semibold tracking-wider uppercase transition-colors border-b-2 ${
                        activeTab === 'library'
                            ? 'border-[#5B8FB9] text-white bg-white/5'
                            : 'border-transparent text-zinc-400 hover:text-zinc-200'
                    }`}
                >
                    + Insertar
                </button>
                <button
                    onClick={() => setActiveTab('settings')}
                    className={`px-3 py-3 text-xs font-semibold tracking-wider uppercase transition-colors border-b-2 ${
                        activeTab === 'settings'
                            ? 'border-[#5B8FB9] text-white bg-white/5'
                            : 'border-transparent text-zinc-400 hover:text-zinc-200'
                    }`}
                    title="Ajustes de Maquetación"
                >
                    Layout
                </button>
            </div>

            {/* Tab 1: Layers Tree */}
            {activeTab === 'layers' && (
                <div className="flex-1 overflow-y-auto p-3 space-y-4">
                    <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 px-1 flex justify-between items-center">
                        <span>Estructura del Lienzo</span>
                        <span className="text-zinc-600 font-mono text-[9px]">{activeVariant.layout}</span>
                    </div>

                    {Object.entries(regions).map(([regionId, blocks]) => (
                        <div key={regionId} className="space-y-1">
                            {/* Region Header */}
                            <div className="flex items-center justify-between px-2 py-1.5 bg-white/5 rounded-md border border-white/5 text-xs text-zinc-300 font-medium">
                                <div className="flex items-center gap-1.5 capitalize">
                                    <svg className="w-3.5 h-3.5 text-[#5B8FB9]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                    </svg>
                                    <span>Región {regionId}</span>
                                </div>
                                <span className="text-[10px] text-zinc-500 bg-white/5 px-1.5 py-0.5 rounded font-mono">
                                    {blocks.length}
                                </span>
                            </div>

                            {/* Blocks inside region */}
                            <div className="pl-3 space-y-1">
                                {blocks.length === 0 ? (
                                    <div className="p-2 border border-dashed border-white/10 rounded-md text-[11px] text-zinc-500 italic text-center">
                                        Región vacía
                                    </div>
                                ) : (
                                    blocks.map((block, idx) => {
                                        const isSelected = selectedBlockId === block.id;
                                        return (
                                            <div
                                                key={block.id}
                                                onClick={() => selectBlock(block.id)}
                                                className={`group flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer border transition-all ${
                                                    isSelected
                                                        ? 'bg-[#36606F] text-white border-[#5B8FB9] shadow-sm'
                                                        : 'bg-white/[0.02] border-white/5 text-zinc-300 hover:bg-white/10 hover:border-white/15'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2 truncate">
                                                    <span className={`w-5 h-5 rounded flex items-center justify-center font-mono font-bold text-[10px] ${
                                                        isSelected ? 'bg-white/20 text-white' : 'bg-white/10 text-zinc-400'
                                                    }`}>
                                                        {block.type.substring(0, 2).toUpperCase()}
                                                    </span>
                                                    <span className="truncate font-medium">
                                                        {block.props.title || block.props.name || block.type}
                                                    </span>
                                                </div>

                                                {/* Reorder / Delete Actions */}
                                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); moveBlock(block.id, 'up'); }}
                                                        disabled={idx === 0}
                                                        className="p-1 text-zinc-400 hover:text-white disabled:opacity-20"
                                                        title="Mover arriba"
                                                    >
                                                        ▲
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); moveBlock(block.id, 'down'); }}
                                                        disabled={idx === blocks.length - 1}
                                                        className="p-1 text-zinc-400 hover:text-white disabled:opacity-20"
                                                        title="Mover abajo"
                                                    >
                                                        ▼
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); removeBlock(block.id); }}
                                                        className="p-1 text-zinc-400 hover:text-rose-400"
                                                        title="Eliminar bloque"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Tab 2: Insert Library */}
            {activeTab === 'library' && (
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                    <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 px-1">
                        Catálogo de Componentes Visuales
                    </div>

                    <div className="space-y-2">
                        {BLOCK_LIBRARY.map((item) => (
                            <div
                                key={item.type}
                                className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#5B8FB9]/50 rounded-xl transition-all group cursor-pointer"
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-md bg-[#36606F]/40 border border-[#36606F] text-[#5B8FB9] font-mono font-bold text-xs flex items-center justify-center">
                                            {item.icon}
                                        </div>
                                        <span className="font-semibold text-xs text-zinc-100 group-hover:text-white">
                                            {item.name}
                                        </span>
                                    </div>
                                    <span className="text-[9px] text-zinc-400 uppercase tracking-wider font-mono">
                                        {item.category}
                                    </span>
                                </div>
                                <p className="text-[11px] text-zinc-400 leading-tight mb-3">
                                    {item.description}
                                </p>

                                {/* Insert buttons per region */}
                                <div className="flex items-center gap-1.5 pt-2 border-t border-white/5">
                                    <span className="text-[10px] text-zinc-500 font-medium">Insertar en:</span>
                                    {Object.keys(regions).map(regId => (
                                        <button
                                            key={regId}
                                            onClick={() => addBlockToRegion(regId, item.type)}
                                            className="px-2 py-0.5 bg-[#36606F]/20 hover:bg-[#36606F] border border-[#36606F]/40 text-[#5B8FB9] hover:text-white rounded text-[10px] font-semibold capitalize transition-colors"
                                        >
                                            + {regId}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Tab 3: Layout Settings */}
            {activeTab === 'settings' && (
                <div className="flex-1 overflow-y-auto p-4 space-y-5">
                    <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                            Estructura de Maquetación
                        </h3>
                        <p className="text-xs text-zinc-400 leading-relaxed mb-4">
                            Selecciona la arquitectura espacial que organiza las regiones de esta variante.
                        </p>

                        <div className="space-y-2">
                            {[
                                { id: 'control-panel', name: 'Panel de Control', desc: 'Sidebar lateral permanente + Contenido superior e inferior.' },
                                { id: 'focused-canvas', name: 'Lienzo Enfocado', desc: 'Lectura limpia en columna central max-w-4xl.' },
                                { id: 'bimodal', name: 'Arquitectura Espacial', desc: 'Cabecera monumental superior + Menú flotante y contenido.' }
                            ].map(layoutOpt => (
                                <button
                                    key={layoutOpt.id}
                                    onClick={() => updateVariantLayout(layoutOpt.id as LayoutType)}
                                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                                        activeVariant.layout === layoutOpt.id
                                            ? 'bg-[#36606F]/30 border-[#5B8FB9] text-white shadow-md'
                                            : 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10'
                                    }`}
                                >
                                    <div className="font-semibold text-xs mb-0.5">{layoutOpt.name}</div>
                                    <div className="text-[11px] text-zinc-400 leading-snug">{layoutOpt.desc}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="pt-4 border-t border-white/10">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                            Variante Activa
                        </h3>
                        <div className="text-xs text-zinc-300 mb-3 font-mono bg-white/5 p-2 rounded border border-white/5">
                            ID: {activeVariant.id}
                        </div>
                        {variants.length > 1 && (
                            <button
                                onClick={() => {
                                    if (confirm(`¿Eliminar la variante "${activeVariant.name}"?`)) {
                                        deleteVariant(activeVariant.id);
                                    }
                                }}
                                className="w-full py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold transition-colors"
                            >
                                Eliminar variante actual
                            </button>
                        )}
                    </div>
                </div>
            )}
        </aside>
    );
}
