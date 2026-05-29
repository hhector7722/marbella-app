import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import DashboardSwitcher from '@/components/dashboards/DashboardSwitcher';
import { getDashboardData } from '@/app/actions/get-dashboard-data';
import { isMasterDashboardUser } from '@/lib/master-dashboard';

export default async function MasterDashboardPage() {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect('/login');
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role, email')
        .eq('id', user.id)
        .single();

    const email = profile?.email ?? user.email ?? '';

    if (!isMasterDashboardUser(email)) {
        redirect('/dashboard');
    }

    if (profile?.role !== 'manager') {
        redirect('/staff/dashboard');
    }

    const dashboardData = await getDashboardData();

    return (
        <DashboardSwitcher
            userRole={profile?.role || 'staff'}
            userEmail={email}
            initialView="master"
            initialData={dashboardData}
        />
    );
}
