'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { isFullscreenCartaPath } from '@/lib/carta-fullscreen-path';

export default function MainWrapper({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isLogin = pathname === '/login';
    const fullscreenCarta = isFullscreenCartaPath(pathname);

    return (
        <main className={cn(
            'min-h-screen transition-all duration-300',
            !isLogin && !fullscreenCarta && 'pt-header-safe',
            !isLogin && !fullscreenCarta && 'pb-[calc(5rem+env(safe-area-inset-bottom))]'
        )}>
            <PullToRefresh enabled={!isLogin}>
                {children}
            </PullToRefresh>
        </main>
    );
}
