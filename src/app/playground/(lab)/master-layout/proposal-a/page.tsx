import { Search, Filter, Plus, Home, Users, Box, Settings, Bell, LayoutGrid } from 'lucide-react';

export default function ProposalA() {
    return (
        <div className="flex h-[calc(100vh-40px)] bg-[#0a0a0a] text-white/90">
            {/* Sidebar (Permanente y densa) */}
            <aside className="w-56 border-r border-white/10 bg-black flex flex-col shrink-0">
                <div className="h-14 flex items-center px-4 border-b border-white/5">
                    <span className="font-bold text-sm tracking-wide">MARBELLA OS</span>
                </div>
                
                <div className="flex-1 overflow-y-auto p-3 space-y-6">
                    <div className="space-y-1">
                        <div className="text-[10px] uppercase font-bold tracking-widest text-white/40 mb-2 px-2">Core</div>
                        <button className="w-full flex items-center gap-3 px-2 py-1.5 rounded bg-white/10 text-white text-sm">
                            <Home size={14} className="opacity-70" /> Dashboard
                        </button>
                        <button className="w-full flex items-center gap-3 px-2 py-1.5 rounded hover:bg-white/5 text-white/60 text-sm">
                            <LayoutGrid size={14} className="opacity-70" /> Operaciones
                        </button>
                    </div>

                    <div className="space-y-1">
                        <div className="text-[10px] uppercase font-bold tracking-widest text-white/40 mb-2 px-2">Recursos</div>
                        <button className="w-full flex items-center gap-3 px-2 py-1.5 rounded hover:bg-white/5 text-white/60 text-sm">
                            <Users size={14} className="opacity-70" /> Equipo
                        </button>
                        <button className="w-full flex items-center gap-3 px-2 py-1.5 rounded hover:bg-white/5 text-white/60 text-sm">
                            <Box size={14} className="opacity-70" /> Inventario
                        </button>
                    </div>
                </div>

                <div className="p-3 border-t border-white/5">
                    <button className="w-full flex items-center gap-3 px-2 py-1.5 rounded hover:bg-white/5 text-white/60 text-sm">
                        <Settings size={14} className="opacity-70" /> Configuración
                    </button>
                </div>
            </aside>

            {/* Main Area */}
            <main className="flex-1 flex flex-col min-w-0">
                {/* Action Bar (Top) */}
                <header className="h-14 border-b border-white/10 flex items-center justify-between px-6 shrink-0 bg-[#0a0a0a]">
                    <div className="flex items-center gap-4">
                        <h1 className="font-semibold text-sm">Gestión de Equipo</h1>
                        <div className="h-4 w-px bg-white/20" />
                        <div className="flex items-center gap-2 text-white/40 text-xs">
                            <span>42 activos</span>
                            <span>•</span>
                            <span>3 ausencias hoy</span>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40" />
                            <input 
                                type="text" 
                                placeholder="Buscar empleado..." 
                                className="bg-black border border-white/10 rounded-md pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:border-white/30 w-48 transition-colors"
                            />
                        </div>
                        <button className="p-1.5 rounded border border-white/10 bg-black hover:bg-white/5 transition-colors">
                            <Filter size={14} />
                        </button>
                        <button className="flex items-center gap-2 px-3 py-1.5 rounded bg-white text-black text-xs font-medium hover:bg-white/90 transition-colors">
                            <Plus size={14} /> Nuevo
                        </button>
                    </div>
                </header>

                {/* Fluid Content Canvas */}
                <div className="flex-1 overflow-auto p-6">
                    {/* Dense Data Table Layout */}
                    <div className="border border-white/10 rounded-lg bg-black overflow-hidden flex flex-col">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-[#111] text-white/40 text-xs border-b border-white/10">
                                <tr>
                                    <th className="px-4 py-3 font-medium">Nombre</th>
                                    <th className="px-4 py-3 font-medium">Rol</th>
                                    <th className="px-4 py-3 font-medium">Estado</th>
                                    <th className="px-4 py-3 font-medium text-right">Horas Semanales</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                                    <tr key={i} className="hover:bg-white/5 transition-colors group cursor-pointer">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px]">E{i}</div>
                                                <span className="group-hover:text-white text-white/80 transition-colors">Empleado {i}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-white/60">Camarero</td>
                                        <td className="px-4 py-3">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                                                Activo
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-white/80">38.5h</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div>
    );
}
