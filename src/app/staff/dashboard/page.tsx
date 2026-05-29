import { redirect } from 'next/navigation';
import { createClient } from "@/utils/supabase/server";
import DashboardSwitcher from '@/components/dashboards/DashboardSwitcher';

export default async function StaffDashboardPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect('/login');
    }

    const { data: profile } = await supabase.from('profiles').select('role, email').eq('id', user.id).single();

    const email = profile?.email ?? user.email ?? '';

    return <DashboardSwitcher userRole={profile?.role || 'staff'} userEmail={email} initialView="staff" />;
}
