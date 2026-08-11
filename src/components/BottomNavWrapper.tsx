'use client';

import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import BottomNavStaff from './BottomNavStaff';
import { isFullscreenCartaPath } from '@/lib/carta-fullscreen-path';

export default function BottomNavWrapper() {
    const pathname = usePathname();
    if (typeof document === 'undefined') return null;

    if (pathname === '/login') return null;
    if (isFullscreenCartaPath(pathname)) return null;
    // Rutas /staff/* usan la barra inferior de src/app/staff/layout.tsx
    if (pathname.startsWith('/staff')) return null;
    if (pathname.startsWith('/reporte')) return null;
    if (pathname.startsWith('/playground')) return null;

    // Portal a <body> para blindar el `fixed` ante wrappers con transform/overflow/contain
    return createPortal(<BottomNavStaff />, document.body);
}
