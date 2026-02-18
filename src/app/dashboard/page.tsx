import { redirect } from 'next/navigation';
import { createClient } from "@/utils/supabase/server";
import DashboardSwitcher from '@/components/dashboards/DashboardSwitcher';
import { getDashboardData } from '@/app/actions/get-dashboard-data';

export default async function AdminDashboardPage() {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect('/login');
    }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();

    if (profile) {
        // Redirect logic moved to server side
        if (profile.role !== 'manager' && profile.role !== 'supervisor') {
            redirect('/staff/dashboard');
        }
    }

    // Fetch dashboard data on the server
    const dashboardData = await getDashboardData();

    return <DashboardSwitcher userRole={profile?.role || 'staff'} initialView="admin" initialData={dashboardData} />;
}