'use client';

import React, { useState } from 'react';
import { useStudioStore } from '../store';
import { BlockType, IntentCategory, SpatialCompositionFlow } from '../types';

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
    const [activeTab, setActiveTab] = useState<'layers' | 'library'>('layers');
    const { 
        variants, 
        activeVariantId, 
        selectedBlockId, 
        selectBlock, 
        addBlockToRegion, 
        removeBlock, 
        moveBlock,
        updateVariantSpatialFlow,
        currentLevel,
        setCurrentLevel,
        addIntentZone,
        tokens,
        updateSystemToken,
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

            {/* LEVEL 1: DECLARACIÓN DE INTENCIÓN */}
            {currentLevel === 1 && (
                <div className="flex-1 flex flex-col p-4 overflow-y-auto space-y-4">
                    <div>
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#5B8FB9] mb-1">
                            <span>🎯 Intención del Objeto</span>
                        </div>
                        <p className="text-xs text-zinc-400 leading-relaxed">
                            Declara el propósito semántico de este espacio. El Studio propondrá una composición derivada.
                        </p>
                    </div>

                    <div className="space-y-2">
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

                    <div className="mt-auto pt-4 border-t border-white/10 text-center">
                        <button
                            onClick={() => setCurrentLevel(2)}
                            className="w-full py-2 bg-white/5 hover:bg-white/10 text-xs font-semibold text-zinc-300 rounded-xl transition-colors"
                        >
                            Ver Composición Espacial (Nivel 2) →
                        </button>
                    </div>
                </div>
            )}

            {/* LEVEL 2: COMPOSICIÓN ESPACIAL Y FLUJO */}
            {currentLevel === 2 && (
                <div className="flex-1 flex flex-col p-4 overflow-y-auto space-y-5">
                    <div>
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#5B8FB9] mb-1">
                            <span>📐 Composición & Flujo Espacial</span>
                        </div>
                        <p className="text-xs text-zinc-400 leading-relaxed">
                            Ajusta cómo se agrupa y distribuye espacialmente el contenido de este espacio.
                        </p>
                    </div>

                    <div>
                        <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider mb-2">Flujo de Distribución</h4>
                        <div className="space-y-2">
                            {[
                                { id: 'fluid-stack', name: 'Apilamiento Fluido (Stack)', desc: 'Distribución en bloques fluidos con ritmo vertical.' },
                                { id: 'hero-header', name: 'Enfoque Hero / Monumental', desc: 'Cabecera de impacto superior + Contenido central.' },
                                { id: 'grid-surface', name: 'Rejilla Modular', desc: 'Disposición matricial elástica.' },
                                { id: 'clean-canvas', name: 'Lienzo Limpio Continuo', desc: 'Lectura ininterrumpida de baja densidad.' }
                            ].map(flowOpt => (
                                <button
                                    key={flowOpt.id}
                                    onClick={() => updateVariantSpatialFlow(flowOpt.id as SpatialCompositionFlow)}
                                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                                        activeVariant.layout === flowOpt.id
                                            ? 'bg-[#36606F]/30 border-[#5B8FB9] text-white shadow-md'
                                            : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'
                                    }`}
                                >
                                    <div className="font-bold text-xs mb-0.5">{flowOpt.name}</div>
                                    <div className="text-[11px] text-zinc-400">{flowOpt.desc}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="pt-4 border-t border-white/10 flex gap-2">
                        <button
                            onClick={() => setCurrentLevel(1)}
                            className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-xs font-semibold text-zinc-400 rounded-xl"
                        >
                            ← Intención (Nivel 1)
                        </button>
                        <button
                            onClick={() => setCurrentLevel(3)}
                            className="flex-1 py-2 bg-[#36606F] hover:bg-[#407080] text-xs font-bold text-white rounded-xl"
                        >
                            Componentes (Nivel 3) →
                        </button>
                    </div>
                </div>
            )}

            {/* LEVEL 3: COMPONENTES Y ÁRBOLES DE CAPAS RECURSIVOS */}
            {currentLevel === 3 && (
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Header Tabs */}
                    <div className="flex border-b border-white/10 bg-black/40 shrink-0">
                        <button
                            onClick={() => setActiveTab('layers')}
                            className={`flex-1 py-3 text-xs font-semibold tracking-wider uppercase transition-colors border-b-2 ${
                                activeTab === 'layers'
                                    ? 'border-[#5B8FB9] text-white bg-white/5'
                                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                            }`}
                        >
                            Objetos Contenidos
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
                    </div>

                    {/* Tab content */}
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
                </div>
            )}

            {/* LEVEL 4: PROPIEDADES */}
            {currentLevel === 4 && (
                <div className="flex-1 flex flex-col p-4 overflow-y-auto space-y-4">
                    <div>
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#5B8FB9] mb-1">
                            <span>🎛️ Propiedades del Objeto</span>
                        </div>
                        <p className="text-xs text-zinc-400 leading-relaxed">
                            Inspecciona y ajusta las propiedades del objeto activo en el Inspector Derecho.
                        </p>
                    </div>

                    <div className="p-4 bg-white/5 rounded-2xl border border-white/10 text-xs text-zinc-300 space-y-2">
                        <div className="font-bold text-white">Objeto en Inspección:</div>
                        <div className="font-mono text-[11px] text-[#5B8FB9]">{selectedBlockId || currentFocus.name}</div>
                        <p className="text-[11px] text-zinc-400">
                            Ajusta densidades, textos y estados visuales en el panel derecho.
                        </p>
                    </div>

                    <div className="mt-auto pt-4 border-t border-white/10 flex gap-2">
                        <button
                            onClick={() => setCurrentLevel(3)}
                            className="flex-1 py-2 bg-white/5 text-xs font-semibold text-zinc-400 rounded-xl"
                        >
                            ← Componentes (Nivel 3)
                        </button>
                        <button
                            onClick={() => setCurrentLevel(5)}
                            className="flex-1 py-2 bg-purple-600/30 hover:bg-purple-600 text-xs font-bold text-purple-200 hover:text-white rounded-xl border border-purple-500/40"
                        >
                            Evolucionar OS (Nivel 5) →
                        </button>
                    </div>
                </div>
            )}

            {/* LEVEL 5: TOKENS / FUNDAMENTOS DE MARBELLA OS */}
            {currentLevel === 5 && (
                <div className="flex-1 flex flex-col p-4 overflow-y-auto space-y-5">
                    <div>
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-400 mb-1">
                            <span>🧬 Fundamentos de Marbella OS</span>
                        </div>
                        <p className="text-xs text-zinc-400 leading-relaxed">
                            Evoluciona los valores constitucionales que gobiernan a Marbella.
                        </p>
                    </div>

                    <div className="space-y-3">
                        {Object.entries(tokens).map(([tokenKey, value]) => (
                            <div key={tokenKey} className="p-3 bg-white/5 rounded-xl border border-white/10 space-y-1">
                                <div className="text-[10px] font-mono text-purple-300 font-bold uppercase tracking-wider">{tokenKey}</div>
                                <input
                                    type="text"
                                    value={value}
                                    onChange={(e) => updateSystemToken(tokenKey, e.target.value)}
                                    className="w-full bg-black/40 border border-white/15 rounded-lg px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-purple-400"
                                />
                            </div>
                        ))}
                    </div>

                    <div className="mt-auto pt-4 border-t border-white/10">
                        <button
                            onClick={() => setCurrentLevel(1)}
                            className="w-full py-2 bg-white/5 hover:bg-white/10 text-xs font-semibold text-zinc-300 rounded-xl"
                        >
                            ← Salir a Intención (Nivel 1)
                        </button>
                    </div>
                </div>
            )}
        </aside>
    );
}
