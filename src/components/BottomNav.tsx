'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, BookOpen, Package, TrendingUp } from 'lucide-react';

export default function BottomNav() {
    const pathname = usePathname();

    // Lógica para saber si el icono está activo
    const isActive = (path: string) => pathname === path || pathname.startsWith(path + '/');

    // Clases dinámicas: 
    // - Activo: Blanco puro, un poco más grande y con sombra.
    // - Inactivo: Azul muy claro (parece blanco transparente), se ilumina al pasar el ratón.
    const getClass = (path: string) => isActive(path)
        ? "text-white scale-110 drop-shadow-md"
        : "text-blue-200 hover:text-white";

    return (
        <nav className="md:hidden fixed bottom-0 w-full bg-[#5B8FB9] border-t border-white/20 z-[100] flex justify-around py-3 pb-safe shadow-[0_-4px_10px_rgba(0,0,0,0.1)]">

            <Link href="/" className={`flex flex-col items-center transition-all duration-200 ${getClass('/')}`}>
                <Home size={24} />
                <span className="text-[10px] font-bold mt-1">Inicio</span>
            </Link>

            <Link href="/recipes" className={`flex flex-col items-center transition-all duration-200 ${getClass('/recipes')}`}>
                <BookOpen size={24} />
                <span className="text-[10px] font-bold mt-1">Recetas</span>
            </Link>

            <Link href="/ingredients" className={`flex flex-col items-center transition-all duration-200 ${getClass('/ingredients')}`}>
                <Package size={24} />
                {/* TEXTO CAMBIADO A "Ingr" */}
                <span className="text-[10px] font-bold mt-1">Ingredientes</span>
            </Link>

            <Link href="/dashboard" className={`flex flex-col items-center transition-all duration-200 ${getClass('/dashboard')}`}>
                <TrendingUp size={24} />
                <span className="text-[10px] font-bold mt-1">Stats</span>
            </Link>

        </nav>
    );
}