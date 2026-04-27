'use client';

import { usePathname } from 'next/navigation';
import BottomNavStaff from './BottomNavStaff';

export default function BottomNavWrapper() {
    const pathname = usePathname();

    if (pathname === '/login') return null;
    if (pathname === '/carta') return null;

    // Usamos el menú de Staff para todos (Staff y Admin)
    return <BottomNavStaff />;
}
