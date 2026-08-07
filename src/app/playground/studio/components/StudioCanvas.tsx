'use client';

import React from 'react';
import { useStudioStore } from '../store';
import { MarbellaBlock, MarbellaVariant, LayoutType } from '../types';

// ==========================================
// 1. DUMMY COMPONENT REGISTRY (The "Design System")
// ==========================================

function PageHeaderBlock({ props }: { props: any }) {
    if (props.isMonumental) {
        return (
            <div className="bg-white border-b border-zinc-200">
                <div className="max-w-7xl mx-auto px-6 py-12">
                    <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 mb-2">{props.title}</h1>
                    <div className="flex gap-6 mt-4">
                        {(props.kpis || []).map((kpi: any, i: number) => (
                            <div key={i}>
                                <div className={`text-3xl font-bold ${kpi.alert ? 'text-amber-600' : 'text-zinc-900'}`}>{kpi.value}</div>
                                <div className="text-sm font-medium text-zinc-500">{kpi.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }
    return (
        <div className="mb-8">
            <h1 className="text-3xl font-light tracking-tight text-zinc-900">{props.title}</h1>
            {props.description && <p className="text-zinc-500 mt-2">{props.description}</p>}
            {props.showStats && <p className="text-zinc-400 text-xs mt-1">Stats placeholder</p>}
        </div>
    );
}

function DataTableBlock({ props }: { props: any }) {
    const isBoxed = props.boxed;
    const isList = props.format === 'list';

    if (isList) {
        return (
            <div className="space-y-4">
                {[1, 2, 3].map(i => (
                    <div key={i} className="bg-white p-6 rounded-2xl border border-zinc-100 hover:border-zinc-300 shadow-sm flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 font-medium">E{i}</div>
                        <div>
                            <h3 className="text-lg font-medium text-zinc-900">Empleado {i}</h3>
                            <p className="text-sm text-zinc-500">Camarero • 38.5h</p>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    const wrapperClass = isBoxed ? "bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden" : "border border-zinc-200 rounded-lg bg-white overflow-hidden";
    
    return (
        <div className={wrapperClass}>
            {props.title && <div className="px-6 py-4 border-b border-zinc-100 font-semibold">{props.title}</div>}
            <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 text-zinc-500 border-b border-zinc-200">
                    <tr><th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Rol</th></tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                    {[1,2,3,4].map(i => (
                        <tr key={i}>
                            <td className="px-4 py-3 text-zinc-900">Empleado {i}</td>
                            <td className="px-4 py-3 text-zinc-500">Camarero</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function FilterBarBlock({ props }: { props: any }) {
    if (props.boxed) {
        return (
            <div className="bg-white p-4 rounded-xl shadow-sm border border-zinc-200 flex items-center gap-4">
                <div className="bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-2 text-sm text-zinc-400 w-full">Buscar...</div>
            </div>
        );
    }
    return (
        <div className="flex gap-2 mb-4">
            {props.showSearch && <div className="border border-zinc-200 rounded px-3 py-1.5 text-xs text-zinc-400">Buscar...</div>}
            {props.showNew && <button className="bg-black text-white px-3 py-1.5 rounded text-xs">Nuevo</button>}
        </div>
    );
}

function SidebarNavBlock({ props }: { props: any }) {
    if (props.variant === 'page-menu') {
        return (
            <div className="space-y-1">
                <div className="px-3 py-2 bg-zinc-900 text-white rounded-lg text-sm font-medium">Directorio</div>
                <div className="px-3 py-2 text-zinc-600 text-sm font-medium">Horarios</div>
                <div className="px-3 py-2 text-zinc-600 text-sm font-medium">Contratos</div>
            </div>
        );
    }
    return (
        <div className="space-y-4">
            <div>
                <div className="text-[10px] uppercase font-bold text-zinc-400 mb-2">Core</div>
                <div className="bg-zinc-100 px-2 py-1.5 rounded text-sm font-medium text-zinc-900">Dashboard</div>
                <div className="px-2 py-1.5 text-sm font-medium text-zinc-600">Operaciones</div>
            </div>
        </div>
    );
}

const REGISTRY: Record<string, React.FC<{ props: any }>> = {
    'page-header': PageHeaderBlock,
    'data-table': DataTableBlock,
    'filter-bar': FilterBarBlock,
    'sidebar-nav': SidebarNavBlock,
};

// ==========================================
// 2. THE RENDER ENGINE (Interpreter)
// ==========================================

function BlockRenderer({ block }: { block: MarbellaBlock }) {
    const Component = REGISTRY[block.type];
    if (!Component) {
        return <div className="border border-red-200 bg-red-50 text-red-500 p-4 rounded text-sm">Unknown block type: {block.type}</div>;
    }
    return <Component props={block.props} />;
}

function RegionRenderer({ blocks = [] }: { blocks?: MarbellaBlock[] }) {
    if (!blocks || blocks.length === 0) return null;
    return (
        <>
            {blocks.map(block => (
                <BlockRenderer key={block.id} block={block} />
            ))}
        </>
    );
}

// ==========================================
// 3. LAYOUTS
// ==========================================

function ControlPanelLayout({ regions }: { regions: MarbellaVariant['regions'] }) {
    return (
        <div className="flex min-h-screen bg-zinc-50 text-zinc-900">
            <aside className="w-56 border-r border-zinc-200 bg-white p-4">
                <RegionRenderer blocks={regions['sidebar']} />
            </aside>
            <main className="flex-1 p-6">
                <RegionRenderer blocks={regions['header']} />
                <RegionRenderer blocks={regions['main']} />
            </main>
        </div>
    );
}

function FocusedCanvasLayout({ regions }: { regions: MarbellaVariant['regions'] }) {
    return (
        <div className="min-h-screen bg-zinc-50 text-zinc-900 py-12">
            <main className="max-w-4xl mx-auto px-6">
                <RegionRenderer blocks={regions['header']} />
                <RegionRenderer blocks={regions['main']} />
            </main>
        </div>
    );
}

function BimodalLayout({ regions }: { regions: MarbellaVariant['regions'] }) {
    return (
        <div className="min-h-screen bg-zinc-50 text-zinc-900">
            <RegionRenderer blocks={regions['header']} />
            <div className="max-w-7xl mx-auto px-6 py-8 flex gap-10">
                <nav className="w-56 shrink-0">
                    <RegionRenderer blocks={regions['sidebar']} />
                </nav>
                <main className="flex-1">
                    <RegionRenderer blocks={regions['main']} />
                </main>
            </div>
        </div>
    );
}

// ==========================================
// 4. MAIN CANVAS EXPORT
// ==========================================

export default function StudioCanvas({ variantId }: { variantId: string }) {
    const variants = useStudioStore(state => state.variants);
    const variant = variants.find(v => v.id === variantId);

    if (!variant) {
        return <div className="p-8 text-zinc-500">Variant not found</div>;
    }

    switch (variant.layout) {
        case 'control-panel': return <ControlPanelLayout regions={variant.regions} />;
        case 'focused-canvas': return <FocusedCanvasLayout regions={variant.regions} />;
        case 'bimodal': return <BimodalLayout regions={variant.regions} />;
        default: return <div className="p-8 text-red-500">Unknown layout</div>;
    }
}
