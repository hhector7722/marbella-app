'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChefHat, Home, BookOpen, Package, TrendingUp, Settings } from 'lucide-react';

export default function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="hidden md:flex w-20 flex-col items-center py-8 space-y-8 shadow-2xl z-50 h-screen sticky top-0" style={{ background: 'linear-gradient(to bottom, #4A7A9A, #36606F)' }}>
            <Link href="/" className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform">
                <ChefHat className="w-7 h-7 text-[#3F51B5]" />
            </Link>
            <nav className="flex flex-col gap-6">
                <SidebarIcon icon={<Home size={24} />} href="/" active={pathname === '/'} />
                <SidebarIcon icon={<BookOpen size={24} />} href="/recipes" active={pathname.startsWith('/recipes')} />
                <SidebarIcon icon={<Package size={24} />} href="/ingredients" active={pathname.startsWith('/ingredients')} />
                <SidebarIcon icon={<TrendingUp size={24} />} href="/dashboard" active={pathname.startsWith('/dashboard')} />
                <SidebarIcon icon={<Settings size={24} />} href="/settings" active={pathname.startsWith('/settings')} />
            </nav>
        </aside>
    );
}

function SidebarIcon({ icon, active, href }: { icon: React.ReactNode; active?: boolean; href: string }) {
    const className = `w-12 h-12 flex items-center justify-center rounded-xl transition-all ${active ? 'bg-white text-[#3F51B5] shadow-lg' : 'text-white/70 hover:text-white hover:bg-white/10'}`;
    return <Link href={href} className={className}>{icon}</Link>;
}