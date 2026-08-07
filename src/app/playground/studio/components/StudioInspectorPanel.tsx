/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react/no-unescaped-entities */
'use client';

import React from 'react';
import { useStudioStore } from '../store';
import { MarbellaBlock } from '../types';

export default function StudioInspectorPanel() {
    const { 
        variants, 
        activeVariantId, 
        selectedBlockId, 
        updateBlockProps, 
        duplicateBlock, 
        removeBlock, 
        moveBlock,
        selectBlock
    } = useStudioStore();

    const activeVariant = variants.find(v => v.id === activeVariantId);
    
    // Locate selected block across all regions
    let selectedBlock: MarbellaBlock | null = null;

    if (activeVariant && selectedBlockId) {
        for (const blocks of Object.values(activeVariant.regions)) {
            const found = blocks.find(b => b.id === selectedBlockId);
            if (found) {
                selectedBlock = found;
                break;
            }
        }
    }

    if (!selectedBlock) {
        return (
            <aside className="w-80 border-l border-white/10 bg-[#09090b] flex flex-col shrink-0 text-white p-5 select-none z-20 overflow-y-auto">
                <div className="flex flex-col items-center justify-center h-full text-center text-zinc-500 py-12">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4 text-zinc-400">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                        </svg>
                    </div>
                    <h3 className="text-sm font-semibold text-zinc-300 mb-1">Ningún elemento seleccionado</h3>
                    <p className="text-xs text-zinc-400 leading-relaxed max-w-[200px]">
                        Haz clic sobre cualquier bloque en el lienzo para inspeccionar y modificar sus propiedades visualmente.
                    </p>
                </div>
            </aside>
        );
    }

    const { type, props, id } = selectedBlock;

    return (
        <aside className="w-80 border-l border-white/10 bg-[#09090b] flex flex-col shrink-0 text-white select-none z-20 overflow-hidden">
            {/* Inspector Header */}
            <div className="p-4 border-b border-white/10 bg-black/40 flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#5B8FB9]" />
                        <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                            {type}
                        </span>
                    </div>
                    <span className="text-[10px] text-zinc-400 font-mono">ID: {id}</span>
                </div>
                
                <button
                    onClick={() => selectBlock(null)}
                    className="text-zinc-500 hover:text-white p-1 rounded"
                    title="Cerrar inspector"
                >
                    ✕
                </button>
            </div>

            {/* Quick Actions Toolbar */}
            <div className="p-3 bg-white/[0.02] border-b border-white/10 flex items-center justify-between gap-1 text-xs">
                <button
                    onClick={() => moveBlock(id, 'up')}
                    className="flex-1 py-1.5 bg-white/5 hover:bg-white/10 rounded border border-white/10 text-zinc-300 transition-colors flex items-center justify-center gap-1"
                    title="Subir en lienzo"
                >
                    ▲ Subir
                </button>
                <button
                    onClick={() => moveBlock(id, 'down')}
                    className="flex-1 py-1.5 bg-white/5 hover:bg-white/10 rounded border border-white/10 text-zinc-300 transition-colors flex items-center justify-center gap-1"
                    title="Bajar en lienzo"
                >
                    ▼ Bajar
                </button>
                <button
                    onClick={() => duplicateBlock(id)}
                    className="flex-1 py-1.5 bg-[#36606F]/30 hover:bg-[#36606F] text-[#5B8FB9] hover:text-white rounded border border-[#36606F]/50 transition-colors flex items-center justify-center gap-1 font-semibold"
                    title="Duplicar bloque"
                >
                    ⧉ Duplicar
                </button>
                <button
                    onClick={() => removeBlock(id)}
                    className="p-1.5 bg-rose-500/10 hover:bg-rose-500 text-rose-300 hover:text-white rounded border border-rose-500/30 transition-colors"
                    title="Eliminar"
                >
                    🗑
                </button>
            </div>

            {/* Visual Controls Container */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                
                {/* PAGE HEADER PROPS */}
                {type === 'page-header' && (
                    <div className="space-y-4">
                        <div className="text-[10px] uppercase font-bold tracking-widest text-[#5B8FB9]">
                            Propiedades de Cabecera
                        </div>

                        <div>
                            <label className="block text-xs text-zinc-400 font-medium mb-1">Título principal</label>
                            <input
                                type="text"
                                value={props.title || ''}
                                onChange={(e) => updateBlockProps(id, { title: e.target.value })}
                                className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#5B8FB9]"
                                placeholder="Título de la sección..."
                            />
                        </div>

                        <div>
                            <label className="block text-xs text-zinc-400 font-medium mb-1">Descripción / Subtítulo</label>
                            <textarea
                                value={props.description || ''}
                                onChange={(e) => updateBlockProps(id, { description: e.target.value })}
                                className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#5B8FB9] h-20 resize-none"
                                placeholder="Subtítulo corto..."
                            />
                        </div>

                        <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                            <div>
                                <div className="text-xs font-semibold text-zinc-200">Estilo Monumental</div>
                                <div className="text-[10px] text-zinc-400">Fondo amplio con cifras KPI en cabecera</div>
                            </div>
                            <input
                                type="checkbox"
                                checked={!!props.isMonumental}
                                onChange={(e) => updateBlockProps(id, { isMonumental: e.target.checked })}
                                className="w-4 h-4 accent-[#36606F] rounded cursor-pointer"
                            />
                        </div>

                        {/* KPI Metrics Editor if Monumental */}
                        {props.isMonumental && (
                            <div className="space-y-2 pt-2 border-t border-white/10">
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-semibold text-zinc-300">Métricas KPI</span>
                                    <button
                                        onClick={() => {
                                            const currentKpis = props.kpis || [];
                                            updateBlockProps(id, {
                                                kpis: [...currentKpis, { label: 'Nueva Cifra', value: '10' }]
                                            });
                                        }}
                                        className="text-[10px] text-[#5B8FB9] hover:underline font-semibold"
                                    >
                                        + Añadir KPI
                                    </button>
                                </div>

                                {(props.kpis || []).map((kpi: any, index: number) => (
                                    <div key={index} className="p-2 bg-white/5 rounded-lg border border-white/10 space-y-2">
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={kpi.label || ''}
                                                onChange={(e) => {
                                                    const kpis = [...props.kpis];
                                                    kpis[index] = { ...kpis[index], label: e.target.value };
                                                    updateBlockProps(id, { kpis });
                                                }}
                                                className="flex-1 bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
                                                placeholder="Etiqueta"
                                            />
                                            <input
                                                type="text"
                                                value={kpi.value || ''}
                                                onChange={(e) => {
                                                    const kpis = [...props.kpis];
                                                    kpis[index] = { ...kpis[index], value: e.target.value };
                                                    updateBlockProps(id, { kpis });
                                                }}
                                                className="w-20 bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-center font-bold"
                                                placeholder="Valor"
                                            />
                                            <button
                                                onClick={() => {
                                                    const kpis = props.kpis.filter((_: any, i: number) => i !== index);
                                                    updateBlockProps(id, { kpis });
                                                }}
                                                className="text-rose-400 p-1 hover:bg-rose-500/20 rounded"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* DATA TABLE PROPS */}
                {type === 'data-table' && (
                    <div className="space-y-4">
                        <div className="text-[10px] uppercase font-bold tracking-widest text-[#5B8FB9]">
                            Propiedades de Tabla / Lista
                        </div>

                        <div>
                            <label className="block text-xs text-zinc-400 font-medium mb-1">Título del contenedor</label>
                            <input
                                type="text"
                                value={props.title || ''}
                                onChange={(e) => updateBlockProps(id, { title: e.target.value })}
                                className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#5B8FB9]"
                                placeholder="Ej: Plantilla Activa"
                            />
                        </div>

                        <div>
                            <label className="block text-xs text-zinc-400 font-medium mb-1">Formato Visual</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => updateBlockProps(id, { format: 'table' })}
                                    className={`py-2 rounded-lg text-xs font-medium border transition-all ${
                                        props.format !== 'list'
                                            ? 'bg-[#36606F] border-[#5B8FB9] text-white'
                                            : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
                                    }`}
                                >
                                    Tabla Matricial
                                </button>
                                <button
                                    onClick={() => updateBlockProps(id, { format: 'list' })}
                                    className={`py-2 rounded-lg text-xs font-medium border transition-all ${
                                        props.format === 'list'
                                            ? 'bg-[#36606F] border-[#5B8FB9] text-white'
                                            : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
                                    }`}
                                >
                                    Tarjetas Lista
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs text-zinc-400 font-medium mb-1">Densidad de datos</label>
                            <select
                                value={props.density || 'standard'}
                                onChange={(e) => updateBlockProps(id, { density: e.target.value })}
                                className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#5B8FB9]"
                            >
                                <option value="high" className="bg-[#121214]">Alta Densidad (Pro-Tool compacta)</option>
                                <option value="standard" className="bg-[#121214]">Estándar (16px padding)</option>
                                <option value="low" className="bg-[#121214]">Baja Densidad (Amplia / Ejecutiva)</option>
                            </select>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                            <div>
                                <div className="text-xs font-semibold text-zinc-200">Enmarcado (Boxed Card)</div>
                                <div className="text-[10px] text-zinc-400">Sombra suave y tarjeta contenida</div>
                            </div>
                            <input
                                type="checkbox"
                                checked={!!props.boxed}
                                onChange={(e) => updateBlockProps(id, { boxed: e.target.checked })}
                                className="w-4 h-4 accent-[#36606F] rounded cursor-pointer"
                            />
                        </div>
                    </div>
                )}

                {/* FILTER BAR PROPS */}
                {type === 'filter-bar' && (
                    <div className="space-y-4">
                        <div className="text-[10px] uppercase font-bold tracking-widest text-[#5B8FB9]">
                            Propiedades de Barra de Filtros
                        </div>

                        <div>
                            <label className="block text-xs text-zinc-400 font-medium mb-1">Placeholder del buscador</label>
                            <input
                                type="text"
                                value={props.placeholder || 'Buscar...'}
                                onChange={(e) => updateBlockProps(id, { placeholder: e.target.value })}
                                className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#5B8FB9]"
                            />
                        </div>

                        <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                            <span className="text-xs font-semibold text-zinc-200">Campo de búsqueda</span>
                            <input
                                type="checkbox"
                                checked={props.showSearch !== false}
                                onChange={(e) => updateBlockProps(id, { showSearch: e.target.checked })}
                                className="w-4 h-4 accent-[#36606F] rounded cursor-pointer"
                            />
                        </div>

                        <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                            <span className="text-xs font-semibold text-zinc-200">Botón "Nuevo Registro"</span>
                            <input
                                type="checkbox"
                                checked={props.showNew !== false}
                                onChange={(e) => updateBlockProps(id, { showNew: e.target.checked })}
                                className="w-4 h-4 accent-[#36606F] rounded cursor-pointer"
                            />
                        </div>

                        <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/10">
                            <span className="text-xs font-semibold text-zinc-200">Estilo Flotante Enmarcado</span>
                            <input
                                type="checkbox"
                                checked={!!props.boxed}
                                onChange={(e) => updateBlockProps(id, { boxed: e.target.checked })}
                                className="w-4 h-4 accent-[#36606F] rounded cursor-pointer"
                            />
                        </div>
                    </div>
                )}

                {/* KPI GRID PROPS */}
                {type === 'kpi-grid' && (
                    <div className="space-y-4">
                        <div className="text-[10px] uppercase font-bold tracking-widest text-[#5B8FB9]">
                            Propiedades de Rejilla KPI
                        </div>

                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-semibold text-zinc-300">Tarjetas de Métricas</span>
                                <button
                                    onClick={() => {
                                        const currentItems = props.items || [];
                                        updateBlockProps(id, {
                                            items: [...currentItems, { label: 'Nueva Cifra', value: '100', change: 'Normal' }]
                                        });
                                    }}
                                    className="text-[10px] text-[#5B8FB9] font-semibold hover:underline"
                                >
                                    + Añadir Tarjeta
                                </button>
                            </div>

                            {(props.items || []).map((item: any, index: number) => (
                                <div key={index} className="p-3 bg-white/5 rounded-xl border border-white/10 space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-bold text-zinc-400 uppercase">KPI #{index + 1}</span>
                                        <button
                                            onClick={() => {
                                                const items = props.items.filter((_: any, i: number) => i !== index);
                                                updateBlockProps(id, { items });
                                            }}
                                            className="text-rose-400 text-xs hover:bg-rose-500/20 px-1 rounded"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                    <input
                                        type="text"
                                        value={item.label || ''}
                                        onChange={(e) => {
                                            const items = [...props.items];
                                            items[index] = { ...items[index], label: e.target.value };
                                            updateBlockProps(id, { items });
                                        }}
                                        className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs"
                                        placeholder="Etiqueta (ej: Empleados Activos)"
                                    />
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={item.value || ''}
                                            onChange={(e) => {
                                                const items = [...props.items];
                                                items[index] = { ...items[index], value: e.target.value };
                                                updateBlockProps(id, { items });
                                            }}
                                            className="w-1/2 bg-black/40 border border-white/10 rounded px-2 py-1 text-xs font-bold text-white"
                                            placeholder="Valor (ej: 42)"
                                        />
                                        <input
                                            type="text"
                                            value={item.change || ''}
                                            onChange={(e) => {
                                                const items = [...props.items];
                                                items[index] = { ...items[index], change: e.target.value };
                                                updateBlockProps(id, { items });
                                            }}
                                            className="w-1/2 bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-zinc-400"
                                            placeholder="Detalle (ej: +3 este mes)"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* SIDEBAR NAV PROPS */}
                {type === 'sidebar-nav' && (
                    <div className="space-y-4">
                        <div className="text-[10px] uppercase font-bold tracking-widest text-[#5B8FB9]">
                            Propiedades de Menú
                        </div>

                        <div>
                            <label className="block text-xs text-zinc-400 font-medium mb-1">Estilo de Navegación</label>
                            <select
                                value={props.variant || 'app-menu'}
                                onChange={(e) => updateBlockProps(id, { variant: e.target.value })}
                                className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#5B8FB9]"
                            >
                                <option value="app-menu" className="bg-[#121214]">Menú Principal de Aplicación</option>
                                <option value="page-menu" className="bg-[#121214]">Menú Flotante de Sección</option>
                            </select>
                        </div>
                    </div>
                )}

                {/* CONTAINER / CALLOUT PROPS */}
                {(type === 'container-block' || type === 'callout-banner') && (
                    <div className="space-y-4">
                        <div className="text-[10px] uppercase font-bold tracking-widest text-[#5B8FB9]">
                            Propiedades del Tarjeta
                        </div>
                        <div>
                            <label className="block text-xs text-zinc-400 font-medium mb-1">Título</label>
                            <input
                                type="text"
                                value={props.title || ''}
                                onChange={(e) => updateBlockProps(id, { title: e.target.value })}
                                className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-xs text-white"
                            />
                        </div>
                    </div>
                )}

                {/* COMMON STYLING CONTROLS */}
                <div className="pt-6 border-t border-white/10 space-y-4">
                    <div className="text-[10px] uppercase font-bold tracking-widest text-zinc-500">
                        Estilos & Tokens de Marbella OS
                    </div>

                    <div className="p-3 bg-white/5 rounded-xl border border-white/10 space-y-2">
                        <div className="flex justify-between text-xs">
                            <span className="text-zinc-400">Radio de Borde:</span>
                            <span className="font-mono text-zinc-200">12px (Token control)</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-zinc-400">Objetivo Táctil Mínimo:</span>
                            <span className="font-mono text-[#5B8FB9]">48px</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-zinc-400">Fuente Canónica:</span>
                            <span className="font-mono text-zinc-200">Inter</span>
                        </div>
                    </div>
                </div>

            </div>
        </aside>
    );
}
