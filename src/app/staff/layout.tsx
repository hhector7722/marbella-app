'use client';

import { usePathname } from 'next/navigation';
import { Toaster } from 'sonner';
import { cn } from '@/lib/utils';
import StaffBottomNav from '@/components/StaffBottomNav';

export default function StaffLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    /** Carta staff: pantalla completa como `/carta` (sin barra inferior ni padding extra). */
    const isStaffCartaFullscreen = pathname === '/staff/carta';

    return (
        <>
            <Toaster position="top-center" richColors />
            <div
                className={cn(
                    isStaffCartaFullscreen
                        ? 'min-h-screen bg-white'
                        : 'min-h-screen pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-[calc(4rem+env(safe-area-inset-bottom))]'
                )}
            >
                {children}
            </div>
            {!isStaffCartaFullscreen ? <StaffBottomNav /> : null}
        </>
    );
}
