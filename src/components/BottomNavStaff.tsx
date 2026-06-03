'use client';

import { usePathname } from 'next/navigation';
import StaffBottomNav from '@/components/StaffBottomNav';

export default function BottomNavStaff() {
    const pathname = usePathname();

    if (pathname === '/login') return null;

    return <StaffBottomNav />;
}
