'use client';

import { useEffect, useState } from 'react';
import { createClient } from "@/utils/supabase/client";
import { useRouter } from 'next/navigation';
import DashboardSwitcher from '@/components/dashboards/DashboardSwitcher';

export default function StaffDashboardPage() {
    const supabase = createClient();
    const router = useRouter();
    const [userRole, setUserRole] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
                if (profile) {
                    setUserRole(profile.role);
                    // No hay redirección aquí porque todos pueden ver el staff dashboard
                }
            } else {
                router.replace('/login');
            }
            setLoading(false);
        };
        fetchUser();
    }, [router, supabase]);

    if (loading) return (
        <div className="min-h-screen bg-[#F0F4F8] flex items-center justify-center">
            <div className="flex items-center gap-3 bg-white p-6 rounded-3xl shadow-xl">
                <div className="w-4 h-4 bg-[#36606F] animate-pulse rounded-full"></div>
                <span className="font-bold text-[#36606F]">Cargando Dashboard...</span>
            </div>
        </div>
    );

    return <DashboardSwitcher userRole={userRole || 'staff'} initialView="staff" />;
}
