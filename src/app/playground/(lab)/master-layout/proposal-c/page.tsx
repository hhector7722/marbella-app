import { Briefcase, CreditCard, Clock, FileText, ChevronRight, Plus } from 'lucide-react';

export default function ProposalC() {
    return (
        <div className="min-h-[calc(100vh-40px)] bg-zinc-50 text-zinc-900 pb-20">
            {/* Monumental Header Area */}
            <div className="bg-white border-b border-zinc-200">
                <div className="max-w-7xl mx-auto px-6 py-12">
                    <div className="flex items-center gap-2 text-sm font-medium text-zinc-500 mb-6">
                        <span>Recursos</span> <ChevronRight size={14} /> <span className="text-zinc-900">Equipo</span>
                    </div>
                    
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                        <div>
                            <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 mb-2">Equipo</h1>
                            <p className="text-zinc-500 text-lg">Visión general y gestión de personal activo.</p>
                        </div>
                        
                        <div className="flex items-center gap-6 pb-2">
                            <div className="text-right">
                                <div className="text-3xl font-bold text-zinc-900">42</div>
                                <div className="text-sm font-medium text-zinc-500">Activos</div>
                            </div>
                            <div className="w-px h-10 bg-zinc-200" />
                            <div className="text-right">
                                <div className="text-3xl font-bold text-amber-600">3</div>
                                <div className="text-sm font-medium text-zinc-500">Ausencias hoy</div>
                            </div>
                            <div className="w-px h-10 bg-zinc-200" />
                            <button className="flex items-center gap-2 bg-black text-white px-5 py-2.5 rounded-lg font-medium hover:bg-zinc-800 transition-colors shadow-sm">
                                <Plus size={18} /> Reclutar
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bimodal Content Area (Left Nav + Main Content Blocks) */}
            <div className="max-w-7xl mx-auto px-6 mt-8 flex flex-col md:flex-row gap-10">
                {/* Secondary Page Navigation (Floating) */}
                <nav className="w-56 shrink-0 hidden md:block">
                    <div className="sticky top-24 space-y-1">
                        <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-zinc-900 text-white font-medium text-sm shadow-sm">
                            <Briefcase size={16} /> Directorio
                        </button>
                        <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 font-medium text-sm transition-colors">
                            <Clock size={16} /> Horarios y Turnos
                        </button>
                        <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 font-medium text-sm transition-colors">
                            <CreditCard size={16} /> Costes Laborales
                        </button>
                        <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 font-medium text-sm transition-colors">
                            <FileText size={16} /> Contratos
                        </button>
                    </div>
                </nav>

                {/* Main Content (Modular Blocks) */}
                <main className="flex-1 space-y-6">
                    {/* Filter Block */}
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-zinc-200/60 flex items-center gap-4">
                        <input 
                            type="text" 
                            placeholder="Buscar por nombre, rol o estado..." 
                            className="flex-1 bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 transition-all"
                        />
                        <select className="bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-700 focus:outline-none cursor-pointer">
                            <option>Todos los roles</option>
                            <option>Camareros</option>
                            <option>Cocina</option>
                        </select>
                    </div>

                    {/* Data Block */}
                    <div className="bg-white rounded-xl shadow-sm border border-zinc-200/60 overflow-hidden">
                        <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
                            <h2 className="font-semibold text-zinc-900">Directorio Activo</h2>
                            <span className="text-sm text-zinc-500 font-medium">Mostrando 42 resultados</span>
                        </div>
                        
                        <div className="divide-y divide-zinc-100">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <div key={i} className="p-6 flex items-center justify-between hover:bg-zinc-50 transition-colors cursor-pointer group">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-600 font-semibold border border-zinc-200">
                                            E{i}
                                        </div>
                                        <div>
                                            <div className="font-medium text-zinc-900 group-hover:text-black mb-0.5">Empleado Nombre {i}</div>
                                            <div className="text-sm text-zinc-500 font-medium">Camarero • 38.5h/sem</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-6">
                                        <div className="text-right hidden sm:block">
                                            <div className="text-sm font-medium text-zinc-900">Incorporación</div>
                                            <div className="text-sm text-zinc-500">12 Feb 2024</div>
                                        </div>
                                        <div className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
                                            Alta
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
