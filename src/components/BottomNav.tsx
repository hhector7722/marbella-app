'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, BookOpen, Package, TrendingUp, LogOut, User, ChevronUp } from 'lucide-react';
import { createClient } from "@/utils/supabase/client";
import { toast } from 'sonner';

export default function BottomNav() {
    const pathname = usePathname();
    const router = useRouter();
    const supabase = createClient();

    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false); // Estado para el menú

    // 1. Bloqueo en Login
    if (pathname === '/login') return null;

    // 2. Cargar perfil
    useEffect(() => {
        async function loadProfile() {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data } = await supabase
                    .from('profiles')
                    .select('avatar_url')
                    .eq('id', user.id)
                    .single();
                if (data?.avatar_url) setAvatarUrl(data.avatar_url);
            }
        }
        loadProfile();
    }, []);

    const handleLogout = async () => {
        if (!confirm("¿Seguro que quieres cerrar sesión?")) return;

        const { error } = await supabase.auth.signOut();
        if (error) {
            toast.error('Error al salir');
        } else {
            router.push('/login');
            router.refresh();
        }
    };

    const isActive = (path: string) => pathname === path || pathname.startsWith(path + '/');
    const getClass = (path: string) => isActive(path)
        ? "text-white scale-110 drop-shadow-md"
        : "text-blue-200 hover:text-white";

    return (
        <>
            {/* BACKDROP INVISIBLE: Para cerrar el menú al hacer clic fuera */}
            {isMenuOpen && (
                <div
                    className="fixed inset-0 z-[90]"
                    onClick={() => setIsMenuOpen(false)}
                />
            )}

            {/* BARRA DE NAVEGACIÓN */}
            <nav className="md:hidden fixed bottom-0 w-full bg-[#5B8FB9] border-t border-white/20 z-[100] flex justify-between px-4 py-3 pb-safe shadow-[0_-4px_10px_rgba(0,0,0,0.1)]">

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
                    <span className="text-[10px] font-bold mt-1">Ingr</span>
                </Link>

                <Link href="/dashboard" className={`flex flex-col items-center transition-all duration-200 ${getClass('/dashboard')}`}>
                    <TrendingUp size={24} />
                    <span className="text-[10px] font-bold mt-1">Stats</span>
                </Link>

                {/* 5º BOTÓN: CUENTA (Toggle Menú) */}
                <div className="relative">
                    {/* MENÚ FLOTANTE (Solo visible si isMenuOpen es true) */}
                    {isMenuOpen && (
                        <div className="absolute bottom-[120%] right-0 min-w-[160px] bg-white rounded-xl shadow-2xl border border-gray-100 p-2 flex flex-col gap-1 animate-in slide-in-from-bottom-2 fade-in duration-200 origin-bottom-right">

                            {/* Opción 1: Mi Cuenta */}
                            <Link
                                href="/profile"
                                onClick={() => setIsMenuOpen(false)}
                                className="flex items-center gap-3 px-4 py-3 text-sm font-bold text-gray-700 hover:bg-blue-50 rounded-lg transition-colors"
                            >
                                <User size={16} className="text-blue-600" />
                                Mi Cuenta
                            </Link>

                            <div className="h-px bg-gray-100 my-1"></div>

                            {/* Opción 2: Cerrar Sesión */}
                            <button
                                onClick={() => { setIsMenuOpen(false); handleLogout(); }}
                                className="flex items-center gap-3 px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50 rounded-lg transition-colors w-full text-left"
                            >
                                <LogOut size={16} />
                                Cerrar Sesión
                            </button>
                        </div>
                    )}

                    {/* El Icono Activador */}
                    <button
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        className={`flex flex-col items-center transition-all duration-200 ${isMenuOpen || isActive('/profile') ? "text-white scale-110" : "text-blue-200"}`}
                    >
                        <div className="w-6 h-6 rounded-full bg-white/10 border border-white/40 flex items-center justify-center overflow-hidden mb-1">
                            {avatarUrl ? (
                                <img src={avatarUrl} alt="Me" className="w-full h-full object-cover" />
                            ) : (
                                <User size={14} className="text-white" />
                            )}
                        </div>
                        <span className="text-[10px] font-bold">Cuenta</span>
                    </button>
                </div>

            </nav>
        </>
    );
}