'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export default function MainWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isLogin = pathname === '/login';

    return (
        <main className={cn(
            "pt-header-safe min-h-screen transition-all duration-300",
            !isLogin && "md:pl-20 pb-[calc(5rem+env(safe-area-inset-bottom))]"
        )}>
            {children}
        </main>
    );
}
