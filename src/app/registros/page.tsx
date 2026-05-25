'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

/**
 * Asistencia unificada: la vista de registros y plantilla vive en /staff/history.
 * Redirect para no romper enlaces antiguos (dashboard admin, etc.).
 */
export default function RegistrosRedirectPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/staff/history');
    }, [router]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#5B8FB9]">
            <LoadingSpinner size="lg" className="text-white" />
        </div>
    );
}
