'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export default function MainWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isLogin = pathname === '/login';

    return (
        <main className={cn(
            "pt-header-safe min-h-screen transition-all duration-300",
            !isLogin && "pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-[calc(4rem+env(safe-area-inset-bottom))]"
        )}>
            {children}
        </main>
    );
}
