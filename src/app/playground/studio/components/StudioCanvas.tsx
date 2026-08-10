/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React from 'react';
import { useStudioStore } from '../store';
import { MarbellaBlock, MarbellaVariant } from '../types';
import StudioBlockWrapper from './StudioBlockWrapper';

// ==========================================
// 1. COMPONENT REGISTRY (Visual Block Renderer)
// ==========================================

function PageHeaderBlock({ props }: { props: any }) {
    if (props.isMonumental) {
        return (
            <div className="bg-white border-b border-zinc-200 rounded-2xl shadow-sm overflow-hidden mb-6">
                <div className="max-w-7xl mx-auto px-8 py-10">
                    <div className="inline-block px-2.5 py-1 bg-[#36606F]/10 text-[#36606F] text-xs font-bold rounded-full uppercase tracking-wider mb-3">
                        Vista Monumental
                    </div>
                    <h1 className="text-4xl font-bold tracking-tight text-zinc-900 mb-3">
                        {props.title || 'Título Monumental'}
                    </h1>
                    {props.description && (
                        <p className="text-zinc-500 text-base max-w-2xl leading-relaxed mb-6">
                            {props.description}
                        </p>
                    )}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6 pt-6 border-t border-zinc-100">
                        {(props.kpis || []).map((kpi: any, i: number) => (
                            <div key={i} className="bg-zinc-50 p-4 rounded-xl border border-zinc-200">
                                <div className={`text-3xl font-extrabold ${kpi.alert ? 'text-amber-600' : 'text-[#36606F]'}`}>
                                    {kpi.value}
                                </div>
                                <div className="text-xs font-semibold text-zinc-500 mt-1 uppercase tracking-wider">
                                    {kpi.label}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="mb-6 bg-white p-6 rounded-2xl border border-zinc-200/80 shadow-sm">
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
                {props.title || 'Título de la Sección'}
            </h1>
            {props.description && (
                <p className="text-zinc-500 text-sm mt-2 leading-relaxed">
                    {props.description}
                </p>
            )}
            {props.showStats && (
                <div className="flex items-center gap-4 mt-4 pt-4 border-t border-zinc-100 text-xs text-zinc-500 font-medium">
                    <span className="flex items-center gap-1 text-emerald-600">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" /> Sistema Operativo Activo
                    </span>
                    <span>•</span>
                    <span>Última actualización: hace 2 min</span>
                </div>
            )}
        </div>
    );
}

function DataTableBlock({ props }: { props: any }) {
    const isBoxed = props.boxed;
    const isList = props.format === 'list';
    const density = props.density || 'standard';

    if (isList) {
        return (
            <div className="space-y-3 mb-6">
                {props.title && (
                    <h3 className="text-base font-bold text-zinc-800 tracking-tight px-1">
                        {props.title}
                    </h3>
                )}
                {[1, 2, 3].map(i => (
                    <div 
                        key={i} 
                        className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-sm hover:border-[#36606F] transition-all flex items-center justify-between"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-11 h-11 rounded-full bg-[#36606F]/10 text-[#36606F] flex items-center justify-center font-bold text-sm">
                                E{i}
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-zinc-900">Empleado {i} - Carlos Mendoza</h3>
                                <p className="text-xs text-zinc-500">Camarero Principal • Turno Mañana • 38.5h</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold rounded-full">
                                Activo
                            </span>
                            <button className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-xs font-medium min-h-[48px]">
                                Gestionar
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    const cellPadding = density === 'high' ? 'px-3 py-2 text-xs' : density === 'low' ? 'px-6 py-4 text-base' : 'px-4 py-3 text-sm';
    const wrapperClass = isBoxed 
        ? "bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden mb-6" 
        : "border border-zinc-200 rounded-xl bg-white overflow-hidden mb-6 shadow-sm";

    const columns = props.columns || ['Nombre', 'Puesto / Rol', 'Estado', 'Horas Semanal'];

    return (
        <div className={wrapperClass}>
            {props.title && (
                <div className="px-6 py-4 border-b border-zinc-100 font-bold text-zinc-900 flex justify-between items-center bg-zinc-50/50">
                    <span>{props.title}</span>
                    <span className="text-xs text-zinc-500 font-normal">Mostrando 4 registros</span>
                </div>
            )}
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-zinc-100/70 text-zinc-600 uppercase text-[11px] font-bold tracking-wider border-b border-zinc-200">
                        <tr>
                            {columns.map((col: string, idx: number) => (
                                <th key={idx} className={cellPadding}>{col}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 font-medium text-zinc-800">
                        {[
                            { name: 'Alejandro Gómez', role: 'Encargado de Sala', status: 'Activo', hours: '40.0h' },
                            { name: 'María Fernández', role: 'Camarera', status: 'Activa', hours: '38.5h' },
                            { name: 'David Ruíz', role: 'Cocinero', status: 'En Turno', hours: '42.0h' },
                            { name: 'Lucía Torres', role: 'Ayudante Cocina', status: 'Baja Temporal', hours: '0.0h' },
                        ].map((row, i) => (
                            <tr key={i} className="hover:bg-zinc-50/80 transition-colors">
                                <td className={`${cellPadding} font-semibold text-zinc-900`}>{row.name}</td>
                                <td className={cellPadding}>{row.role}</td>
                                <td className={cellPadding}>
                                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                                        row.status.includes('Baja') 
                                            ? 'bg-rose-50 text-rose-600 border border-rose-200' 
                                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    }`}>
                                        {row.status}
                                    </span>
                                </td>
                                <td className={`${cellPadding} font-mono font-bold text-zinc-700`}>{row.hours}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function FilterBarBlock({ props }: { props: any }) {
    if (props.boxed) {
        return (
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-zinc-200 flex flex-wrap items-center justify-between gap-4 mb-6">
                <div className="flex-1 min-w-[240px] relative">
                    <input
                        type="text"
                        readOnly
                        placeholder={props.placeholder || "Buscar..."}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 text-sm text-zinc-700 placeholder-zinc-400 focus:outline-none min-h-[48px]"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <button className="px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-medium text-xs rounded-xl border border-zinc-200 min-h-[48px]">
                        Filtros Avanzados
                    </button>
                    <button className="px-5 py-2.5 bg-[#36606F] text-white font-semibold text-xs rounded-xl shadow-sm min-h-[48px]">
                        + Nuevo Empleado
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-2">
                {props.showSearch !== false && (
                    <input
                        type="text"
                        readOnly
                        placeholder={props.placeholder || "Buscar..."}
                        className="bg-white border border-zinc-200 rounded-xl px-3.5 py-2 text-xs text-zinc-700 placeholder-zinc-400 min-h-[48px] w-64 shadow-sm"
                    />
                )}
            </div>
            {props.showNew !== false && (
                <button className="bg-[#36606F] text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-sm min-h-[48px]">
                    + Nuevo Registro
                </button>
            )}
        </div>
    );
}

function SidebarNavBlock({ props }: { props: any }) {
    if (props.variant === 'page-menu') {
        return (
            <div className="bg-white p-3 rounded-2xl border border-zinc-200 shadow-sm space-y-1 mb-6">
                <div className="text-[10px] uppercase font-bold text-zinc-400 px-3 py-1">Navegación de Sección</div>
                <div className="px-3.5 py-2.5 bg-[#36606F] text-white rounded-xl text-sm font-semibold shadow-sm">Directorio Activo</div>
                <div className="px-3.5 py-2.5 text-zinc-600 hover:bg-zinc-50 rounded-xl text-sm font-medium">Horarios & Turnos</div>
                <div className="px-3.5 py-2.5 text-zinc-600 hover:bg-zinc-50 rounded-xl text-sm font-medium">Contratos & Nóminas</div>
            </div>
        );
    }

    return (
        <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm space-y-6 mb-6">
            <div>
                <div className="text-[10px] uppercase font-bold text-zinc-400 mb-3 tracking-wider">Menú Principal</div>
                <div className="space-y-1">
                    <div className="bg-[#36606F]/10 text-[#36606F] border border-[#36606F]/20 px-3 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#36606F]" />
                        Dashboard
                    </div>
                    <div className="px-3 py-2.5 text-zinc-600 hover:bg-zinc-50 rounded-xl text-sm font-medium">Operaciones</div>
                    <div className="px-3 py-2.5 text-zinc-600 hover:bg-zinc-50 rounded-xl text-sm font-medium">Personal</div>
                    <div className="px-3 py-2.5 text-zinc-600 hover:bg-zinc-50 rounded-xl text-sm font-medium">Configuración</div>
                </div>
            </div>
        </div>
    );
}

function KpiGridBlock({ props }: { props: any }) {
    const items = props.items || [
        { label: 'Personal Activo', value: '42', change: '+3 este mes' },
        { label: 'Turno Actual', value: '18 camareros', change: '100% cobertura' }
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {items.map((item: any, idx: number) => (
                <div key={idx} className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm">
                    <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                        {item.label}
                    </div>
                    <div className="text-3xl font-extrabold text-zinc-900 tracking-tight">
                        {item.value}
                    </div>
                    {item.change && (
                        <div className="text-xs font-medium text-emerald-600 mt-2 flex items-center gap-1">
                            <span>↑</span>
                            <span>{item.change}</span>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

function ContainerBlock({ props }: { props: any }) {
    return (
        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm mb-6">
            <h3 className="text-lg font-bold text-zinc-900 mb-2">{props.title || 'Tarjeta Contenedora'}</h3>
            <p className="text-sm text-zinc-500">
                Bloque contenedor modular para agrupar tarjetas, gráficos e interfaces personalizadas.
            </p>
        </div>
    );
}

function CalloutBannerBlock({ props }: { props: any }) {
    return (
        <div className="bg-amber-50 border border-amber-200 p-5 rounded-2xl mb-6 flex items-start gap-4 shadow-sm">
            <div className="text-amber-600 font-bold text-xl">⚠️</div>
            <div>
                <h4 className="text-sm font-bold text-amber-900">{props.title || 'Aviso del Sistema'}</h4>
                <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                    {props.message || 'Existen fichajes pendientes de revisión para la semana actual.'}
                </p>
            </div>
        </div>
    );
}

const REGISTRY: Record<string, React.FC<{ props: any }>> = {
    'page-header': PageHeaderBlock,
    'data-table': DataTableBlock,
    'filter-bar': FilterBarBlock,
    'sidebar-nav': SidebarNavBlock,
    'kpi-grid': KpiGridBlock,
    'container-block': ContainerBlock,
    'callout-banner': CalloutBannerBlock,
};

// ==========================================
// 2. REGION RENDER ENGINE (With Level-Aware Wrappers & Dropzones)
// ==========================================

function RegionRenderer({ regionId, blocks = [] }: { regionId: string; blocks?: MarbellaBlock[] }) {
    const { addIntentZone, viewMode, currentLevel } = useStudioStore();

    if (!blocks || blocks.length === 0) {
        if (viewMode === 'preview') return null;
        return (
            <div 
                onClick={() => addIntentZone('identidad', regionId)}
                className="border-2 border-dashed border-zinc-300 hover:border-[#36606F] bg-zinc-100/50 hover:bg-[#36606F]/5 rounded-2xl p-6 text-center cursor-pointer transition-all mb-6 group"
            >
                <div className="text-zinc-400 group-hover:text-[#36606F] text-xs font-bold uppercase tracking-wider mb-1">
                    Región {regionId} Vacía
                </div>
                <div className="text-sm text-zinc-600 font-medium group-hover:text-[#36606F]">
                    🎯 + Declara una Zona de Intención para la región {regionId}
                </div>
            </div>
        );
    }

    return (
        <div className="relative">
            {blocks.map(block => {
                const Component = REGISTRY[block.type];
                return (
                    <StudioBlockWrapper key={block.id} block={block} regionId={regionId}>
                        {Component ? (
                            <Component props={block.props} />
                        ) : (
                            <div className="p-4 bg-rose-50 text-rose-600 rounded-xl text-xs border border-rose-200">
                                Tipo de bloque desconocido: {block.type}
                            </div>
                        )}
                    </StudioBlockWrapper>
                );
            })}

            {/* Bottom intent dropzone button per region in edit mode */}
            {viewMode === 'edit' && currentLevel <= 2 && (
                <button
                    onClick={() => addIntentZone('datos', regionId)}
                    className="w-full py-2.5 border border-dashed border-zinc-300 hover:border-[#36606F] rounded-xl text-xs font-bold text-zinc-500 hover:text-[#36606F] hover:bg-[#36606F]/5 transition-all mb-4 flex items-center justify-center gap-1.5"
                >
                    <span>🎯 + Declarar nueva Zona de Intención en {regionId}</span>
                </button>
            )}
        </div>
    );
}

// ==========================================
// 3. LAYOUT SCHEMAS
// ==========================================

function ControlPanelLayout({ regions }: { regions: MarbellaVariant['regions'] }) {
    return (
        <div className="flex min-h-[85vh] bg-zinc-50 text-zinc-900 rounded-2xl overflow-hidden border border-zinc-300/80 shadow-2xl">
            <aside className="w-64 border-r border-zinc-200 bg-white p-6 shrink-0">
                <RegionRenderer regionId="sidebar" blocks={regions['sidebar']} />
            </aside>
            <main className="flex-1 p-8 overflow-y-auto">
                <RegionRenderer regionId="header" blocks={regions['header']} />
                <RegionRenderer regionId="main" blocks={regions['main']} />
            </main>
        </div>
    );
}

function FocusedCanvasLayout({ regions }: { regions: MarbellaVariant['regions'] }) {
    return (
        <div className="min-h-[85vh] bg-zinc-50 text-zinc-900 py-10 px-6 rounded-2xl border border-zinc-300/80 shadow-2xl">
            <main className="max-w-4xl mx-auto">
                <RegionRenderer regionId="header" blocks={regions['header']} />
                <RegionRenderer regionId="main" blocks={regions['main']} />
            </main>
        </div>
    );
}

function BimodalLayout({ regions }: { regions: MarbellaVariant['regions'] }) {
    return (
        <div className="min-h-[85vh] bg-zinc-50 text-zinc-900 rounded-2xl overflow-hidden border border-zinc-300/80 shadow-2xl">
            <RegionRenderer regionId="header" blocks={regions['header']} />
            <div className="max-w-7xl mx-auto px-8 py-8 flex gap-10">
                <nav className="w-64 shrink-0">
                    <RegionRenderer regionId="sidebar" blocks={regions['sidebar']} />
                </nav>
                <main className="flex-1">
                    <RegionRenderer regionId="main" blocks={regions['main']} />
                </main>
            </div>
        </div>
    );
}

// ==========================================
// 4. MAIN CANVAS ENGINE
// ==========================================

export default function StudioCanvas({ variantId }: { variantId: string }) {
    const { variants, viewportPreset, zoom } = useStudioStore();
    const variant = variants.find(v => v.id === variantId);

    if (!variant) {
        return <div className="p-8 text-zinc-400 text-sm">Variante no encontrada</div>;
    }

    let containerWidthClass = 'w-full max-w-[1400px]';
    if (viewportPreset === 'tablet') containerWidthClass = 'w-[768px]';
    if (viewportPreset === 'mobile') containerWidthClass = 'w-[375px]';

    return (
        <div className="flex justify-center items-start min-h-full p-8 transition-all">
            <div 
                className={`${containerWidthClass} transition-all duration-300`}
                style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
            >
                {variant.layout === 'control-panel' && <ControlPanelLayout regions={variant.regions} />}
                {variant.layout === 'focused-canvas' && <FocusedCanvasLayout regions={variant.regions} />}
                {variant.layout === 'bimodal' && <BimodalLayout regions={variant.regions} />}
            </div>
        </div>
    );
}
