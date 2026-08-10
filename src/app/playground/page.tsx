export default function PlaygroundPage() {
    return (
        <div className="space-y-12 animate-in fade-in duration-700">
            <header className="space-y-3">
                <h1 className="text-3xl font-light tracking-tight">Marbella Playground</h1>
                <p className="text-sm text-white/50 max-w-xl leading-relaxed">
                    Explora cómo puede sentirse Marbella App con distintas expresiones visuales.
                </p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
                <a href="/playground/studio" className="group block border border-white/10 rounded-2xl p-8 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/20 transition-all">
                    <div className="h-32 mb-6 rounded-lg border border-white/5 bg-black/50 flex flex-col items-center justify-center relative overflow-hidden">
                        <div className="w-16 h-16 border border-white/10 rounded-lg flex items-center justify-center bg-white/5 group-hover:scale-110 transition-transform">
                            <span className="text-white/40 text-xl font-mono">{'{}'}</span>
                        </div>
                    </div>
                    <h2 className="text-xl font-medium text-white/90 mb-2">Marbella Design Studio</h2>
                    <p className="text-sm text-white/50 leading-relaxed">
                        Entra en Marbella, navega y prueba estéticas globales sin modificar datos reales.
                    </p>
                </a>
            </div>
        </div>
    );
}
