export default function PlaygroundPage() {
    return (
        <div className="space-y-12 animate-in fade-in duration-700">
            <header className="space-y-3">
                <h1 className="text-3xl font-light tracking-tight">Marbella Playground</h1>
                <p className="text-sm text-white/50 max-w-xl leading-relaxed">
                    Laboratorio permanente de diseño. El entorno oficial donde nace, se valida y evoluciona el Marbella Design Language.
                </p>
            </header>

            <div className="border border-white/10 rounded-2xl p-8 md:p-12 bg-white/[0.02] flex flex-col items-center justify-center text-center space-y-4 min-h-[400px]">
                <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center bg-white/5 mb-2">
                    <span className="text-white/40 text-xs font-mono">PG</span>
                </div>
                <h2 className="text-base font-medium text-white/80">Laboratorio inicializado</h2>
                <p className="text-sm text-white/40 max-w-md leading-relaxed">
                    La infraestructura aislada está lista. Preparado para recibir los primeros experimentos visuales y áreas funcionales.
                </p>
            </div>
        </div>
    );
}
