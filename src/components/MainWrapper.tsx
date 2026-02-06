'use client';

import { usePathname } from 'next/navigation';

export default function MainWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isLogin = pathname === '/login';

    return (
        <main className={`pt-header-safe min-h-screen transition-all duration-300 ${isLogin ? '' : 'pb-24 md:pb-0 md:pl-20 pb-[calc(6rem+env(safe-area-inset-bottom))]'}`}>
            {children}
        </main>
    );
}
