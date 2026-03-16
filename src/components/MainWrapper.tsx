'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { PullToRefresh } from '@/components/ui/PullToRefresh';

export default function MainWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isLogin = pathname === '/login';

    return (
        <main className={cn(
            "pt-header-safe min-h-screen transition-all duration-300",
            !isLogin && "pb-[calc(5rem+env(safe-area-inset-bottom))]"
        )}>
            <PullToRefresh enabled={!isLogin}>
                {children}
            </PullToRefresh>
        </main>
    );
}
