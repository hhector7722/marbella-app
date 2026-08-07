import { ChevronLeft, Plus, MoreHorizontal } from 'lucide-react';

export default function ProposalB() {
    return (
        <div className="min-h-[calc(100vh-40px)] bg-[#fafafa] text-zinc-900 selection:bg-black/10">
            {/* Top Minimal Navigation */}
            <header className="h-16 flex items-center px-4 max-w-4xl mx-auto">
                <button className="flex items-center gap-2 text-zinc-500 hover:text-zinc-900 transition-colors text-sm">
                    <ChevronLeft size={16} /> Volver a Dashboard
                </button>
                <div className="ml-auto flex items-center gap-4 text-sm font-medium">
                    <button className="text-zinc-500 hover:text-zinc-900 transition-colors">Filtros</button>
                    <button className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-full hover:bg-zinc-800 transition-transform active:scale-95">
                        <Plus size={16} /> Nuevo
                    </button>
                </div>
            </header>

            {/* Focused Canvas */}
            <main className="max-w-4xl mx-auto px-4 md:px-8 py-12">
                <div className="mb-16">
                    <h1 className="text-4xl font-light tracking-tight mb-4 text-zinc-900">Equipo</h1>
                    <p className="text-lg text-zinc-500 max-w-xl leading-relaxed">
                        Gestiona los perfiles, disponibilidad y condiciones laborales del equipo. Actualmente tienes 42 empleados activos.
                    </p>
                </div>

                <div className="space-y-4">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="group bg-white p-6 rounded-2xl border border-zinc-100 hover:border-zinc-300 hover:shadow-sm transition-all flex items-center justify-between cursor-pointer">
                            <div className="flex items-center gap-6">
                                <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 text-sm font-medium">
                                    E{i}
                                </div>
                                <div>
                                    <h3 className="text-lg font-medium text-zinc-900 mb-1 group-hover:text-black transition-colors">Empleado Nombre {i}</h3>
                                    <div className="flex items-center gap-3 text-sm text-zinc-500">
                                        <span>Camarero</span>
                                        <span className="w-1 h-1 rounded-full bg-zinc-300" />
                                        <span>38.5h semanales</span>
                                        <span className="w-1 h-1 rounded-full bg-zinc-300" />
                                        <span className="text-emerald-600 font-medium">Activo hoy</span>
                                    </div>
                                </div>
                            </div>
                            
                            <button className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-400 hover:bg-zinc-50 hover:text-zinc-900 transition-colors opacity-0 group-hover:opacity-100">
                                <MoreHorizontal size={20} />
                            </button>
                        </div>
                    ))}
                </div>
                
                <div className="mt-8 text-center">
                    <button className="text-sm font-medium text-zinc-500 hover:text-zinc-900 py-2">
                        Cargar más resultados
                    </button>
                </div>
            </main>
        </div>
    );
}
