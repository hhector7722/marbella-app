'use client';

import { usePathname } from 'next/navigation';
import BottomNavAdmin from './BottomNavAdmin';
import BottomNavStaff from './BottomNavStaff';

export default function BottomNavWrapper() {
    const pathname = usePathname();

    if (pathname === '/login') return null;

    if (pathname.startsWith('/staff')) {
        return <BottomNavStaff />;
    }

    // Por defecto mostramos Admin para dashboard, recipes, ingredients, profile, etc.
    // Esto evita que se mezclen iconos.
    return <BottomNavAdmin />;
}
