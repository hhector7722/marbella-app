'use client';

import React, { useState } from 'react';
import { useStudioStore } from '../store';
import { BlockType, IntentCategory } from '../types';

const INTENT_CATALOG: { category: IntentCategory; name: string; description: string; icon: string }[] = [
    { category: 'identidad', name: 'Zona de Identidad & Contexto', description: 'Describe la entidad principal, título, fecha y estado operativo.', icon: '🎯' },
    { category: 'datos', name: 'Zona de Exposición de Datos', description: 'Tablas matriciales o tarjetas de lista para visualizar información.', icon: '📊' },
    { category: 'control', name: 'Zona de Control & Filtrado', description: 'Buscador, filtros avanzados y disparadores de acciones.', icon: '🎛️' },
    { category: 'resumen', name: 'Zona de Resumen Executive', description: 'Tarjetas KPI de métricas clave y tendencias.', icon: '📈' },
    { category: 'navegacion', name: 'Zona de Navegación & Menú', description: 'Navegación principal de app o menú flotante de sección.', icon: '🧭' },
    { category: 'alerta', name: 'Zona de Alerta & Estado', description: 'Avisos semánticos e indicaciones destacadas.', icon: '⚠️' },
    { category: 'acciones', name: 'Zona de Acciones Masivas', description: 'Botonera de acciones ejecutivas.', icon: '⚡' },
];

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
    const [activeTab, setActiveTab] = useState<'intents' | 'layers' | 'library'>('intents');
    const { 
        variants, 
        activeVariantId, 
        selectedBlockId, 
        selectBlock, 
        addBlockToRegion, 
        removeBlock, 
        moveBlock,
        addIntentZone,
        focusStack,
        focusIntoObject,
        focusOutObject
    } = useStudioStore();

    const activeVariant = variants.find(v => v.id === activeVariantId);
    if (!activeVariant) return null;

    const regions = activeVariant.regions;
    const currentFocus = focusStack[focusStack.length - 1];

    return (
        <aside className="w-80 border-r border-white/10 bg-[#09090b] flex flex-col shrink-0 text-white overflow-hidden select-none z-20">
            {/* Object Scope Banner */}
            <div className="p-3 bg-black/50 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2 overflow-hidden">
                    <span className="text-sm font-mono">{currentFocus.type === 'pantalla' ? '💻' : '📦'}</span>
                    <div className="truncate">
                        <div className="text-[9px] uppercase font-bold text-[#5B8FB9] tracking-wider">Espacio de Objeto Activo</div>
                        <div className="text-xs font-bold text-white truncate">{currentFocus.name}</div>
                    </div>
                </div>
                {focusStack.length > 1 && (
                    <button
                        onClick={focusOutObject}
                        className="px-2 py-1 bg-white/10 hover:bg-white/20 text-xs text-zinc-200 rounded font-semibold"
                        title="Subir de nivel de objeto"
                    >
                        ← Salir
                    </button>
                )}
            </div>

            {/* Header Tabs */}
            <div className="flex border-b border-white/10 bg-black/40 shrink-0">
                <button
                    onClick={() => setActiveTab('intents')}
                    className={`flex-1 py-2.5 text-[11px] font-bold tracking-wider uppercase transition-colors border-b-2 ${
                        activeTab === 'intents'
                            ? 'border-[#5B8FB9] text-white bg-white/5'
                            : 'border-transparent text-zinc-400 hover:text-zinc-200'
                    }`}
                >
                    🎯 Intenciones
                </button>
                <button
                    onClick={() => setActiveTab('layers')}
                    className={`flex-1 py-2.5 text-[11px] font-bold tracking-wider uppercase transition-colors border-b-2 ${
                        activeTab === 'layers'
                            ? 'border-[#5B8FB9] text-white bg-white/5'
                            : 'border-transparent text-zinc-400 hover:text-zinc-200'
                    }`}
                >
                    📦 Objetos
                </button>
                <button
                    onClick={() => setActiveTab('library')}
                    className={`flex-1 py-2.5 text-[11px] font-bold tracking-wider uppercase transition-colors border-b-2 ${
                        activeTab === 'library'
                            ? 'border-[#5B8FB9] text-white bg-white/5'
                            : 'border-transparent text-zinc-400 hover:text-zinc-200'
                    }`}
                >
                    + Insertar
                </button>
            </div>

            {/* Tab: Declaración de Intención */}
            {activeTab === 'intents' && (
                <div className="flex-1 flex flex-col p-4 overflow-y-auto space-y-3">
                    <p className="text-xs text-zinc-400 leading-relaxed">
                        Declara el propósito semántico de este espacio. El Studio propondrá una composición limpia derivada.
                    </p>

                    <div className="space-y-2 pt-1">
                        {INTENT_CATALOG.map(intent => (
                            <div
                                key={intent.category}
                                onClick={() => addIntentZone(intent.category)}
                                className="p-3 bg-[#0e0e13] hover:bg-[#15151c] border border-white/10 hover:border-[#5B8FB9] rounded-2xl cursor-pointer transition-all group"
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2 font-bold text-xs text-zinc-100 group-hover:text-white">
                                        <span className="text-base">{intent.icon}</span>
                                        <span>{intent.name}</span>
                                    </div>
                                    <span className="text-[10px] text-[#5B8FB9] font-bold group-hover:translate-x-0.5 transition-transform">
                                        + Añadir
                                    </span>
                                </div>
                                <p className="text-[11px] text-zinc-400 leading-tight">
                                    {intent.description}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Tab: Objetos Contenidos */}
            {activeTab === 'layers' && (
                <div className="flex-1 overflow-y-auto p-3 space-y-4">
                    {Object.entries(regions).map(([regionId, blocks]) => (
                        <div key={regionId} className="space-y-1">
                            <div className="flex items-center justify-between px-2 py-1.5 bg-white/5 rounded-md border border-white/5 text-xs text-zinc-300 font-medium">
                                <span className="capitalize font-bold">Región {regionId}</span>
                                <span className="text-[10px] text-zinc-500 font-mono">{blocks.length}</span>
                            </div>

                            <div className="pl-2 space-y-1">
                                {blocks.map((block, idx) => {
                                    const isSelected = selectedBlockId === block.id;
                                    return (
                                        <div
                                            key={block.id}
                                            onClick={() => selectBlock(block.id)}
                                            onDoubleClick={() => focusIntoObject(block.id, block.props.title || block.type, block.type)}
                                            className={`group flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer border transition-all ${
                                                isSelected
                                                    ? 'bg-[#36606F] text-white border-[#5B8FB9] shadow-sm'
                                                    : 'bg-white/[0.02] border-white/5 text-zinc-300 hover:bg-white/10'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2 truncate">
                                                <span className="font-mono text-[10px] opacity-60">[{block.type}]</span>
                                                <span className="truncate font-medium">{block.props.title || block.type}</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); focusIntoObject(block.id, block.props.title || block.type, block.type); }} 
                                                    className="px-1.5 py-0.5 bg-purple-600/30 hover:bg-purple-600 text-purple-200 text-[10px] rounded font-bold"
                                                    title="Zoom dentro del objeto"
                                                >
                                                    Entrar 🔍
                                                </button>
                                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                                                    <button onClick={(e) => { e.stopPropagation(); moveBlock(block.id, 'up'); }} disabled={idx === 0} className="p-1">▲</button>
                                                    <button onClick={(e) => { e.stopPropagation(); moveBlock(block.id, 'down'); }} disabled={idx === blocks.length - 1} className="p-1">▼</button>
                                                    <button onClick={(e) => { e.stopPropagation(); removeBlock(block.id); }} className="p-1 text-rose-400">✕</button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Tab: Inserción Directa */}
            {activeTab === 'library' && (
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {BLOCK_LIBRARY.map((item) => (
                        <div key={item.type} className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl">
                            <div className="font-bold text-xs text-zinc-200 mb-1">{item.name}</div>
                            <p className="text-[11px] text-zinc-400 mb-2">{item.description}</p>
                            <div className="flex gap-1">
                                {Object.keys(regions).map(regId => (
                                    <button
                                        key={regId}
                                        onClick={() => addBlockToRegion(regId, item.type)}
                                        className="px-2 py-0.5 bg-[#36606F]/30 text-[#5B8FB9] hover:text-white rounded text-[10px] font-bold capitalize"
                                    >
                                        + {regId}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </aside>
    );
}
