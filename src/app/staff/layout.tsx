'use client';

import { useEffect, useMemo, useState } from 'react';
import { Calendar, Clock, Coins, Home, Settings, User, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Toaster } from 'sonner';
import { cn } from '@/lib/utils';

const STAFF_TIP_ROLES = new Set(['staff', 'supervisor', 'chef']);

type StaffNavItem = {
    name: string;
    href: string;
    icon: LucideIcon;
    /** Si se define, el ítem solo se muestra para estos roles de perfil */
    roles?: string[];
};

const BASE_NAV_ITEMS: StaffNavItem[] = [
    { name: 'Horarios', href: '/staff/schedule', icon: Calendar },
    { name: 'Asistencia', href: '/staff/history', icon: Clock },
    {
        name: 'Propinas',
        href: '/staff/propinas',
        icon: Coins,
        roles: ['staff', 'supervisor', 'chef'],
    },
    { name: 'Inicio', href: '/staff/dashboard', icon: Home },
    { name: 'Perfil', href: '/staff/profile', icon: User },
    { name: 'Cuenta', href: '/staff/account', icon: Settings },
];

export default function StaffLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const supabase = createClient();
    const [profileRole, setProfileRole] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function loadRole() {
            const {
                data: { user },
            } = await supabase.auth.getUser();
            if (!user || cancelled) return;

            const { data } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .maybeSingle();

            if (!cancelled) {
                setProfileRole(data?.role ?? null);
            }
        }

        void loadRole();
        return () => {
            cancelled = true;
        };
    }, [supabase]);

    const navItems = useMemo(() => {
        return BASE_NAV_ITEMS.filter((item) => {
            if (!item.roles?.length) return true;
            if (!profileRole) return false;
            return item.roles.includes(profileRole);
        });
    }, [profileRole]);

    const isActive = (path: string) =>
        pathname === path || pathname.startsWith(`${path}/`);

    return (
        <>
            <Toaster position="top-center" richColors />
            <div className="min-h-screen pb-24 md:pb-20">{children}</div>
            <nav
                className="marbella-fixed-bottombar fixed bottom-0 left-0 right-0 z-[95] flex h-20 items-center justify-around border-t border-white/10 bg-[#5B8FB9] px-2 pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.1)] backdrop-blur-md md:h-16 md:px-8 print:hidden"
                aria-label="Navegación staff"
            >
                {navItems.map((item) => {
                    const active = isActive(item.href);
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                'flex min-h-12 min-w-12 flex-1 flex-col items-center justify-center transition-all duration-200 active:scale-95',
                                active
                                    ? 'scale-110 text-white drop-shadow-md'
                                    : 'text-blue-200 hover:text-white'
                            )}
                            aria-current={active ? 'page' : undefined}
                        >
                            <Icon size={20} className="md:h-5 md:w-5" strokeWidth={2.5} />
                            <span className="mt-0.5 text-[7.5px] font-black uppercase tracking-tighter whitespace-nowrap md:mt-1 md:text-[9px] md:tracking-widest">
                                {item.name}
                            </span>
                        </Link>
                    );
                })}
            </nav>
        </>
    );
}
