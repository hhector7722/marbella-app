'use client';

import {
    LayoutDashboard,
    Wallet,
    History,
    TrendingUp,
    Users,
    LogOut,
    Clock // Icono para Horas Extras
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from "@/utils/supabase/client";
import { useRouter } from 'next/navigation';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const pathname = usePathname();
    const router = useRouter();
    const supabase = createClient();

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    // NOMBRES ACTUALIZADOS
    const navItems = [
        { name: 'Resumen', href: '/dashboard', icon: LayoutDashboard },       // Antes Inicio
        { name: 'Cajas', href: '/dashboard/treasury', icon: Wallet },         // Antes Tesorería
        { name: 'Cierres', href: '/dashboard/history', icon: History },       // Antes Histórico
        { name: 'Coste Mano Obra', href: '/dashboard/labor', icon: TrendingUp }, // Antes Costes
        { name: 'Horas Extras', href: '/dashboard/overtime', icon: Clock },   // NUEVO
        { name: 'Plantilla', href: '/dashboard/team', icon: Users },
    ];

    const isActive = (path: string) => {
        if (path === '/dashboard' && pathname === '/dashboard') return true;
        if (path !== '/dashboard' && pathname.startsWith(path)) return true;
        return false;
    };

    const corporateColor = "bg-[#5B8FB9]";
    const activeTextColor = "text-[#5B8FB9]";

    return (
        <div className={`flex min-h-screen ${corporateColor}`}>

            {/* --- SIDEBAR (ESCRITORIO) --- */}
            <aside className={`hidden md:flex w-64 flex-col fixed inset-y-0 z-50 ${corporateColor} text-white border-r border-white/10`}>
                <div className="p-8 pb-4">
                    <h1 className="text-2xl font-black tracking-tight">La Marbella</h1>
                    <p className="text-xs text-blue-100 opacity-90 uppercase tracking-widest mt-1">Management</p>
                </div>

                <nav className="flex-1 px-4 space-y-2 mt-4">
                    {navItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-4 px-4 py-4 rounded-2xl transition-all duration-200 font-bold ${isActive(item.href)
                                    ? `bg-white ${activeTextColor} shadow-lg translate-x-1`
                                    : 'text-white/80 hover:bg-white/10 hover:text-white'
                                }`}
                        >
                            <item.icon size={22} />
                            <span>{item.name}</span>
                        </Link>
                    ))}
                </nav>

                <div className="p-4 mt-auto">
                    <button
                        onClick={handleSignOut}
                        className="flex items-center gap-3 w-full px-4 py-3 rounded-2xl text-blue-100 hover:bg-red-500/20 hover:text-white transition-colors font-bold text-sm"
                    >
                        <LogOut size={18} /> Cerrar Sesión
                    </button>
                </div>
            </aside>

            {/* --- CONTENIDO PRINCIPAL --- */}
            <main className="flex-1 md:pl-64 pb-20 md:pb-0 min-h-screen overflow-x-hidden">
                {children}
            </main>

            {/* --- BOTTOM BAR (MÓVIL) --- */}
            <nav className={`md:hidden fixed bottom-0 left-0 right-0 ${corporateColor} text-white z-50 pb-safe border-t border-white/10 shadow-2xl`}>
                <div className="flex justify-around items-center h-16 px-2">
                    {navItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${isActive(item.href) ? 'text-white' : 'text-blue-100/70'
                                }`}
                        >
                            <div className={`p-1.5 rounded-xl transition-all ${isActive(item.href) ? 'bg-white/20 shadow-inner' : ''}`}>
                                <item.icon size={20} strokeWidth={isActive(item.href) ? 3 : 2} />
                            </div>
                            <span className="text-[9px] font-bold text-center leading-tight">{item.name}</span>
                        </Link>
                    ))}
                </div>
            </nav>

        </div>
    );
}