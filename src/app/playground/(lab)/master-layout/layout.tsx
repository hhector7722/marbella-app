import Link from 'next/link';

export default function MasterLayoutExplorationShell({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-black overflow-hidden flex flex-col font-sans">
            <div className="h-10 border-b border-white/10 flex items-center px-4 shrink-0 bg-[#0a0a0a] z-50 fixed top-0 left-0 right-0 w-full">
                <Link href="/playground" className="text-xs text-white/50 hover:text-white transition-colors">
                    ← Playground
                </Link>
                <div className="w-px h-4 bg-white/20 mx-4" />
                <div className="flex space-x-6 text-xs text-white/70">
                    <span className="font-mono text-white/40 uppercase tracking-widest text-[9px] mt-0.5">Exploración: Layout Maestro</span>
                    <Link href="/playground/master-layout/proposal-a" className="hover:text-white">A: Panel de Control</Link>
                    <Link href="/playground/master-layout/proposal-b" className="hover:text-white">B: Lienzo Enfocado</Link>
                    <Link href="/playground/master-layout/proposal-c" className="hover:text-white">C: Bimodal</Link>
                </div>
            </div>
            
            <div className="flex-1 mt-10 relative">
                {/* 
                    No añadimos padding aquí para permitir que cada propuesta controle 
                    completamente su espacio (edge-to-edge, fondos, barras laterales, etc.)
                */}
                {children}
            </div>
        </div>
    );
}
