export default function PlaygroundPage() {
    return (
        <div className="space-y-12 animate-in fade-in duration-700">
            <header className="space-y-3">
                <h1 className="text-3xl font-light tracking-tight">Marbella Playground</h1>
                <p className="text-sm text-white/50 max-w-xl leading-relaxed">
                    Laboratorio permanente de diseño. Exploración visual y prototipado del ADN de Marbella App.
                </p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <a href="/playground/master-layout/proposal-a" className="group block border border-white/10 rounded-2xl p-6 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/20 transition-all">
                    <div className="h-32 mb-6 rounded-lg border border-white/5 bg-black/50 flex flex-col items-center justify-center relative overflow-hidden">
                        <div className="absolute left-0 top-0 bottom-0 w-8 bg-white/10 border-r border-white/5" />
                        <div className="absolute top-0 left-8 right-0 h-6 bg-white/5 border-b border-white/5" />
                        <span className="text-white/20 text-xs font-mono z-10">A</span>
                    </div>
                    <h2 className="text-base font-medium text-white/90 mb-2">Panel de Control</h2>
                    <p className="text-xs text-white/50 leading-relaxed">
                        Alta densidad, pro-tool. Máxima visibilidad de datos con sidebar permanente y área fluida.
                    </p>
                </a>

                <a href="/playground/master-layout/proposal-b" className="group block border border-white/10 rounded-2xl p-6 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/20 transition-all">
                    <div className="h-32 mb-6 rounded-lg border border-white/5 bg-black/50 flex flex-col items-center justify-center relative overflow-hidden">
                        <div className="absolute top-0 left-0 right-0 h-8 bg-white/10 border-b border-white/5" />
                        <div className="w-2/3 h-16 mt-4 bg-white/5 border border-white/10 rounded" />
                        <span className="text-white/20 text-xs font-mono z-10 absolute bottom-4">B</span>
                    </div>
                    <h2 className="text-base font-medium text-white/90 mb-2">Lienzo Enfocado</h2>
                    <p className="text-xs text-white/50 leading-relaxed">
                        Baja densidad, alta legibilidad. Navegación mínima, contenido centrado con foco absoluto.
                    </p>
                </a>

                <a href="/playground/master-layout/proposal-c" className="group block border border-white/10 rounded-2xl p-6 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/20 transition-all">
                    <div className="h-32 mb-6 rounded-lg border border-white/5 bg-[#0a0a0a] flex flex-col items-center justify-center relative overflow-hidden">
                        <div className="absolute top-0 left-0 right-0 h-10 bg-white/[0.02] border-b border-white/5" />
                        <div className="absolute left-4 top-14 bottom-4 w-12 bg-white/5 rounded border border-white/5" />
                        <div className="absolute left-20 right-4 top-14 bottom-4 bg-white/10 rounded border border-white/10" />
                        <span className="text-white/20 text-xs font-mono z-10 absolute bottom-2 right-6">C</span>
                    </div>
                    <h2 className="text-base font-medium text-white/90 mb-2">Estructura Bimodal</h2>
                    <p className="text-xs text-white/50 leading-relaxed">
                        Bloques modulares flotantes. Cabecera monumental y menús secundarios de página.
                    </p>
                </a>
            </div>
        </div>
    );
}
