'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChefHat, Home, BookOpen, Package, TrendingUp, Settings, LogOut, User } from 'lucide-react';
import { createClient } from "@/utils/supabase/client";
import { toast } from 'sonner';

export default function Sidebar() {
    // --- 1. TODOS LOS HOOKS PRIMERO (Orden Invariable) ---
    const pathname = usePathname();
    const router = useRouter();
    const supabase = createClient();

    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

    // Hook de efecto: Cargar perfil
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

    // --- 2. AHORA SÍ: CONDICIONALES DE RENDERIZADO ---
    // Si estamos en login, cortamos aquí, pero los hooks YA se ejecutaron (memoria reservada)
    if (pathname === '/login') return null;

    // --- 3. LÓGICA DE NEGOCIO Y RENDER ---
    const handleLogout = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) {
            toast.error('Error al cerrar sesión');
        } else {
            router.push('/login');
            router.refresh();
        }
    };

    return (
        <aside className="hidden md:flex w-20 flex-col items-center py-8 shadow-2xl z-50 h-screen sticky top-0" style={{ background: 'linear-gradient(to bottom, #4A7A9A, #36606F)' }}>
            {/* Logo */}
            <Link href="/" className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform mb-8">
                <ChefHat className="w-7 h-7 text-[#3F51B5]" />
            </Link>

            {/* Navegación */}
            <nav className="flex flex-col gap-6 w-full items-center">
                <SidebarIcon icon={<Home size={24} />} href="/" active={pathname === '/'} />
                <SidebarIcon icon={<BookOpen size={24} />} href="/recipes" active={pathname.startsWith('/recipes')} />
                <SidebarIcon icon={<Package size={24} />} href="/ingredients" active={pathname.startsWith('/ingredients')} />
                <SidebarIcon icon={<TrendingUp size={24} />} href="/dashboard" active={pathname.startsWith('/dashboard')} />
            </nav>

            {/* Zona Inferior: Ajustes + User + Logout */}
            <div className="mt-auto flex flex-col gap-6 w-full items-center">
                <SidebarIcon icon={<Settings size={24} />} href="/settings" active={pathname.startsWith('/settings')} />

                <div className="w-8 h-px bg-white/20"></div>

                {/* Avatar Visual */}
                <div className="w-10 h-10 rounded-full bg-white/10 border-2 border-white/30 flex items-center justify-center overflow-hidden shadow-inner" title="Tu Perfil">
                    {avatarUrl ? (
                        <img src={avatarUrl} alt="User" className="w-full h-full object-cover" />
                    ) : (
                        <User className="w-5 h-5 text-white/80" />
                    )}
                </div>

                {/* Botón Logout */}
                <button
                    onClick={handleLogout}
                    className="w-10 h-10 flex items-center justify-center rounded-xl text-white/50 hover:text-red-200 hover:bg-red-500/20 transition-all mb-4"
                    title="Cerrar Sesión"
                >
                    <LogOut size={20} />
                </button>
            </div>
        </aside>
    );
}

function SidebarIcon({ icon, active, href }: { icon: React.ReactNode; active?: boolean; href: string }) {
    const className = `w-12 h-12 flex items-center justify-center rounded-xl transition-all ${active ? 'bg-white text-[#3F51B5] shadow-lg scale-105' : 'text-white/70 hover:text-white hover:bg-white/10 hover:scale-105'}`;
    return <Link href={href} className={className}>{icon}</Link>;
}