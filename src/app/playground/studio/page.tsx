'use client';

import { useStudioStore } from './store';
import StudioCanvas from './components/StudioCanvas';

export default function StudioPage() {
    const { variants, activeVariantId, setActiveVariant } = useStudioStore();
    
    if (!activeVariantId) return null;

    return (
        <>
            {/* Editor Sidebar (Infrastructure minimal) */}
            <aside className="w-64 border-r border-white/10 bg-[#050505] flex flex-col shrink-0 overflow-y-auto hidden md:flex">
                <div className="p-4 border-b border-white/5">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3">Variante Activa</h2>
                    <select 
                        className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm focus:outline-none"
                        value={activeVariantId}
                        onChange={(e) => setActiveVariant(e.target.value)}
                    >
                        {variants.map(v => (
                            <option key={v.id} value={v.id}>{v.name}</option>
                        ))}
                    </select>
                </div>
                
                <div className="p-4">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3">Editor AST</h2>
                    <p className="text-xs text-white/50 leading-relaxed">
                        Infraestructura preparada para añadir paneles de configuración de bloques, edición JSON directa y controles de layout en futuras iteraciones.
                    </p>
                </div>
            </aside>

            {/* Canvas Area */}
            <main className="flex-1 bg-black relative">
                <div className="absolute inset-0 overflow-y-auto">
                    {/* El interprete pintando el AST */}
                    <StudioCanvas variantId={activeVariantId} />
                </div>
            </main>
        </>
    );
}
