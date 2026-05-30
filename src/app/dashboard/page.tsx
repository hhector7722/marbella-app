import { redirect } from 'next/navigation';
import { createClient } from "@/utils/supabase/server";
import DashboardSwitcher from '@/components/dashboards/DashboardSwitcher';
import { getDashboardData } from '@/app/actions/get-dashboard-data';

export default async function AdminDashboardPage() {
    const supabase = await createClient();

    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;

    if (!user) {
        redirect('/login');
    }

    const { data: profile } = await supabase.from('profiles').select('role, email').eq('id', user.id).single();

    if (profile) {
        // Redirect logic moved to server side
        if (profile.role !== 'manager') {
            redirect('/staff/dashboard');
        }
    }

    const email = profile?.email ?? user.email ?? '';

    // Fetch dashboard data on the server
    const dashboardData = await getDashboardData();

    return (
        <DashboardSwitcher
            userRole={profile?.role || 'staff'}
            userEmail={email}
            initialView="admin"
            initialData={dashboardData}
        />
    );
}