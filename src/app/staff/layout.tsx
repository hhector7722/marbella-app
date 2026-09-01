'use client';

import { usePathname } from 'next/navigation';
import { Toaster } from 'sonner';
import StaffBottomNav from '@/components/StaffBottomNav';

export default function StaffLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    /** Carta staff: pantalla completa como `/carta` (sin barra inferior ni padding extra). */
    const isStaffCartaFullscreen = pathname === '/staff/carta';
    /** Mismo shell que `/dashboard` y `/master/dashboard` (padding en `MainWrapper`, sin wrapper extra). */
    const isStaffDashboard = pathname === '/staff/dashboard';

    return (
        <>
            <Toaster position="top-center" richColors />
            {isStaffDashboard || isStaffCartaFullscreen ? (
                children
            ) : (
                <div className="staff-shell-pad pb-[calc(var(--shell-bottom-inset)+var(--espacio-2))]">
                    {children}
                </div>
            )}
            {!isStaffCartaFullscreen ? <StaffBottomNav /> : null}
        </>
    );
}
