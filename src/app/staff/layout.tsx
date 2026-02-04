'use client';

import { useState, useEffect } from 'react';
import { Clock, Home, Settings, LogOut, Calendar, User, Mic, MessageSquare, X, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from "@/utils/supabase/client";
import { Toaster } from 'sonner';

export default function StaffLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const supabase = createClient();
    const [showAIMenu, setShowAIMenu] = useState(false);
    const [showAccountMenu, setShowAccountMenu] = useState(false);

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    const navItems = [
        { name: 'Horarios', href: '/staff/schedule', icon: Calendar },
        { name: 'Asistencia', href: '/staff/history', icon: Clock },
        { name: 'Inicio', href: '/staff/dashboard', icon: Home },
        { name: 'Perfil', href: '/staff/profile', icon: User },
        { name: 'Cuenta', href: '/staff/account', icon: Settings },
    ];

    const isActive = (path: string) => pathname === path;

    return (
        <div className="flex min-h-screen">
            <Toaster position="top-center" richColors />
            <main className="flex-1 w-full px-3">
                {children}
            </main>
        </div>
    );
}