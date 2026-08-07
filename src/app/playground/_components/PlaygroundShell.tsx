'use client';

import Link from 'next/link';

export default function PlaygroundShell() {
    return (
        <nav className="fixed top-0 left-0 right-0 h-14 border-b border-white/10 bg-black/80 backdrop-blur-md z-50 flex items-center px-4 md:px-8">
            <div className="flex items-center justify-between w-full max-w-[1400px] mx-auto">
                <div className="flex items-center space-x-5">
                    <Link 
                        href="/dashboard"
                        className="text-[10px] uppercase tracking-widest font-medium text-white/40 hover:text-white transition-colors"
                    >
                        ← Volver a Marbella
                    </Link>
                    <div className="h-4 w-px bg-white/10"></div>
                    <span className="text-[10px] uppercase tracking-widest font-bold text-white/90">
                        Playground
                    </span>
                </div>
            </div>
        </nav>
    );
}
