'use client';

import { usePathname } from 'next/navigation';
import BottomNavStaff from './BottomNavStaff';
import { useNavigationFeedbackOptional } from '@/lib/navigation/navigation-context';
import { shouldShowAppChrome } from '@/lib/app-chrome';

export default function BottomNavWrapper() {
    const pathname = usePathname();
    const { isLoading } = useNavigationFeedbackOptional();

    if (!shouldShowAppChrome(pathname, isLoading)) return null;

    return <BottomNavStaff />;
}
