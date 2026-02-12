'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, LogOut, User, Calendar, Clock } from 'lucide-react';
import { createClient } from "@/utils/supabase/client";
import Image from 'next/image';
import { toast } from 'sonner';

export default function BottomNavStaff() {
    const pathname = usePathname();
    const router = useRouter();
    const supabase = createClient();

    const [userData, setUserData] = useState<{ name: string; role: string; avatar_url: string | null } | null>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    if (pathname === '/login') return null;

    useEffect(() => {
        async function loadProfile() {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data } = await supabase
                    .from('profiles')
                    .select('first_name, role, avatar_url')
                    .eq('id', user.id)
                    .single();
                if (data) {
                    setUserData({
                        name: data.first_name || 'Empleado',
                        role: data.role || 'staff',
                        avatar_url: data.avatar_url || null
                    });
                }
            }
        }
        loadProfile();
    }, [supabase]);

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
    const getClass = (path: string, isDesktop = false) => {
        const active = isActive(path);
        if (isDesktop) {
            return active
                ? "bg-white/20 text-white"
                : "text-blue-200 hover:bg-white/10 hover:text-white";
        }
        return active
            ? "text-white scale-110 drop-shadow-md"
            : "text-blue-200 hover:text-white";
    };

    const isAdmin = userData?.role === 'manager' || userData?.role === 'supervisor';

    const staffItems: { name: string; href: string; icon: any }[] = [
        { name: 'Horarios', href: '/staff/schedule', icon: Calendar },
        { name: 'Asistencia', href: '/staff/history', icon: Clock },
        { name: 'Inicio', href: isAdmin ? '/dashboard' : '/staff/dashboard', icon: Home },
        { name: 'Perfil', href: '/profile', icon: User },
        {
            name: 'Cuenta', href: '/profile', icon: () => (
                <div className="w-6 h-6 rounded-full bg-white/20 border border-white/40 flex items-center justify-center overflow-hidden">
                    {userData?.avatar_url ? (
                        <Image
                            src={userData.avatar_url}
                            alt="Me"
                            width={24}
                            height={24}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <User size={14} className="text-white" />
                    )}
                </div>
            )
        },
    ];

    return (
        <>
            {/* MOBILE: Bottom Bar - same height as admin (h-20) */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 h-20 pb-safe bg-[#5B8FB9] border-t border-white/10 z-[100] flex justify-around items-center px-2 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] backdrop-blur-md">
                {staffItems.map((item) => (
                    <Link key={item.href} href={item.href} className={`flex flex-col items-center transition-all duration-200 active:scale-95 flex-1 ${getClass(item.href)}`}>
                        {typeof item.icon === 'function' ? <item.icon /> : <item.icon size={20} />}
                        <span className="text-[7.5px] font-bold mt-0.5 uppercase tracking-tighter whitespace-nowrap">{item.name}</span>
                    </Link>
                ))}
            </nav>

            {/* DESKTOP: Sidebar - same width as admin (w-20) */}
            <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-20 bg-[#5B8FB9] flex-col items-center py-6 z-[100] shadow-xl border-r border-white/10">
                {/* Nav Items */}
                <div className="flex-1 flex flex-col gap-2 w-full px-2">
                    {staffItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex flex-col items-center py-3 rounded-xl transition-all duration-200 active:scale-95 ${getClass(item.href, true)}`}
                        >
                            {typeof item.icon === 'function' ? (
                                <div className="w-8 h-8 rounded-full bg-white/20 border border-white/40 flex items-center justify-center overflow-hidden">
                                    {userData?.avatar_url ? (
                                        <Image
                                            src={userData.avatar_url}
                                            alt="Me"
                                            width={32}
                                            height={32}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <User size={16} className="text-white" />
                                    )}
                                </div>
                            ) : <item.icon size={20} />}
                            <span className="text-[8px] font-bold mt-1 uppercase tracking-tighter text-center">{item.name}</span>
                        </Link>
                    ))}
                </div>
            </aside>
        </>
    );
}
