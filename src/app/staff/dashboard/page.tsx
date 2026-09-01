import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from "@/utils/supabase/server";
import DashboardSwitcher from '@/components/dashboards/DashboardSwitcher';
import { withTimeout } from '@/lib/with-timeout';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { resolveSessionUser } from '@/lib/auth/resolve-session-user';

async function StaffDashboardContent() {
    const supabase = await createClient();
    const user = await resolveSessionUser(supabase, 2000);

    if (!user) {
        redirect('/login');
    }

    const profileResult = await withTimeout(
        (async () => {
            try {
                return await supabase
                    .from('profiles')
                    .select('role, email')
                    .eq('id', user.id)
                    .maybeSingle();
            } catch {
                return { data: null, error: null };
            }
        })(),
        2000,
        { data: null, error: null },
    );

    const profile = profileResult.data;
    const email = profile?.email ?? user.email ?? '';

    return (
        <DashboardSwitcher
            userRole={profile?.role || 'staff'}
            userEmail={email}
            initialView="staff"
        />
    );
}

export default function StaffDashboardPage() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-[50dvh] items-center justify-center">
                    <LoadingSpinner size="xl" className="text-white" />
                </div>
            }
        >
            <StaffDashboardContent />
        </Suspense>
    );
}
