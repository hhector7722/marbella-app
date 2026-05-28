'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import BottomNavStaff from './BottomNavStaff';

export default function BottomNavWrapper() {
    const pathname = usePathname();
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    if (!mounted) return null;

    if (pathname === '/login') return null;
    if (pathname === '/carta') return null;
    if (pathname === '/staff/carta') return null;
    if (pathname === '/dashboard/carta') return null;

    // Portal a <body> para blindar el `fixed` ante wrappers con transform/overflow/contain
    return createPortal(<BottomNavStaff />, document.body);
}
