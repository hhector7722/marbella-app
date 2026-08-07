import Link from 'next/link';

export default function StudioLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-black overflow-hidden flex flex-col font-sans text-white">
            <div className="h-12 border-b border-white/10 flex items-center justify-between px-4 shrink-0 bg-[#0a0a0a] z-50 fixed top-0 left-0 right-0 w-full">
                <div className="flex items-center">
                    <Link href="/playground" className="text-xs text-white/50 hover:text-white transition-colors">
                        ← Playground
                    </Link>
                    <div className="w-px h-4 bg-white/20 mx-4" />
                    <span className="font-semibold text-xs tracking-wide">Marbella Design Studio</span>
                </div>
                
                <div className="flex items-center space-x-2">
                    <Link href="/playground/studio" className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20 text-xs font-medium transition-colors">
                        Modo Edición
                    </Link>
                    <Link href="/playground/studio/compare" className="px-3 py-1.5 rounded border border-white/20 hover:bg-white/10 text-xs font-medium transition-colors">
                        Comparar Variantes
                    </Link>
                </div>
            </div>
            
            <div className="flex-1 mt-12 relative flex">
                {children}
            </div>
        </div>
    );
}
