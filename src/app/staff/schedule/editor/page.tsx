'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Redirige a dashboard. El editor de horarios se usa ahora dentro del modal de Horarios.
 */
export default function ScheduleEditorRedirect() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const date = searchParams.get('date');

    useEffect(() => {
        if (date) {
            router.replace(`/staff/dashboard?schedule_date=${date}`);
        } else {
            router.replace('/staff/dashboard');
        }
    }, [router, date]);

    return (
        <div className="min-h-screen bg-[#5B8FB9] flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-4 border-white border-t-transparent animate-spin" />
        </div>
    );
}
