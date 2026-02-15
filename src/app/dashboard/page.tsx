'use client';

import { useEffect, useState } from 'react';
import { createClient } from "@/utils/supabase/client";
import { useRouter } from 'next/navigation';
import DashboardSwitcher from '@/components/dashboards/DashboardSwitcher';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

export default function AdminDashboardPage() {
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
                    // Si no es manager ni supervisor, redirigir al staff dashboard
                    if (profile.role !== 'manager' && profile.role !== 'supervisor') {
                        router.replace('/staff/dashboard');
                    }
                }
            } else {
                router.replace('/login');
            }
            setLoading(false);
        };
        fetchUser();
    }, [router, supabase]);

    if (loading) return (
        <div className="min-h-screen bg-[#5B8FB9] flex items-center justify-center">
            <LoadingSpinner size="xl" className="text-white" />
        </div>
    );

    return <DashboardSwitcher userRole={userRole || 'staff'} initialView="admin" />;
}