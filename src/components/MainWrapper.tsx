'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export default function MainWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isLogin = pathname === '/login';

    return (
        <main className={cn(
            "h-[100dvh] overflow-hidden transition-all duration-300 relative flex flex-col",
            !isLogin && "md:pl-20"
        )}>
            <div className={cn(
                "flex-1 overflow-y-auto overflow-x-hidden",
                !isLogin && "pt-header-safe pb-20 pb-[calc(5rem+env(safe-area-inset-bottom))]"
            )}>
                {children}
            </div>
        </main>
    );
}
